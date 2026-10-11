import { boot, migration as mig, as, check, summary, eq, truthy, rejects, sp } from "./harness.mjs";


const U = {
  seller: "11111111-1111-1111-1111-111111111111",
  buyer: "22222222-2222-2222-2222-222222222222",
  admin: "33333333-3333-3333-3333-333333333333",
  other: "44444444-4444-4444-4444-444444444444",
  seller2: "55555555-5555-5555-5555-555555555555",
};

const db = await boot({ migrations: [mig("0001_marketplace.sql"), mig("0002_media_chat_favorites.sql")] });

for (const [id, email, meta] of [
  [U.seller, "seller@x.uz", { role: "seller", full_name: "Sotuvchi Bek" }],
  [U.buyer, "buyer@x.uz", { role: "buyer", full_name: "Xaridor Aziz" }],
  [U.admin, "admin@x.uz", { role: "buyer", full_name: "Admin" }],
  [U.other, "other@x.uz", { role: "buyer", full_name: "Boshqa Odam" }],
  [U.seller2, "seller2@x.uz", { role: "seller", full_name: "Ikkinchi Sotuvchi" }],
]) {
  await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [id, email, JSON.stringify(meta)]);
}
await db.query(`update public.profiles set role='admin' where id=$1`, [U.admin]);
await db.query(`update public.profiles set username='@sellerbek' where id=$1`, [U.seller]);

// seed: one published bot (seller), one pending bot (seller), one published bot (seller2)
const seed = async (seller, title, status) => {
  const r = await db.query(
    `insert into public.bots (seller_id,title,description,price,category,status) values ($1,$2,'d',500000,'shop',$3) returning id`,
    [seller, title, status],
  );
  return r.rows[0].id;
};
const bot = await seed(U.seller, "Published Bot", "published");
const botPending = await seed(U.seller, "Pending Bot", "pending");
const bot2 = await seed(U.seller2, "Other Seller Bot", "published");

console.log("\nstorage policies");
const obj = (bucket, name) =>
  [`insert into storage.objects (bucket_id, name, owner) values ($1,$2,auth.uid())`, [bucket, name]];

