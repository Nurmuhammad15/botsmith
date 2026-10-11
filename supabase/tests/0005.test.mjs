import { boot, migration as mig, as, check, summary, eq, truthy, rejects, sp } from "./harness.mjs";

const U = {
  seller: "11111111-1111-1111-1111-111111111111",
  buyer: "22222222-2222-2222-2222-222222222222",
  admin: "33333333-3333-3333-3333-333333333333",
  other: "44444444-4444-4444-4444-444444444444",
};

const db = await boot({
  migrations: [
    "0001_marketplace.sql",
    "0002_media_chat_favorites.sql",
    "0003_payments.sql",
    "0004_withdrawal_card_privacy.sql",
    "0005_review_fixes.sql",
  ].map(mig),
});

for (const [id, email, role] of [
  [U.seller, "seller@x.uz", "seller"],
  [U.buyer, "buyer@x.uz", "buyer"],
  [U.admin, "admin@x.uz", "buyer"],
  [U.other, "other@x.uz", "buyer"],
]) {
  await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [
    id,
    email,
    JSON.stringify({ role, full_name: email }),
  ]);
}
await db.query(`update public.profiles set role='admin' where id=$1`, [U.admin]);

const mkBot = async (price = 1_500_000, status = "published") =>
  (
    await db.query(
      `insert into public.bots (seller_id,title,description,price,category,status)
       values ($1,'Bot','d',$2,'shop',$3) returning id`,
      [U.seller, price, status],
    )
  ).rows[0].id;
const mkOrder = async (bot, amount = 1_500_000) =>
  (
    await db.query(
      `insert into public.orders (bot_id,bot_title,buyer_id,seller_id,amount) values ($1,'Bot',$2,$3,$4) returning id`,
      [bot, U.buyer, U.seller, amount],
    )
  ).rows[0].id;
const svc = (sql, params) =>
  as(db, "service", async (tx) => (await tx.query(sql, params)).rows[0].r, { commit: true });
const now = () => Date.now();

console.log("\n1. refunds vs withdrawals");
await check("a refund that would make the seller's balance negative is refused", async () => {
  const bot = await mkBot();
  const order = await mkOrder(bot);
  await svc(`select public.payme_create_transaction('t1',$1,150000000,$2) r`, [now(), order]);
  await svc(`select public.payme_perform_transaction('t1') r`);
  await as(
    db,
    U.seller,
    (tx) =>
      tx.query(`select * from public.request_withdrawal(1000000,'8600123412341234','Sotuvchi')`),
    { commit: true },
  );
  eq(await svc(`select public.payme_cancel_transaction('t1', 5) r`), { error: "cannot_cancel" });
  eq(
    (await db.query(`select status from public.orders where id=$1`, [order])).rows[0].status,
    "paid",
  );
  await as(db, U.seller, async (tx) => {
    const w = await tx.query(`select balance from public.my_wallet()`);
    truthy(Number(w.rows[0].balance) >= 0, "balance must stay non-negative");
  });
});
await check("a refund the balance can absorb still works", async () => {
  const bot = await mkBot(600_000);
  const order = await mkOrder(bot, 600_000);
  await svc(`select public.payme_create_transaction('t2',$1,60000000,$2) r`, [now(), order]);
  await svc(`select public.payme_perform_transaction('t2') r`);
  const r = await svc(`select public.payme_cancel_transaction('t2', 5) r`);
  eq(r.tx.state, -2);
});

console.log("\n2. files unlock at delivery, when refunds close");
await check("a paid (not yet delivered) order gives no file access; delivering does", async () => {
  const bot = await mkBot(1000);
  await db.query(
    `insert into public.bot_files (bot_id,path,file_name,size_bytes) values ($1,$2,'a.zip',1)`,
    [bot, `${U.seller}/${bot}/a.zip`],
  );
  await db.query(`insert into storage.objects (bucket_id,name) values ('bot-files',$1)`, [
    `${U.seller}/${bot}/a.zip`,
  ]);
  const order = await mkOrder(bot, 1000);
  const counts = () =>
    as(db, U.buyer, async (tx) => ({
      rows: (await tx.query(`select count(*)::int c from public.bot_files where bot_id=$1`, [bot]))
        .rows[0].c,
      objects: (
        await tx.query(
          `select count(*)::int c from storage.objects where bucket_id='bot-files' and name like $1`,
          [`%/${bot}/%`],
        )
      ).rows[0].c,
    }));
  eq(await counts(), { rows: 0, objects: 0 });
  await db.query(`update public.orders set status='paid' where id=$1`, [order]);
  eq(await counts(), { rows: 0, objects: 0 });
  await db.query(`update public.orders set status='delivering' where id=$1`, [order]);
  eq(await counts(), { rows: 1, objects: 1 });
  await db.query(`update public.orders set status='done' where id=$1`, [order]);
  eq(await counts(), { rows: 1, objects: 1 });
});

