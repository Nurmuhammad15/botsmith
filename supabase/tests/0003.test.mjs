import { boot, migration as mig, as, check, summary, eq, truthy, rejects, sp } from "./harness.mjs";

const U = {
  seller: "11111111-1111-1111-1111-111111111111",
  buyer: "22222222-2222-2222-2222-222222222222",
  admin: "33333333-3333-3333-3333-333333333333",
};

const db = await boot({
  migrations: [
    mig("0001_marketplace.sql"),
    mig("0002_media_chat_favorites.sql"),
    mig("0003_payments.sql"),
  ],
});

for (const [id, email, meta] of [
  [U.seller, "seller@x.uz", { role: "seller", full_name: "Sotuvchi" }],
  [U.buyer, "buyer@x.uz", { role: "buyer", full_name: "Xaridor" }],
  [U.admin, "admin@x.uz", { role: "buyer", full_name: "Admin" }],
]) {
  await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [
    id,
    email,
    JSON.stringify(meta),
  ]);
}
await db.query(`update public.profiles set role='admin' where id=$1`, [U.admin]);

const PRICE = 450_000;
const TIYIN = PRICE * 100;
const bot = (
  await db.query(
    `insert into public.bots (seller_id,title,description,price,category,status)
     values ($1,'Shop Bot','d',$2,'shop','published') returning id`,
    [U.seller, PRICE],
  )
).rows[0].id;
const newOrder = async () =>
  (
    await db.query(
      `insert into public.orders (bot_id,bot_title,buyer_id,seller_id,amount)
       values ($1,'Shop Bot',$2,$3,$4) returning id`,
      [bot, U.buyer, U.seller, PRICE],
    )
  ).rows[0].id;
const orderStatus = async (id) =>
  (await db.query(`select status from public.orders where id=$1`, [id])).rows[0].status;
const NOW_MS = () => Date.now();

// All payment functions are server-only: call them as the service role.
const call = async (sql, params) =>
  as(db, "service", async (tx) => (await tx.query(sql, params)).rows[0].r, { commit: true });
const payme = {
  check: (order, amount) => call(`select public.payme_check_perform($1,$2) r`, [order, amount]),
  create: (id, time, amount, order) =>
    call(`select public.payme_create_transaction($1,$2,$3,$4) r`, [id, time, amount, order]),
  perform: (id) => call(`select public.payme_perform_transaction($1) r`, [id]),
  cancel: (id, reason) => call(`select public.payme_cancel_transaction($1,$2) r`, [id, reason]),
  get: (id) => call(`select public.payme_get_transaction($1) r`, [id]),
  statement: (from, to) => call(`select public.payme_statement($1,$2) r`, [from, to]),
};
const click = {
  prepare: (clickId, paydoc, order, amount) =>
    call(`select public.click_prepare($1,$2,$3,$4) r`, [clickId, paydoc, order, amount]),
  complete: (clickId, seq, order, amount, error = 0) =>
    call(`select public.click_complete($1,$2,$3,$4,$5) r`, [clickId, seq, order, amount, error]),
};

console.log("\nprivileges");
await check("browsers cannot run any payment function", async () => {
  const order = await newOrder();
  for (const who of [null, U.buyer, U.seller, U.admin]) {
    await as(db, who, async (tx) => {
      await rejects(
        () => sp(tx, `select public.payme_check_perform($1,$2)`, [order, TIYIN]),
        "permission denied",
      );
      await rejects(
        () => sp(tx, `select public.payme_perform_transaction('x')`),
        "permission denied",
      );
      await rejects(
        () => sp(tx, `select public.click_prepare('1','2',$1,$2)`, [order, TIYIN]),
        "permission denied",
      );
      await rejects(
        () => sp(tx, `select public.click_complete('1',1,$1,$2,0)`, [order, TIYIN]),
        "permission denied",
      );
    });
  }
});
await check("only admins can read payment transactions", async () => {
  const order = await newOrder();
  await payme.create("priv-tx", NOW_MS(), TIYIN, order);
  await as(db, U.admin, async (tx) =>
    eq(
      (await tx.query(`select count(*)::int c from public.payment_transactions`)).rows[0].c >= 1,
      true,
    ),
  );
  for (const who of [U.buyer, U.seller]) {
    await as(db, who, async (tx) =>
      eq((await tx.query(`select count(*)::int c from public.payment_transactions`)).rows[0].c, 0),
    );
  }
  await as(db, null, async (tx) => {
    await rejects(() => sp(tx, `select * from public.payment_transactions`), "permission denied");
  });
});