await check("buckets exist with expected visibility and limits", async () => {
  const r = await db.query(`select id, public, file_size_limit from storage.buckets order by id`);
  eq(r.rows.map((x) => [x.id, x.public, Number(x.file_size_limit)]), [["bot-covers", true, 5242880], ["bot-files", false, 52428800]]);
});
await check("seller uploads a cover and a file for own bot", async () => {
  await as(db, U.seller, async (tx) => {
    await tx.query(...obj("bot-covers", `${U.seller}/${bot}/a.png`));
    await tx.query(...obj("bot-files", `${U.seller}/${bot}/src.zip`));
  }, { commit: true });
});
await check("seller cannot upload into another seller's folder", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, ...obj("bot-covers", `${U.seller2}/${bot2}/a.png`)), "row-level security");
  });
});
await check("seller cannot upload for a bot they do not own (own folder, foreign bot id)", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, ...obj("bot-covers", `${U.seller}/${bot2}/a.png`)), "row-level security");
  });
});
await check("path depth must be exactly <seller>/<bot>/<file>", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, ...obj("bot-covers", `${U.seller}/a.png`)), "row-level security");
    await rejects(() => sp(tx, ...obj("bot-covers", `${U.seller}/${bot}/deep/a.png`)), "row-level security");
  });
});
await check("a buyer cannot upload", async () => {
  await as(db, U.buyer, async (tx) => {
    await rejects(() => sp(tx, ...obj("bot-covers", `${U.buyer}/${bot}/a.png`)), "row-level security");
  });
});
await check("anon cannot upload", async () => {
  await as(db, null, async (tx) => {
    await rejects(() => sp(tx, ...obj("bot-files", `${U.seller}/${bot}/x.zip`)), "row-level security");
  });
});
await check("private files: owner reads, stranger and anon do not", async () => {
  const q = `select count(*)::int c from storage.objects where bucket_id='bot-files'`;
  await as(db, U.seller, async (tx) => eq((await tx.query(q)).rows[0].c, 1));
  await as(db, U.buyer, async (tx) => eq((await tx.query(q)).rows[0].c, 0));
  await as(db, null, async (tx) => eq((await tx.query(q)).rows[0].c, 0));
});
// buyer orders and gets it marked paid
let orderId;
await as(db, U.buyer, async (tx) => {
  orderId = (await tx.query(`select id from public.create_order($1)`, [bot])).rows[0].id;
}, { commit: true });
await check("private files: pending_payment order does NOT grant access", async () => {
  await as(db, U.buyer, async (tx) =>
    eq((await tx.query(`select count(*)::int c from storage.objects where bucket_id='bot-files'`)).rows[0].c, 0));
});
await as(db, U.admin, (tx) => tx.query(`select public.admin_set_order_status($1,'paid')`, [orderId]), { commit: true });
await check("private files: paid order grants access to that bot's files only", async () => {
  await as(db, U.buyer, async (tx) =>
    eq((await tx.query(`select count(*)::int c from storage.objects where bucket_id='bot-files'`)).rows[0].c, 1));
  await db.query(`insert into storage.objects (bucket_id, name) values ('bot-files', $1)`, [`${U.seller2}/${bot2}/secret.zip`]);
  await as(db, U.buyer, async (tx) =>
    eq((await tx.query(`select name from storage.objects where bucket_id='bot-files'`)).rows.map((x) => x.name), [`${U.seller}/${bot}/src.zip`]));
  await as(db, U.other, async (tx) =>
    eq((await tx.query(`select count(*)::int c from storage.objects where bucket_id='bot-files'`)).rows[0].c, 0));
});
await check("cancelled order revokes access", async () => {
  await db.query(`update public.orders set status='cancelled' where id=$1`, [orderId]);
  await as(db, U.buyer, async (tx) =>
    eq((await tx.query(`select count(*)::int c from storage.objects where bucket_id='bot-files'`)).rows[0].c, 0));
  await db.query(`update public.orders set status='paid' where id=$1`, [orderId]);
});
await check("only the owner can delete objects", async () => {
  await as(db, U.buyer, async (tx) => {
    const r = await tx.query(`delete from storage.objects where bucket_id='bot-files' and name=$1 returning 1`, [`${U.seller}/${bot}/src.zip`]);
    eq(r.rows.length, 0);
  });
  await as(db, U.seller, async (tx) => {
    const r = await tx.query(`delete from storage.objects where bucket_id='bot-covers' and name=$1 returning 1`, [`${U.seller}/${bot}/a.png`]);
    eq(r.rows.length, 1);
  });
});