console.log("\n3. media moderation");
const path = (bot, n) => `${U.seller}/${bot}/${n}`;
await check("NULL elements in the image list are rejected (no moderation bypass)", async () => {
  const bot = await mkBot();
  await db.query(`update public.bots set image_paths=$2 where id=$1`, [bot, [path(bot, "ok.png")]]);
  await as(db, U.seller, async (tx) => {
    await rejects(
      () => sp(tx, `select public.set_bot_images($1, array[null]::text[])`, [bot]),
      "invalid_path",
    );
    await tx.query(`select public.set_bot_images($1,$2)`, [bot, [path(bot, "evil.png")]]);
    eq(
      (await tx.query(`select status from public.bots where id=$1`, [bot])).rows[0].status,
      "pending",
    );
  });
});
await check(
  "an approved cover cannot be swapped by deleting and re-uploading the same object",
  async () => {
    const bot = await mkBot();
    const name = path(bot, "approved.png");
    await db.query(`update public.bots set image_paths=$2 where id=$1`, [bot, [name]]);
    await db.query(`insert into storage.objects (bucket_id,name) values ('bot-covers',$1)`, [name]);
    await as(db, U.seller, async (tx) => {
      eq(
        (
          await tx.query(
            `delete from storage.objects where bucket_id='bot-covers' and name=$1 returning 1`,
            [name],
          )
        ).rows.length,
        1,
      );
      await rejects(
        () =>
          sp(tx, `insert into storage.objects (bucket_id,name) values ('bot-covers',$1)`, [name]),
        "row-level security",
      );
      // a fresh name is fine
      await tx.query(`insert into storage.objects (bucket_id,name) values ('bot-covers',$1)`, [
        path(bot, "fresh.png"),
      ]);
    });
  },
);
await check("object counts per bot are capped (10 covers, 15 files)", async () => {
  const bot = await mkBot();
  await as(db, U.seller, async (tx) => {
    for (let i = 0; i < 10; i++)
      await tx.query(`insert into storage.objects (bucket_id,name) values ('bot-covers',$1)`, [
        path(bot, `c${i}.png`),
      ]);
    await rejects(
      () =>
        sp(tx, `insert into storage.objects (bucket_id,name) values ('bot-covers',$1)`, [
          path(bot, "c10.png"),
        ]),
      "row-level security",
    );
    for (let i = 0; i < 15; i++)
      await tx.query(`insert into storage.objects (bucket_id,name) values ('bot-files',$1)`, [
        path(bot, `f${i}.zip`),
      ]);
    await rejects(
      () =>
        sp(tx, `insert into storage.objects (bucket_id,name) values ('bot-files',$1)`, [
          path(bot, "f15.zip"),
        ]),
      "row-level security",
    );
  });
});
await check("normal uploads and the earlier folder/ownership rules still apply", async () => {
  const bot = await mkBot();
  await as(db, U.other, async (tx) => {
    await rejects(
      () =>
        sp(tx, `insert into storage.objects (bucket_id,name) values ('bot-covers',$1)`, [
          path(bot, "x.png"),
        ]),
      "row-level security",
    );
  });
  await as(db, U.seller, async (tx) => {
    await tx.query(`insert into storage.objects (bucket_id,name) values ('bot-covers',$1)`, [
      path(bot, "a.png"),
    ]);
    await rejects(
      () =>
        sp(tx, `insert into storage.objects (bucket_id,name) values ('bot-covers',$1)`, [
          `${U.seller}/${bot}/deep/a.png`,
        ]),
      "row-level security",
    );
  });
});

console.log("\n4. view counter ignores the User-Agent");
await check("rotating the User-Agent from one address counts once", async () => {
  const bot = await mkBot();
  for (let i = 0; i < 20; i++) {
    await as(db, null, (tx) => tx.query(`select public.record_bot_view($1)`, [bot]), {
      commit: true,
      headers: { "x-forwarded-for": "9.9.9.9", "user-agent": `UA-${i}` },
    });
  }
  eq((await db.query(`select views from public.bots where id=$1`, [bot])).rows[0].views, 1);
  await as(db, null, (tx) => tx.query(`select public.record_bot_view($1)`, [bot]), {
    commit: true,
    headers: { "x-forwarded-for": "8.8.8.8" },
  });
  eq((await db.query(`select views from public.bots where id=$1`, [bot])).rows[0].views, 2);
});

