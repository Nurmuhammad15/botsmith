import { boot, migration as mig, as, check, summary, eq, truthy, rejects, sp } from "./harness.mjs";

const U = {
  seller: "11111111-1111-1111-1111-111111111111",
  buyer: "22222222-2222-2222-2222-222222222222",
  admin: "33333333-3333-3333-3333-333333333333",
  secondSeller: "44444444-4444-4444-4444-444444444444",
};
const PRICE = 450_000;
const db = await boot({
  migrations: [
    "0001_marketplace.sql",
    "0002_media_chat_favorites.sql",
    "0003_payments.sql",
    "0004_withdrawal_card_privacy.sql",
    "0005_review_fixes.sql",
    "0006_chat_fixes.sql",
    "0007_subscriptions.sql",
  ].map(mig),
});

for (const [id, email, role] of [
  [U.seller, "seller@x.uz", "seller"],
  [U.buyer, "buyer@x.uz", "buyer"],
  [U.admin, "admin@x.uz", "buyer"],
  [U.secondSeller, "second@x.uz", "seller"],
]) {
  await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [
    id,
    email,
    JSON.stringify({ role, full_name: email }),
  ]);
}
await db.query(`update public.profiles set role='admin' where id=$1`, [U.admin]);

async function makeBot(seller = U.seller) {
  const id = (
    await db.query(
      `insert into public.bots
        (seller_id,title,description,price,price_7_days,price_30_days,category,status)
       values ($1,'Shop Bot','Subscription bot',$2,$3,$4,'shop','published') returning id`,
      [seller, PRICE, 2_000_000, 6_000_000],
    )
  ).rows[0].id;
  await db.query(
    `insert into public.bot_subscription_webhooks (bot_id,endpoint_url,signing_secret)
     values ($1,'https://bot.example.uz/webhook',$2)`,
    [id, "a".repeat(32)],
  );
  return id;
}
const bot = await makeBot();
const secondBot = await makeBot(U.secondSeller);

async function createOrder(days = 1) {
  return as(
    db,
    U.buyer,
    async (tx) =>
      (await tx.query(`select (public.create_order($1,$2)).id as id`, [bot, days])).rows[0].id,
    { commit: true },
  );
}
const service = async (sql, params = []) =>
  as(db, "service", async (tx) => (await tx.query(sql, params)).rows[0], { commit: true });
const serviceRows = async (sql, params = []) =>
  as(db, "service", async (tx) => (await tx.query(sql, params)).rows, { commit: true });
const consent = (order) =>
  as(
    db,
    U.buyer,
    (tx) => tx.query(`select public.accept_subscription_terms($1,'2026-10-11')`, [order]),
    { commit: true },
  );

console.log("\n1. subscription plans, public catalog, and terms consent");
await check("public catalog includes all plan prices without authentication", async () => {
  const result = await as(db, null, (tx) =>
    tx.query(`select price,price_7_days,price_30_days from public.bots_public where id=$1`, [bot]),
  );
  eq(result.rows[0], { price: PRICE, price_7_days: 2_000_000, price_30_days: 6_000_000 });
});
await check("create_order prices each allowed plan from the seller listing", async () => {
  for (const [days, amount] of [
    [1, PRICE],
    [7, 2_000_000],
    [30, 6_000_000],
  ]) {
    const order = await createOrder(days);
    const row = await db.query(`select amount,subscription_days from public.orders where id=$1`, [
      order,
    ]);
    eq(row.rows[0], { amount, subscription_days: days });
  }
});
await check("payment cannot proceed until the buyer records terms consent", async () => {
  const order = await createOrder();
  eq((await service(`select public.payme_check_perform($1,$2) as r`, [order, PRICE * 100])).r, {
    error: "terms_not_accepted",
  });
  await consent(order);
  eq(
    (await service(`select public.payme_check_perform($1,$2) as r`, [order, PRICE * 100])).r.ok,
    true,
  );
});
await check("manual payment confirmation also requires accepted terms", async () => {
  const order = (
    await db.query(
      `insert into public.orders (bot_id,bot_title,buyer_id,seller_id,amount)
       values ($1,'Shop Bot',$2,$3,$4) returning id`,
      [bot, U.buyer, U.seller, PRICE],
    )
  ).rows[0].id;
  await as(db, U.admin, async (tx) => {
    await rejects(
      () => sp(tx, `select public.admin_set_order_status($1,'paid')`, [order]),
      "terms_not_accepted",
    );
  });
  await consent(order);
  await as(
    db,
    U.admin,
    (tx) => tx.query(`select public.admin_set_order_status($1,'paid')`, [order]),
    { commit: true },
  );
  eq(
    (await db.query(`select status from public.orders where id=$1`, [order])).rows[0].status,
    "paid",
  );
});
await check("legacy bots without all plans and a webhook are not published", async () => {
  const legacy = (
    await db.query(
      `insert into public.bots (seller_id,title,description,price,category,status)
       values ($1,'Legacy','d',1000,'shop','published') returning id`,
      [U.seller],
    )
  ).rows[0].id;
  const found = await db.query(`select 1 from public.bots_public where id=$1`, [legacy]);
  eq(found.rows.length, 0);
});

