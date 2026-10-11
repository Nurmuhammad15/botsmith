import { boot, migration as mig, as, check, summary, eq, truthy, rejects, sp } from "./harness.mjs";


const U = {
  seller: "11111111-1111-1111-1111-111111111111",
  buyer: "22222222-2222-2222-2222-222222222222",
  admin: "33333333-3333-3333-3333-333333333333",
  other: "44444444-4444-4444-4444-444444444444",
  early: "55555555-5555-5555-5555-555555555555",
};

// A user that registered before the migration must be backfilled.
const pre = `insert into auth.users (id, email, raw_user_meta_data) values
  ('${U.early}', 'early@x.uz', '{"role":"seller","full_name":"Early Bird","phone":"+998"}');`;

const db = await boot({ migrations: [mig("0001_marketplace.sql")], preSql: pre });

const mkUser = (id, email, meta) =>
  db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [
    id,
    email,
    JSON.stringify(meta),
  ]);
await mkUser(U.seller, "seller@x.uz", { role: "seller", full_name: "Sotuvchi Bek", phone: "+998901" });
await mkUser(U.buyer, "buyer@x.uz", { role: "buyer", full_name: "Xaridor Aziz" });
await mkUser(U.admin, "admin@x.uz", { role: "admin", full_name: "Evil Admin" });
await mkUser(U.other, "other@x.uz", { role: "seller", full_name: "Boshqa Sotuvchi" });

console.log("\nprofiles");
await check("backfill created profile for pre-existing user", async () => {
  const r = await db.query(`select role, full_name from public.profiles where id=$1`, [U.early]);
  eq(r.rows[0], { role: "seller", full_name: "Early Bird" });
});
await check("signup metadata role=admin is downgraded to buyer", async () => {
  const r = await db.query(`select role from public.profiles where id=$1`, [U.admin]);
  eq(r.rows[0].role, "buyer");
});
// promote the admin out-of-band
await db.query(`update public.profiles set role='admin' where id=$1`, [U.admin]);

await check("user sees only own profile", async () => {
  await as(db, U.buyer, async (tx) => {
    const r = await tx.query(`select id from public.profiles`);
    eq(r.rows.map((x) => x.id), [U.buyer]);
  });
});
await check("admin sees all profiles", async () => {
  await as(db, U.admin, async (tx) => {
    const r = await tx.query(`select count(*)::int c from public.profiles`);
    eq(r.rows[0].c, 5);
  });
});
await check("user cannot change own role", async () => {
  await as(db, U.buyer, async (tx) => {
    await rejects(() => sp(tx, `update public.profiles set role='admin' where id=$1`, [U.buyer]), "permission denied");
  });
});
await check("user can update own name/bio/username", async () => {
  await as(db, U.seller, async (tx) => {
    await tx.query(`update public.profiles set full_name='X Y', bio='b', username='@dev_uz' where id=$1`, [U.seller]);
    const r = await tx.query(`select username from public.profiles where id=$1`, [U.seller]);
    eq(r.rows[0].username, "@dev_uz");
  });
});
await check("bad username format rejected", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, `update public.profiles set username='nope' where id=$1`, [U.seller]), "violates check");
  });
});
await check("anon cannot read profiles", async () => {
  await as(db, null, async (tx) => {
    await rejects(() => sp(tx, `select * from public.profiles`), "permission denied");
  });
});