console.log("\nPayme: check + create");
await check("CheckPerformTransaction accepts a payable order with the right amount", async () => {
  const order = await newOrder();
  eq(await payme.check(order, TIYIN), { ok: true, title: "Shop Bot" });
});
await check("CheckPerformTransaction rejects wrong amount, unknown order, paid order", async () => {
  const order = await newOrder();
  eq(await payme.check(order, TIYIN + 100), { error: "invalid_amount" });
  eq(await payme.check("99999999-9999-9999-9999-999999999999", TIYIN), {
    error: "order_not_found",
  });
  await db.query(`update public.orders set status='paid' where id=$1`, [order]);
  eq(await payme.check(order, TIYIN), { error: "order_not_payable" });
});
let order1;
let tx1;
await check("CreateTransaction creates state 1 and is idempotent for the same id", async () => {
  order1 = await newOrder();
  const t = NOW_MS();
  const a = await payme.create("pay-1", t, TIYIN, order1);
  eq([a.tx.state, a.tx.provider_tx_id, Number(a.tx.amount_tiyin)], [1, "pay-1", TIYIN]);
  tx1 = a.tx;
  const b = await payme.create("pay-1", t, TIYIN, order1);
  eq(b.tx.id, a.tx.id);
  eq(await orderStatus(order1), "pending_payment");
});
await check(
  "CreateTransaction refuses a second active transaction for the same order",
  async () => {
    eq(await payme.create("pay-1b", NOW_MS(), TIYIN, order1), { error: "cannot_perform" });
  },
);
await check("CreateTransaction validates order, amount and state", async () => {
  const order = await newOrder();
  eq(await payme.create("pay-x1", NOW_MS(), TIYIN + 1, order), { error: "invalid_amount" });
  eq(await payme.create("pay-x2", NOW_MS(), TIYIN, "99999999-9999-9999-9999-999999999999"), {
    error: "order_not_found",
  });
  await db.query(`update public.orders set status='cancelled' where id=$1`, [order]);
  eq(await payme.create("pay-x3", NOW_MS(), TIYIN, order), { error: "order_not_payable" });
});

console.log("\nPayme: perform");
await check("PerformTransaction marks the order paid; repeating it is harmless", async () => {
  const a = await payme.perform("pay-1");
  eq(a.tx.state, 2);
  eq(await orderStatus(order1), "paid");
  const b = await payme.perform("pay-1");
  eq(b.tx.state, 2);
  eq(b.tx.performed_at, a.tx.performed_at);
});
await check("PerformTransaction on unknown id", async () => {
  eq(await payme.perform("nope"), { error: "tx_not_found" });
});
await check("a paid order credits the seller wallet", async () => {
  await as(db, U.seller, async (tx) => {
    const r = await tx.query(`select earned from public.my_wallet()`);
    const paid = await tx.query(
      `select coalesce(sum(amount),0)::bigint s from public.orders where status in ('paid','delivering','done')`,
    );
    eq(Number(r.rows[0].earned), Number(paid.rows[0].s)); // earnings == sum of paid orders
    truthy(Number(r.rows[0].earned) >= PRICE);
  });
});
await check("CheckTransaction / GetStatement reflect the transaction", async () => {
  const got = await payme.get("pay-1");
  eq([got.tx.state, got.tx.order_id], [2, order1]);
  eq(await payme.get("nope"), { error: "tx_not_found" });
  const list = await payme.statement(NOW_MS() - 60_000, NOW_MS() + 60_000);
  truthy(list.some((t) => t.provider_tx_id === "pay-1"));
  eq(await payme.statement(0, 1000), []);
});
await check("the same order cannot be paid twice, even through Click", async () => {
  eq(await payme.create("pay-again", NOW_MS(), TIYIN, order1), { error: "order_not_payable" });
  eq(await click.prepare("c-late", "d", order1, TIYIN), { error: "already_paid" });
});