console.log("\n2. payments, commissions, refunds, and withdrawals");
await check("payment activates a plan and holds 85% seller proceeds for 24 hours", async () => {
  const order = await createOrder(7);
  await consent(order);
  await service(`select public.payme_create_transaction('sub-1',$1,$2,$3)`, [
    Date.now(),
    2_000_000 * 100,
    order,
  ]);
  await service(`select public.payme_perform_transaction('sub-1')`);
  const active = (
    await db.query(
      `select status,subscription_days,paid_at,subscription_expires_at from public.orders where id=$1`,
      [order],
    )
  ).rows[0];
  eq(active.status, "paid");
  eq(active.subscription_days, 7);
  truthy(Date.parse(active.subscription_expires_at) > Date.parse(active.paid_at));
  const wallet = await as(db, U.seller, (tx) => tx.query(`select * from public.my_wallet()`));
  eq(Number(wallet.rows[0].earned), 0);
  await db.query(`update public.orders set paid_at=now()-interval '25 hours' where id=$1`, [order]);
  const matured = await as(db, U.seller, (tx) => tx.query(`select * from public.my_wallet()`));
  eq(Number(matured.rows[0].earned), 1_700_000);
  eq(Number(matured.rows[0].balance), 1_700_000);
});

await check(
  "refund request is queued and admin rejection reactivates a still-valid plan",
  async () => {
    const order = await createOrder(30);
    await consent(order);
    await service(`select public.payme_create_transaction('sub-refund-no',$1,$2,$3)`, [
      Date.now(),
      6_000_000 * 100,
      order,
    ]);
    await service(`select public.payme_perform_transaction('sub-refund-no')`);
    eq(
      (await db.query(`select status,paid_at from public.orders where id=$1`, [order])).rows[0]
        .status,
      "paid",
    );
    await as(
      db,
      U.buyer,
      (tx) =>
        tx.query(`select public.request_subscription_refund($1,'Botga ulana olmadim')`, [order]),
      { commit: true },
    );
    await as(
      db,
      U.admin,
      (tx) => tx.query(`select public.admin_reject_subscription_refund($1)`, [order]),
      { commit: true },
    );
    const row = (
      await db.query(`select status,refund_resolution from public.orders where id=$1`, [order])
    ).rows[0];
    eq(row, { status: "paid", refund_resolution: "rejected" });
    const event = await db.query(
      `select count(*)::int as n from public.subscription_webhook_outbox
     where order_id=$1 and event='subscription.reactivated'`,
      [order],
    );
    eq(event.rows[0].n, 1);
  },
);

await check("refund requests after the 24-hour deadline are rejected", async () => {
  const order = await createOrder();
  await consent(order);
  await service(`select public.payme_create_transaction('sub-expired-window',$1,$2,$3)`, [
    Date.now(),
    PRICE * 100,
    order,
  ]);
  await service(`select public.payme_perform_transaction('sub-expired-window')`);
  await db.query(`update public.orders set paid_at=now()-interval '25 hours' where id=$1`, [order]);
  await as(db, U.buyer, async (tx) => {
    await rejects(
      () => sp(tx, `select public.request_subscription_refund($1,'Kech murojaat')`, [order]),
      "refund_window_expired",
    );
  });
});