console.log("\nbots");
let botId;
await check("seller inserts a bot -> pending, zero views", async () => {
  await as(
    db,
    U.seller,
    async (tx) => {
      const r = await tx.query(
        `insert into public.bots (seller_id,title,description,price,category) values ($1,'Shop Bot','desc',450000,'shop') returning id,status,views`,
        [U.seller],
      );
      botId = r.rows[0].id;
      eq([r.rows[0].status, r.rows[0].views], ["pending", 0]);
    },
    { commit: true },
  );
});
await check("seller cannot set status/views on insert", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(
      () => tx.query(`insert into public.bots (seller_id,title,description,price,category,status) values ($1,'T1','d',1000,'shop','published')`, [U.seller]),
      "permission denied",
    );
  });
});
await check("seller cannot insert as another seller", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(
      () => tx.query(`insert into public.bots (seller_id,title,description,price,category) values ($1,'T2','d',1000,'shop')`, [U.other]),
      "row-level security",
    );
  });
});
await check("buyer cannot insert a bot", async () => {
  await as(db, U.buyer, async (tx) => {
    await rejects(
      () => tx.query(`insert into public.bots (seller_id,title,description,price,category) values ($1,'T3','d',1000,'shop')`, [U.buyer]),
      "row-level security",
    );
  });
});
await check("seller cannot update bots directly", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, `update public.bots set status='published' where id=$1`, [botId]), "permission denied");
  });
});
await check("pending bot invisible in public view", async () => {
  await as(db, null, async (tx) => {
    const r = await tx.query(`select count(*)::int c from public.bots_public`);
    eq(r.rows[0].c, 0);
  });
});
await check("non-admin cannot publish", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, `select public.admin_set_bot_status($1,'published')`, [botId]), "forbidden");
  });
});
await check("anon cannot call admin_set_bot_status", async () => {
  await as(db, null, async (tx) => {
    await rejects(() => sp(tx, `select public.admin_set_bot_status($1,'published')`, [botId]), "permission denied");
  });
});
await as(db, U.admin, (tx) => tx.query(`select public.admin_set_bot_status($1,'published')`, [botId]), { commit: true });

await check("published bot visible to anon, price hidden", async () => {
  await as(db, null, async (tx) => {
    const r = await tx.query(`select title, price, seller_name, sales, review_count, rating from public.bots_public`);
    eq(r.rows.length, 1);
    eq(r.rows[0].price, null);
    eq(r.rows[0].seller_name, "Sotuvchi Bek");
  });
});
await check("authenticated sees price", async () => {
  await as(db, U.buyer, async (tx) => {
    const r = await tx.query(`select price from public.bots_public`);
    eq(String(r.rows[0].price), "450000");
  });
});
await check("anon cannot read the bots table", async () => {
  await as(db, null, async (tx) => {
    await rejects(() => sp(tx, `select * from public.bots`), "permission denied");
  });
});
await check("other users cannot read pending/others bots from table", async () => {
  await as(db, U.other, async (tx) => {
    const r = await tx.query(`select count(*)::int c from public.bots`);
    eq(r.rows[0].c, 0);
  });
});

console.log("\norders");
let orderId;
await check("create_order uses the DB price and is idempotent while pending", async () => {
  await as(
    db,
    U.buyer,
    async (tx) => {
      const a = await tx.query(`select * from public.create_order($1)`, [botId]);
      const b = await tx.query(`select * from public.create_order($1)`, [botId]);
      eq(String(a.rows[0].amount), "450000");
      eq(a.rows[0].id, b.rows[0].id);
      eq(a.rows[0].status, "pending_payment");
      orderId = a.rows[0].id;
    },
    { commit: true },
  );
});
await check("seller cannot buy own bot", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, `select * from public.create_order($1)`, [botId]), "own_bot");
  });
});
await check("anon cannot create orders", async () => {
  await as(db, null, async (tx) => {
    await rejects(() => sp(tx, `select * from public.create_order($1)`, [botId]), "permission denied");
  });
});
await check("order visibility: buyer + seller yes, other no", async () => {
  await as(db, U.buyer, async (tx) => eq((await tx.query(`select count(*)::int c from public.orders`)).rows[0].c, 1));
  await as(db, U.seller, async (tx) => eq((await tx.query(`select count(*)::int c from public.orders`)).rows[0].c, 1));
  await as(db, U.other, async (tx) => eq((await tx.query(`select count(*)::int c from public.orders`)).rows[0].c, 0));
});
await check("buyer cannot mark order paid", async () => {
  await as(db, U.buyer, async (tx) => {
    await rejects(() => sp(tx, `update public.orders set status='paid' where id=$1`, [orderId]), "permission denied");
    await rejects(() => sp(tx, `select public.admin_set_order_status($1,'paid')`, [orderId]), "forbidden");
  });
});
await check("seller cannot advance unpaid order", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, `select * from public.seller_advance_order($1,'done')`, [orderId]), "invalid_transition");
  });
});
await as(db, U.admin, (tx) => tx.query(`select public.admin_set_order_status($1,'paid')`, [orderId]), { commit: true });
await check("seller advances paid -> delivering -> done", async () => {
  await as(db, U.seller, async (tx) => {
    const a = await tx.query(`select * from public.seller_advance_order($1,'delivering')`, [orderId]);
    eq(a.rows[0].status, "delivering");
    const b = await tx.query(`select * from public.seller_advance_order($1,'done')`, [orderId]);
    eq(b.rows[0].status, "done");
  });
});
await check("another seller cannot advance the order", async () => {
  await as(db, U.other, async (tx) => {
    await rejects(() => sp(tx, `select * from public.seller_advance_order($1,'delivering')`, [orderId]), "order_not_found");
  });
});