console.log("\nPayme: cancel");
await check("cancelling an unconfirmed transaction keeps the order payable", async () => {
  const order = await newOrder();
  await payme.create("pay-c1", NOW_MS(), TIYIN, order);
  const c = await payme.cancel("pay-c1", 1);
  eq([c.tx.state, c.tx.reason], [-1, 1]);
  eq(await orderStatus(order), "pending_payment");
  eq((await payme.cancel("pay-c1", 1)).tx.state, -1); // idempotent
  eq(await payme.perform("pay-c1"), { error: "cannot_perform" });
  // a fresh transaction is allowed again
  eq((await payme.create("pay-c2", NOW_MS(), TIYIN, order)).tx.state, 1);
});
await check(
  "refund of a paid order that is not yet being delivered cancels the order",
  async () => {
    const order = await newOrder();
    await payme.create("pay-r1", NOW_MS(), TIYIN, order);
    await payme.perform("pay-r1");
    const r = await payme.cancel("pay-r1", 5);
    eq([r.tx.state, r.tx.reason], [-2, 5]);
    eq(await orderStatus(order), "cancelled");
  },
);
await check(
  "refund is refused once delivery has started (-31007 on the protocol side)",
  async () => {
    const order = await newOrder();
    await payme.create("pay-r2", NOW_MS(), TIYIN, order);
    await payme.perform("pay-r2");
    await db.query(`update public.orders set status='delivering' where id=$1`, [order]);
    eq(await payme.cancel("pay-r2", 5), { error: "cannot_cancel" });
    eq((await payme.get("pay-r2")).tx.state, 2);
    eq(await orderStatus(order), "delivering");
  },
);
await check("cancelling an unknown transaction", async () => {
  eq(await payme.cancel("nope", 1), { error: "tx_not_found" });
});

console.log("\nPayme: 12 hour timeout");
const HOURS = 3600_000;
await check(
  "an expired transaction cannot be performed and is cancelled with reason 4",
  async () => {
    const order = await newOrder();
    await payme.create("pay-old", NOW_MS() - 13 * HOURS, TIYIN, order);
    eq(await payme.perform("pay-old"), { error: "cannot_perform" });
    const t = await payme.get("pay-old");
    eq([t.tx.state, t.tx.reason], [-1, 4]);
    eq(await orderStatus(order), "pending_payment");
  },
);
await check("an expired transaction does not block a new one", async () => {
  const order = await newOrder();
  await payme.create("pay-old2", NOW_MS() - 13 * HOURS, TIYIN, order);
  eq((await payme.create("pay-new2", NOW_MS(), TIYIN, order)).tx.state, 1);
  eq((await payme.get("pay-old2")).tx.reason, 4);
});
await check("re-creating an expired transaction by id is refused", async () => {
  const order = await newOrder();
  await payme.create("pay-old3", NOW_MS() - 13 * HOURS, TIYIN, order);
  eq(await payme.create("pay-old3", NOW_MS() - 13 * HOURS, TIYIN, order), {
    error: "cannot_perform",
  });
});
await check("an unexpired transaction near the limit still performs", async () => {
  const order = await newOrder();
  await payme.create("pay-edge", NOW_MS() - 11 * HOURS, TIYIN, order);
  eq((await payme.perform("pay-edge")).tx.state, 2);
});

console.log("\nPayme: concurrent channels");
await check(
  "if the order was cancelled meanwhile the open transaction cannot be performed",
  async () => {
    const order = await newOrder();
    await payme.create("pay-m1", NOW_MS(), TIYIN, order);
    await db.query(`update public.orders set status='cancelled' where id=$1`, [order]);
    eq(await payme.perform("pay-m1"), { error: "cannot_perform" });
    eq(await orderStatus(order), "cancelled");
  },
);