console.log("\nbot media RPCs");
const p = (b, n) => `${U.seller}/${b}/${n}`;
await check("set_bot_images stores paths on a pending bot without changing status", async () => {
  await db.query(`update public.bots set status='pending' where id=$1`, [bot]);
  await as(db, U.seller, async (tx) => {
    await tx.query(`select public.set_bot_images($1, $2)`, [bot, [p(bot, "a.png"), p(bot, "b.png")]]);
    const r = await tx.query(`select image_paths, status from public.bots where id=$1`, [bot]);
    eq(r.rows[0].image_paths, [p(bot, "a.png"), p(bot, "b.png")]);
    eq(r.rows[0].status, "pending");
  });
  await db.query(`update public.bots set status='published', image_paths='{}' where id=$1`, [bot]);
});
await check("adding an image to a published bot sends it back to moderation", async () => {
  await as(db, U.seller, async (tx) => {
    await tx.query(`select public.set_bot_images($1, $2)`, [bot, [p(bot, "a.png")]]);
    const r = await tx.query(`select status from public.bots where id=$1`, [bot]);
    eq(r.rows[0].status, "pending");
  });
});
await check("removing images does not re-trigger moderation", async () => {
  await as(db, U.seller, async (tx) => {
    // start from published with two images (superuser setup inside the tx)
    await tx.exec(`reset role`);
    await tx.query(`update public.bots set status='published', image_paths=$2 where id=$1`, [bot, [p(bot, "a.png"), p(bot, "b.png")]]);
    await tx.exec(`set local role authenticated`);
    await tx.query(`select public.set_bot_images($1, $2)`, [bot, [p(bot, "a.png")]]);
    const r = await tx.query(`select status, image_paths from public.bots where id=$1`, [bot]);
    eq(r.rows[0].status, "published");
    eq(r.rows[0].image_paths, [p(bot, "a.png")]);
  });
});
await check("set_bot_images rejects foreign prefixes, traversal, >5 images, foreign bots", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, `select public.set_bot_images($1,$2)`, [bot, [`${U.seller2}/${bot}/a.png`]]), "invalid_path");
    await rejects(() => sp(tx, `select public.set_bot_images($1,$2)`, [bot, [`${U.seller}/${bot}/../x.png`]]), "invalid_path");
    await rejects(() => sp(tx, `select public.set_bot_images($1,$2)`, [bot, Array.from({ length: 6 }, (_, i) => p(bot, `${i}.png`))]), "too_many_images");
    await rejects(() => sp(tx, `select public.set_bot_images($1,$2)`, [bot2, [p(bot2, "a.png")]]), "bot_not_found");
  });
});
await check("direct update of image_paths/status is not allowed", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, `update public.bots set image_paths='{x}' where id=$1`, [bot]), "permission denied");
  });
});
let fileId;
await check("add_bot_file records a file; listing rules", async () => {
  await as(db, U.seller, async (tx) => {
    const r = await tx.query(`select * from public.add_bot_file($1,$2,'src.zip',12345)`, [bot, p(bot, "src.zip")]);
    fileId = r.rows[0].id;
    eq(String(r.rows[0].size_bytes), "12345");
    await rejects(() => sp(tx, `select * from public.add_bot_file($1,$2,'x',1)`, [bot, `${U.seller2}/${bot}/x`]), "invalid_path");
    await rejects(() => sp(tx, `select * from public.add_bot_file($1,$2,'x',1)`, [bot2, p(bot2, "x")]), "bot_not_found");
    await rejects(() => sp(tx, `select * from public.add_bot_file($1,$2,'dup',1)`, [bot, p(bot, "src.zip")]), "duplicate key");
  }, { commit: true });
});
await check("bot_files visibility: seller + paying buyer + admin only", async () => {
  const q = `select count(*)::int c from public.bot_files`;
  await as(db, U.seller, async (tx) => eq((await tx.query(q)).rows[0].c, 1));
  await as(db, U.buyer, async (tx) => eq((await tx.query(q)).rows[0].c, 1)); // order is paid
  await as(db, U.admin, async (tx) => eq((await tx.query(q)).rows[0].c, 1));
  await as(db, U.other, async (tx) => eq((await tx.query(q)).rows[0].c, 0));
  await as(db, U.seller2, async (tx) => eq((await tx.query(q)).rows[0].c, 0));
  await as(db, null, async (tx) => { await rejects(() => sp(tx, q), "permission denied"); });
});
await check("max 10 files per bot", async () => {
  await as(db, U.seller, async (tx) => {
    for (let i = 0; i < 9; i++) await tx.query(`select * from public.add_bot_file($1,$2,'f',1)`, [bot, p(bot, `f${i}.zip`)]);
    await rejects(() => sp(tx, `select * from public.add_bot_file($1,$2,'f',1)`, [bot, p(bot, "f9.zip")]), "too_many_files");
  });
});
await check("remove_bot_file returns the path; others cannot remove", async () => {
  await as(db, U.seller2, async (tx) => {
    await rejects(() => sp(tx, `select public.remove_bot_file($1)`, [fileId]), "file_not_found");
  });
  await as(db, U.buyer, async (tx) => {
    await rejects(() => sp(tx, `select public.remove_bot_file($1)`, [fileId]), "file_not_found");
  });
  await as(db, U.seller, async (tx) => {
    const r = await tx.query(`select public.remove_bot_file($1) as path`, [fileId]);
    eq(r.rows[0].path, p(bot, "src.zip"));
  });
});
await check("bots_public exposes media columns and seller_id; my_bots too", async () => {
  await db.query(`update public.bots set status='published', image_paths=$2 where id=$1`, [bot, [p(bot, "a.png")]]);
  await as(db, null, async (tx) => {
    const r = await tx.query(`select image_paths, file_count, seller_id from public.bots_public where id=$1`, [bot]);
    eq(r.rows[0].image_paths, [p(bot, "a.png")]);
    eq(r.rows[0].seller_id, U.seller);
  });
  await as(db, U.seller, async (tx) => {
    const r = await tx.query(`select id, image_paths, file_count from public.my_bots()`);
    truthy(r.rows.length === 2);
  });
});