console.log("\nreviews");
await check("buyer with paid order can review once", async () => {
  await as(db, U.buyer, async (tx) => {
    await tx.query(`insert into public.reviews (bot_id,buyer_id,rating,comment) values ($1,$2,5,'zo''r')`, [botId, U.buyer]);
    await rejects(
      () => tx.query(`insert into public.reviews (bot_id,buyer_id,rating,comment) values ($1,$2,4,'again')`, [botId, U.buyer]),
      "duplicate key",
    );
  });
});
await check("user without an order cannot review", async () => {
  await as(db, U.other, async (tx) => {
    await rejects(
      () => tx.query(`insert into public.reviews (bot_id,buyer_id,rating) values ($1,$2,5)`, [botId, U.other]),
      "row-level security",
    );
  });
});
await check("cannot review on behalf of another user", async () => {
  await as(db, U.other, async (tx) => {
    await rejects(
      () => tx.query(`insert into public.reviews (bot_id,buyer_id,rating) values ($1,$2,5)`, [botId, U.buyer]),
      "row-level security",
    );
  });
});

console.log("\nwallet / withdrawals");
// make the earnings large enough: another bot at 1,000,000 with paid order
let bot2;
await as(
  db,
  U.seller,
  async (tx) => {
    const r = await tx.query(
      `insert into public.bots (seller_id,title,description,price,category) values ($1,'Big Bot','d',1000000,'lead') returning id`,
      [U.seller],
    );
    bot2 = r.rows[0].id;
  },
  { commit: true },
);
await as(db, U.admin, (tx) => tx.query(`select public.admin_set_bot_status($1,'published')`, [bot2]), { commit: true });
await as(
  db,
  U.other,
  async (tx) => {
    // "other" is a seller but can still buy someone else's bot
    const r = await tx.query(`select * from public.create_order($1)`, [bot2]);
    await tx.query(`select 1`);
    globalThis.order2 = r.rows[0].id;
  },
  { commit: true },
);
await as(db, U.admin, (tx) => tx.query(`select public.admin_set_order_status($1,'paid')`, [globalThis.order2]), { commit: true });