await check("a completed manual refund is recorded and cancels the subscription", async () => {
  const order = await createOrder(30);
  await consent(order);
  await service(`select public.payme_create_transaction('sub-refund-yes',$1,$2,$3)`, [
    Date.now(),
    6_000_000 * 100,
    order,
  ]);
  await service(`select public.payme_perform_transaction('sub-refund-yes')`);
  eq(
    (await db.query(`select status,paid_at from public.orders where id=$1`, [order])).rows[0]
      .status,
    "paid",
  );
  await as(
    db,
    U.buyer,
    (tx) => tx.query(`select public.request_subscription_refund($1,'Xarid mos kelmadi')`, [order]),
    { commit: true },
  );
  await as(
    db,
    U.admin,
    (tx) => tx.query(`select public.admin_complete_subscription_refund($1)`, [order]),
    { commit: true },
  );
  const row = (
    await db.query(`select status,refund_resolution from public.orders where id=$1`, [order])
  ).rows[0];
  eq(row, { status: "cancelled", refund_resolution: "refunded" });
});

await check(
  "the full available balance can be withdrawn without a retained-balance reserve",
  async () => {
    const order = (
      await db.query(
        `insert into public.orders (bot_id,bot_title,buyer_id,seller_id,amount,status,paid_at,
        subscription_expires_at)
       values ($1,'Shop Bot',$2,$3,200000,'paid',now()-interval '25 hours',now()+interval '1 day')
       returning id`,
        [secondBot, U.buyer, U.secondSeller],
      )
    ).rows[0].id;
    truthy(order);
    const result = await as(
      db,
      U.secondSeller,
      (tx) =>
        tx.query(
          `select (public.request_withdrawal(170000,'8600123412341234','Sotuvchi')).amount as amount`,
        ),
      { commit: true },
    );
    eq(Number(result.rows[0].amount), 170_000);
  },
);

await check("a pending refund remains cancellable after its 24-hour payout hold", async () => {
  const order = (
    await db.query(
      `insert into public.orders
        (bot_id,bot_title,buyer_id,seller_id,amount,terms_accepted_at,terms_version)
       values ($1,'Shop Bot',$2,$3,200000,now(),'2026-10-11') returning id`,
      [secondBot, U.buyer, U.secondSeller],
    )
  ).rows[0].id;
  await service(`select public.payme_create_transaction('sub-refund-held',$1,20000000,$2)`, [
    Date.now(),
    order,
  ]);
  await service(`select public.payme_perform_transaction('sub-refund-held')`);
  await db.query(
    `update public.orders
     set paid_at=now()-interval '25 hours',
         refund_requested_at=now()-interval '23 hours',
         refund_reason='Requested within the original 24-hour window'
     where id=$1`,
    [order],
  );
  const result = await service(`select public.payme_cancel_transaction('sub-refund-held',5) as r`);
  eq(result.r.tx.state, -2);
  eq(
    (await db.query(`select status,refund_resolution from public.orders where id=$1`, [order]))
      .rows[0],
    { status: "cancelled", refund_resolution: "refunded" },
  );
});

console.log("\n3. signed webhook outbox and private secrets");
await check("only the service role can read webhook secrets and claim due deliveries", async () => {
  await rejects(
    () =>
      as(db, U.buyer, (tx) =>
        tx.query(`select signing_secret from public.bot_subscription_webhooks`),
      ),
    "permission denied",
  );
  const claimed = await serviceRows(`select * from public.claim_subscription_webhooks(20)`);
  truthy(claimed.length > 0);
  truthy(claimed.every((item) => item.webhook_url.startsWith("https://") && item.webhook_secret));
  const first = claimed[0];
  await service(`select public.finish_subscription_webhook($1,false,'test_failure')`, [first.id]);
  const retry = (
    await db.query(
      `select status,attempts,last_error from public.subscription_webhook_outbox where id=$1`,
      [first.id],
    )
  ).rows[0];
  eq(retry.status, "pending");
  eq(retry.attempts, 1);
  eq(retry.last_error, "test_failure");
});

await check("expiration processing queues a single expired event", async () => {
  const order = await createOrder(1);
  await consent(order);
  await service(`select public.payme_create_transaction('sub-expire',$1,$2,$3)`, [
    Date.now(),
    PRICE * 100,
    order,
  ]);
  await service(`select public.payme_perform_transaction('sub-expire')`);
  await db.query(
    `update public.orders set subscription_expires_at=now()-interval '1 second' where id=$1`,
    [order],
  );
  await service(`select public.process_expired_subscriptions()`);
  await service(`select public.process_expired_subscriptions()`);
  const expired = await db.query(
    `select count(*)::int as n from public.subscription_webhook_outbox
     where order_id=$1 and event='subscription.expired'`,
    [order],
  );
  eq(expired.rows[0].n, 1);
});

summary();