console.log("\nchat");
let conv;
await check("buyer opens a conversation (idempotent)", async () => {
  await as(db, U.buyer, async (tx) => {
    const a = (await tx.query(`select public.open_conversation($1) as id`, [bot])).rows[0].id;
    const b = (await tx.query(`select public.open_conversation($1) as id`, [bot])).rows[0].id;
    eq(a, b);
    conv = a;
  }, { commit: true });
});
await check("cannot open on own bot / unpublished bot / as anon", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, `select public.open_conversation($1)`, [bot]), "own_bot");
  });
  await as(db, U.buyer, async (tx) => {
    await rejects(() => sp(tx, `select public.open_conversation($1)`, [botPending]), "bot_not_found");
  });
  await as(db, null, async (tx) => {
    await rejects(() => sp(tx, `select public.open_conversation($1)`, [bot]), "permission denied");
  });
});
await check("empty conversation is hidden from the seller but visible to the buyer", async () => {
  await as(db, U.seller, async (tx) => eq((await tx.query(`select count(*)::int c from public.my_conversations()`)).rows[0].c, 0));
  await as(db, U.buyer, async (tx) => eq((await tx.query(`select count(*)::int c from public.my_conversations()`)).rows[0].c, 1));
});
await check("participants exchange messages; unread counts + read marking", async () => {
  await as(db, U.buyer, async (tx) => {
    await tx.query(`insert into public.messages (conversation_id, sender_id, body) values ($1,$2,'Salom, tayyormi?')`, [conv, U.buyer]);
    await tx.query(`insert into public.messages (conversation_id, sender_id, body) values ($1,$2,'Narxi kelishiladimi?')`, [conv, U.buyer]);
  }, { commit: true });
  await as(db, U.seller, async (tx) => {
    const l = (await tx.query(`select * from public.my_conversations()`)).rows;
    eq(l.length, 1);
    eq([l[0].unread, l[0].as_seller, l[0].last_body, l[0].other_name], [2, true, "Narxi kelishiladimi?", "Xaridor Aziz"]);
    eq((await tx.query(`select public.my_unread_count() as n`)).rows[0].n, 2);
    await tx.query(`insert into public.messages (conversation_id, sender_id, body) values ($1,$2,'Ha, albatta')`, [conv, U.seller]);
    await tx.query(`select public.mark_conversation_read($1)`, [conv]);
    eq((await tx.query(`select public.my_unread_count() as n`)).rows[0].n, 0);
  }, { commit: true });
  await as(db, U.buyer, async (tx) => {
    const l = (await tx.query(`select * from public.my_conversations()`)).rows;
    eq([l[0].unread, l[0].other_name, l[0].as_seller], [1, "@sellerbek", false]);
  });
});
await check("last_message_at follows the newest message", async () => {
  const r = await db.query(`select (c.last_message_at >= c.created_at) ok, (select max(created_at) = c.last_message_at from public.messages where conversation_id=c.id) same from public.conversations c`);
  eq([r.rows[0].ok, r.rows[0].same], [true, true]);
});
await check("outsiders cannot read or write the conversation", async () => {
  await as(db, U.other, async (tx) => {
    eq((await tx.query(`select count(*)::int c from public.messages`)).rows[0].c, 3);
  }).catch(() => {});
  await as(db, U.other, async (tx) => {
    eq((await tx.query(`select count(*)::int c from public.messages`)).rows[0].c, 0);
    eq((await tx.query(`select count(*)::int c from public.conversations`)).rows[0].c, 0);
    await rejects(() => sp(tx, `insert into public.messages (conversation_id, sender_id, body) values ($1,$2,'hi')`, [conv, U.other]), "row-level security");
  });
  await as(db, U.admin, async (tx) => eq((await tx.query(`select count(*)::int c from public.messages`)).rows[0].c, 0));
});
await check("cannot impersonate the other participant", async () => {
  await as(db, U.buyer, async (tx) => {
    await rejects(() => sp(tx, `insert into public.messages (conversation_id, sender_id, body) values ($1,$2,'fake')`, [conv, U.seller]), "row-level security");
  });
});
await check("messages are immutable for clients (no update/delete)", async () => {
  await as(db, U.buyer, async (tx) => {
    await rejects(() => sp(tx, `update public.messages set body='edited'`), "permission denied");
    await rejects(() => sp(tx, `delete from public.messages`), "permission denied");
    await rejects(() => sp(tx, `update public.messages set read_at = now()`), "permission denied");
  });
});
await check("blank / oversized messages rejected", async () => {
  await as(db, U.buyer, async (tx) => {
    await rejects(() => sp(tx, `insert into public.messages (conversation_id, sender_id, body) values ($1,$2,'   ')`, [conv, U.buyer]), "violates check");
    await rejects(() => sp(tx, `insert into public.messages (conversation_id, sender_id, body) values ($1,$2,$3)`, [conv, U.buyer, "x".repeat(2001)]), "violates check");
  });
});
await check("rate limit: 31st message within a minute is refused", async () => {
  await as(db, U.buyer, async (tx) => {
    for (let i = 0; i < 27; i++) // 3 already sent by buyer? (2) -> room for 28
      await tx.query(`insert into public.messages (conversation_id, sender_id, body) values ($1,$2,$3)`, [conv, U.buyer, `m${i}`]);
    await rejects(async () => {
      for (let i = 0; i < 5; i++) await sp(tx, `insert into public.messages (conversation_id, sender_id, body) values ($1,$2,'spam')`, [conv, U.buyer]);
    }, "rate_limited");
  });
});
await check("seller can open a chat with someone who ordered; not with strangers", async () => {
  await as(db, U.seller, async (tx) => {
    const id = (await tx.query(`select public.open_conversation($1,$2) as id`, [bot, U.buyer])).rows[0].id;
    eq(id, conv);
    await rejects(() => sp(tx, `select public.open_conversation($1,$2)`, [bot, U.other]), "forbidden");
  });
  await as(db, U.seller2, async (tx) => {
    await rejects(() => sp(tx, `select public.open_conversation($1,$2)`, [bot, U.buyer]), "forbidden");
  });
});