await check("wallet totals: 450k + 1M earned", async () => {
  await as(db, U.seller, async (tx) => {
    const r = await tx.query(`select * from public.my_wallet()`);
    eq([String(r.rows[0].earned), String(r.rows[0].withdrawn), String(r.rows[0].balance)], ["1450000", "0", "1450000"]);
  });
});
await check("withdraw: too small", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, `select * from public.request_withdrawal(99999,'8600123412341234','A B')`), "amount_too_small");
  });
});
await check("withdraw: exceeds available (balance - 500k)", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, `select * from public.request_withdrawal(950001,'8600123412341234','A B')`), "amount_exceeds_available");
  });
});
await check("withdraw: invalid card", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, `select * from public.request_withdrawal(100000,'1234','A B')`), "invalid_card");
  });
});
await check("withdraw: buyer is not a seller", async () => {
  await as(db, U.buyer, async (tx) => {
    await rejects(() => sp(tx, `select * from public.request_withdrawal(100000,'8600123412341234','A B')`), "not_a_seller");
  });
});
await check("withdraw: ok -> fee 3%, balance drops, card spaces stripped", async () => {
  await as(db, U.seller, async (tx) => {
    const r = await tx.query(`select * from public.request_withdrawal(950000,'8600 1234 1234 1234','Sotuvchi Bek')`);
    eq([String(r.rows[0].fee), String(r.rows[0].payout), r.rows[0].card_number, r.rows[0].status], ["28500", "921500", "8600123412341234", "pending"]);
    const w = await tx.query(`select * from public.my_wallet()`);
    eq(String(w.rows[0].balance), "500000");
    await rejects(() => sp(tx, `select * from public.request_withdrawal(100000,'8600123412341234','A B')`), "amount_exceeds_available");
  }, { commit: true });
});
await check("rejecting a withdrawal frees the balance", async () => {
  const wid = (await db.query(`select id from public.withdrawals limit 1`)).rows[0].id;
  await as(db, U.admin, async (tx) => {
    await tx.query(`select public.admin_set_withdrawal_status($1,'rejected')`, [wid]);
  }, { commit: true });
  await as(db, U.seller, async (tx) => {
    const w = await tx.query(`select * from public.my_wallet()`);
    eq(String(w.rows[0].balance), "1450000");
  });
});
await check("other users cannot see withdrawals", async () => {
  await as(db, U.other, async (tx) => eq((await tx.query(`select count(*)::int c from public.withdrawals`)).rows[0].c, 0));
  await as(db, U.admin, async (tx) => eq((await tx.query(`select count(*)::int c from public.withdrawals`)).rows[0].c, 1));
});
await check("wallet_totals is not callable by clients", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(() => sp(tx, `select * from public.wallet_totals($1)`, [U.other]), "permission denied");
  });
});

console.log("\nsupport chat");
await check("user writes in own thread; cannot spoof staff or others' threads", async () => {
  await as(db, U.buyer, async (tx) => {
    await tx.query(`insert into public.support_messages (thread_user_id,sender_id,body) values ($1,$1,'salom')`, [U.buyer]);
    await rejects(() => sp(tx, `insert into public.support_messages (thread_user_id,sender_id,from_staff,body) values ($1,$1,true,'x')`, [U.buyer]), "row-level security");
    await rejects(() => sp(tx, `insert into public.support_messages (thread_user_id,sender_id,body) values ($1,$2,'x')`, [U.seller, U.buyer]), "row-level security");
  });
});
await check("admin replies as staff; user sees reply; other user does not", async () => {
  await as(db, U.admin, async (tx) => {
    await tx.query(`insert into public.support_messages (thread_user_id,sender_id,from_staff,body) values ($1,$2,true,'javob')`, [U.buyer, U.admin]);
  }, { commit: true });
  await as(db, U.buyer, async (tx) => eq((await tx.query(`select count(*)::int c from public.support_messages`)).rows[0].c, 1));
  await as(db, U.other, async (tx) => eq((await tx.query(`select count(*)::int c from public.support_messages`)).rows[0].c, 0));
});

console.log("\nviews counter (legacy)");
await check("increment_bot_views counts anon calls (known weakness, fixed in 0002)", async () => {
  await as(db, null, async (tx) => {
    await tx.query(`select public.increment_bot_views($1)`, [botId]);
    await tx.query(`select public.increment_bot_views($1)`, [botId]);
  }, { commit: true });
  const r = await db.query(`select views from public.bots where id=$1`, [botId]);
  eq(r.rows[0].views, 2);
});

summary();