console.log("\n5. reviews");
await check("the raw reviews table is private; the anonymised view still works", async () => {
  const bot = await mkBot();
  const order = await mkOrder(bot, 1000);
  await db.query(`update public.orders set status='paid' where id=$1`, [order]);
  await as(
    db,
    U.buyer,
    (tx) =>
      tx.query(
        `insert into public.reviews (bot_id,buyer_id,rating,comment) values ($1,$2,5,'zo''r')`,
        [bot, U.buyer],
      ),
    { commit: true },
  );
  await as(db, U.buyer, async (tx) =>
    eq(
      (await tx.query(`select count(*)::int c from public.reviews where bot_id=$1`, [bot])).rows[0]
        .c,
      1,
    ),
  );
  await as(db, U.other, async (tx) =>
    eq(
      (await tx.query(`select count(*)::int c from public.reviews where bot_id=$1`, [bot])).rows[0]
        .c,
      0,
    ),
  );
  await as(db, null, async (tx) => {
    const r = await tx.query(`select reviewer, rating from public.bot_reviews where bot_id=$1`, [
      bot,
    ]);
    eq(r.rows.length, 1);
    eq(Object.keys(r.rows[0]).includes("buyer_id"), false);
  });
});
await check("clients cannot pick created_at on reviews or support messages", async () => {
  const bot = await mkBot();
  const order = await mkOrder(bot, 1000);
  await db.query(`update public.orders set status='paid' where id=$1`, [order]);
  await as(db, U.buyer, async (tx) => {
    await rejects(
      () =>
        sp(
          tx,
          `insert into public.reviews (bot_id,buyer_id,rating,created_at) values ($1,$2,4,'2000-01-01')`,
          [bot, U.buyer],
        ),
      "permission denied",
    );
    await rejects(
      () =>
        sp(
          tx,
          `insert into public.support_messages (thread_user_id,sender_id,body,created_at) values ($1,$1,'x','2000-01-01')`,
          [U.buyer],
        ),
      "permission denied",
    );
  });
});

console.log("\n6. limits");
await check("long profile names are truncated at signup and capped on update", async () => {
  const id = "55555555-5555-5555-5555-555555555555";
  await db.query(
    `insert into auth.users (id,email,raw_user_meta_data) values ($1,'long@x.uz',$2)`,
    [id, JSON.stringify({ full_name: "x".repeat(5000), phone: "9".repeat(500) })],
  );
  const r = await db.query(
    `select char_length(full_name) n, char_length(phone) p from public.profiles where id=$1`,
    [id],
  );
  eq([r.rows[0].n, r.rows[0].p], [80, 30]);
  await as(db, id, async (tx) => {
    await rejects(
      () => sp(tx, `update public.profiles set full_name=$2 where id=$1`, [id, "y".repeat(81)]),
      "violates check",
    );
  });
});
await check("a seller cannot create more than 100 bots, or huge language lists", async () => {
  const id = "66666666-6666-6666-6666-666666666666";
  await db.query(
    `insert into auth.users (id,email,raw_user_meta_data) values ($1,'many@x.uz','{"role":"seller","full_name":"M"}')`,
    [id],
  );
  await db.query(
    `insert into public.bots (seller_id,title,description,price,category) select $1,'Bot '||g,'d',1000,'shop' from generate_series(1,100) g`,
    [id],
  );
  await as(db, id, async (tx) => {
    await rejects(
      () =>
        sp(
          tx,
          `insert into public.bots (seller_id,title,description,price,category) values ($1,'One more','d',1000,'shop')`,
          [id],
        ),
      "row-level security",
    );
  });
  await as(db, U.seller, async (tx) => {
    await rejects(
      () =>
        sp(
          tx,
          `insert into public.bots (seller_id,title,description,price,category,languages) values ($1,'L','d',1000,'shop',$2)`,
          [U.seller, Array.from({ length: 50 }, (_, i) => `l${i}`)],
        ),
      "violates check",
    );
  });
});
await check("support messages are rate limited", async () => {
  await as(db, U.buyer, async (tx) => {
    for (let i = 0; i < 30; i++)
      await tx.query(
        `insert into public.support_messages (thread_user_id,sender_id,body) values ($1,$1,$2)`,
        [U.buyer, `m${i}`],
      );
    await rejects(
      () =>
        sp(
          tx,
          `insert into public.support_messages (thread_user_id,sender_id,body) values ($1,$1,'spam')`,
          [U.buyer],
        ),
      "rate_limited",
    );
  });
});

summary();