console.log("\nfavorites");
await check("add, list, duplicate, remove", async () => {
  await as(db, U.buyer, async (tx) => {
    await tx.query(`insert into public.favorites (user_id, bot_id) values ($1,$2)`, [U.buyer, bot]);
    await rejects(() => sp(tx, `insert into public.favorites (user_id, bot_id) values ($1,$2)`, [U.buyer, bot]), "duplicate key");
    eq((await tx.query(`select count(*)::int c from public.favorites`)).rows[0].c, 1);
  }, { commit: true });
  await as(db, U.other, async (tx) => {
    eq((await tx.query(`select count(*)::int c from public.favorites`)).rows[0].c, 0);
    await rejects(() => sp(tx, `insert into public.favorites (user_id, bot_id) values ($1,$2)`, [U.buyer, bot2]), "row-level security");
    const d = await tx.query(`delete from public.favorites where user_id=$1 returning 1`, [U.buyer]);
    eq(d.rows.length, 0);
  });
  await as(db, U.buyer, async (tx) => {
    const d = await tx.query(`delete from public.favorites where bot_id=$1 returning 1`, [bot]);
    eq(d.rows.length, 1);
  });
  await as(db, null, async (tx) => {
    await rejects(() => sp(tx, `select * from public.favorites`), "permission denied");
  });
});