console.log("\nClick: prepare + complete");
let corder;
let cseq;
await check("prepare creates a transaction with an integer id and is repeatable", async () => {
  corder = await newOrder();
  const a = await click.prepare("click-1", "doc-1", corder, TIYIN);
  eq(a.tx.state, 1);
  truthy(Number.isInteger(Number(a.tx.seq)));
  cseq = Number(a.tx.seq);
  const b = await click.prepare("click-1", "doc-1", corder, TIYIN);
  eq(Number(b.tx.seq), cseq);
});
await check("prepare validates order, amount", async () => {
  eq(await click.prepare("click-x", "d", "99999999-9999-9999-9999-999999999999", TIYIN), {
    error: "order_not_found",
  });
  eq(await click.prepare("click-x", "d", corder, TIYIN - 100), { error: "invalid_amount" });
});
await check("a second payment attempt on the same order gets its own transaction", async () => {
  const b = await click.prepare("click-2", "doc-2", corder, TIYIN);
  truthy(Number(b.tx.seq) !== cseq);
});
await check("complete validates the prepared transaction", async () => {
  eq(await click.complete("click-1", 99999, corder, TIYIN), { error: "tx_not_found" });
  eq(await click.complete("wrong-click-id", cseq, corder, TIYIN), { error: "tx_not_found" });
  eq(await click.complete("click-1", cseq, "99999999-9999-9999-9999-999999999999", TIYIN), {
    error: "order_not_found",
  });
  eq(await click.complete("click-1", cseq, corder, TIYIN - 100), { error: "invalid_amount" });
  eq(await orderStatus(corder), "pending_payment");
});
await check(
  "complete with a failure reported by Click cancels the transaction, order stays payable",
  async () => {
    const order = await newOrder();
    const p = await click.prepare("click-f1", "d", order, TIYIN);
    eq(await click.complete("click-f1", Number(p.tx.seq), order, TIYIN, -5017), {
      error: "cancelled",
    });
    eq(await orderStatus(order), "pending_payment");
    eq(await click.complete("click-f1", Number(p.tx.seq), order, TIYIN, 0), { error: "cancelled" });
    eq(await click.prepare("click-f1", "d", order, TIYIN), { error: "cancelled" });
  },
);
await check("complete pays the order", async () => {
  const c = await click.complete("click-1", cseq, corder, TIYIN);
  eq(c.tx.state, 2);
  eq(await orderStatus(corder), "paid");
});
await check("after payment: prepare/complete again report 'already paid'", async () => {
  eq(await click.complete("click-1", cseq, corder, TIYIN), { error: "already_paid" });
  eq(await click.prepare("click-3", "d", corder, TIYIN), { error: "already_paid" });
  const second = (
    await db.query(`select seq from public.payment_transactions where provider_tx_id='click-2'`)
  ).rows[0].seq;
  eq(await click.complete("click-2", Number(second), corder, TIYIN), { error: "already_paid" });
});
await check("an order paid via Payme cannot be completed by an earlier Click prepare", async () => {
  const order = await newOrder();
  const p = await click.prepare("click-race", "d", order, TIYIN);
  await payme.create("pay-race", NOW_MS(), TIYIN, order);
  await payme.perform("pay-race");
  eq(await click.complete("click-race", Number(p.tx.seq), order, TIYIN), { error: "already_paid" });
  const rows = await db.query(
    `select count(*)::int c from public.payment_transactions where order_id=$1 and state=2`,
    [order],
  );
  eq(rows.rows[0].c, 1);
});
await check("a cancelled order is reported as cancelled by prepare and complete", async () => {
  const order = await newOrder();
  const p = await click.prepare("click-cx", "d", order, TIYIN);
  await db.query(`update public.orders set status='cancelled' where id=$1`, [order]);
  eq(await click.prepare("click-cy", "d", order, TIYIN), { error: "cancelled" });
  eq(await click.complete("click-cx", Number(p.tx.seq), order, TIYIN), { error: "cancelled" });
});

console.log("\nsafety net");
await check("the database refuses two performed transactions for one order", async () => {
  const order = await newOrder();
  await db.query(
    `insert into public.payment_transactions (order_id,provider,provider_tx_id,amount_tiyin,state) values ($1,'payme','dup-a',$2,2)`,
    [order, TIYIN],
  );
  await rejects(
    () =>
      db.query(
        `insert into public.payment_transactions (order_id,provider,provider_tx_id,amount_tiyin,state) values ($1,'click','dup-b',$2,2)`,
        [order, TIYIN],
      ),
    "duplicate key",
  );
});
await check("file access follows the order: paid grants it, a refund revokes it", async () => {
  const buyer2 = "44444444-4444-4444-4444-444444444444";
  await db.query(
    `insert into auth.users (id,email,raw_user_meta_data) values ($1,'b2@x.uz','{"full_name":"B2"}')`,
    [buyer2],
  );
  const order = (
    await db.query(
      `insert into public.orders (bot_id,bot_title,buyer_id,seller_id,amount) values ($1,'Shop Bot',$2,$3,$4) returning id`,
      [bot, buyer2, U.seller, PRICE],
    )
  ).rows[0].id;
  await db.query(
    `insert into public.bot_files (bot_id,path,file_name,size_bytes) values ($1,$2,'x.zip',1)`,
    [bot, `${U.seller}/${bot}/x.zip`],
  );
  const files = () =>
    as(
      db,
      buyer2,
      async (tx) =>
        (await tx.query(`select count(*)::int c from public.bot_files where bot_id=$1`, [bot]))
          .rows[0].c,
    );

  eq(await files(), 0); // order exists but is not paid
  await payme.create("pay-files", NOW_MS(), TIYIN, order);
  eq(await files(), 0); // transaction created, still not paid
  await payme.perform("pay-files");
  eq(await files(), 1); // paid -> download access
  await payme.cancel("pay-files", 5);
  eq(await files(), 0); // refunded -> access revoked
});

summary();