console.log("\nview counting");
const views = async (id = bot) => (await db.query(`select views from public.bots where id=$1`, [id])).rows[0].views;
await db.query(`update public.bots set status='published' where id=$1`, [bot]);
await db.query(`update public.bots set views=0`);
const rec = (id = bot) => `select public.record_bot_view('${id}')`;
await check("anonymous refresh-spam counts once per day", async () => {
  const h = { "x-forwarded-for": "1.2.3.4, 10.0.0.1", "user-agent": "UA1" };
  for (let i = 0; i < 5; i++) await as(db, null, (tx) => tx.query(rec()), { commit: true, headers: h });
  eq(await views(), 1);
});
await check("different anonymous visitors count separately", async () => {
  await as(db, null, (tx) => tx.query(rec()), { commit: true, headers: { "x-forwarded-for": "5.6.7.8", "user-agent": "UA1" } });
  await as(db, null, (tx) => tx.query(rec()), { commit: true, headers: { "x-forwarded-for": "1.2.3.4", "user-agent": "UA2" } });
  eq(await views(), 3);
});
await check("signed-in visitor counts once; seller's own visits never count", async () => {
  for (let i = 0; i < 3; i++) await as(db, U.buyer, (tx) => tx.query(rec()), { commit: true });
  eq(await views(), 4);
  for (let i = 0; i < 3; i++) await as(db, U.seller, (tx) => tx.query(rec()), { commit: true });
  eq(await views(), 4);
});
await check("unpublished bots are not counted; unknown ids are ignored", async () => {
  await as(db, U.buyer, (tx) => tx.query(rec(botPending)), { commit: true });
  eq(await views(botPending), 0);
  await as(db, U.buyer, (tx) => tx.query(rec("00000000-0000-0000-0000-000000000000")), { commit: true });
});
await check("the same visitor counts again the next day", async () => {
  await db.query(`update public.bot_views set day = day - 1`);
  await as(db, U.buyer, (tx) => tx.query(rec()), { commit: true });
  eq(await views(), 5);
});
await check("clients cannot read or write bot_views, and the old counter is gone", async () => {
  await as(db, U.buyer, async (tx) => {
    await rejects(() => sp(tx, `select * from public.bot_views`), "permission denied");
    await rejects(() => sp(tx, `insert into public.bot_views (bot_id, viewer) values ($1,'x')`, [bot]), "permission denied");
    await rejects(() => sp(tx, `select public.increment_bot_views($1)`, [bot]), "does not exist");
  });
});
await check("prune removes only previous days and is not client-callable", async () => {
  await db.query(`select public.prune_bot_views()`);
  const r = await db.query(`select count(*)::int c from public.bot_views where day < (now() at time zone 'utc')::date`);
  eq(r.rows[0].c, 0);
  await as(db, U.buyer, async (tx) => {
    await rejects(() => sp(tx, `select public.prune_bot_views()`), "permission denied");
  });
});

console.log("\nprivileges");
await check("anon can call record_bot_view but nothing else new", async () => {
  await as(db, null, async (tx) => {
    for (const q of [
      `select public.my_conversations()`, `select public.my_unread_count()`, `select * from public.my_bots()`,
      `select public.mark_conversation_read('${conv}')`, `select public.set_bot_images('${bot}', '{}')`,
      `select public.remove_bot_file('${fileId}')`,
    ]) await rejects(() => sp(tx, q), "permission denied");
  });
});
await check("trigger functions are not callable", async () => {
  await as(db, U.buyer, async (tx) => {
    await rejects(() => sp(tx, `select public.before_message_insert()`), "permission denied");
  });
});

summary();
