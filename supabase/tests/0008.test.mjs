import { boot, migration as mig, as, check, summary, eq, truthy } from "./harness.mjs";

const seller = "11111111-1111-1111-1111-111111111111";
const buyer = "22222222-2222-2222-2222-222222222222";
const db = await boot({
  migrations: [
    "0001_marketplace.sql",
    "0002_media_chat_favorites.sql",
    "0003_payments.sql",
    "0004_withdrawal_card_privacy.sql",
    "0005_review_fixes.sql",
    "0006_chat_fixes.sql",
    "0007_subscriptions.sql",
    "0008_manual_subscription_access.sql",
  ].map(mig),
});

for (const [id, email, role] of [
  [seller, "seller@x.uz", "seller"],
  [buyer, "buyer@x.uz", "buyer"],
]) {
  await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [
    id,
    email,
    JSON.stringify({ role, full_name: email }),
  ]);
}

console.log("\nManual subscription access without seller webhooks");
await check("seller can publish subscriptions without providing a webhook", async () => {
  const bot = await as(
    db,
    seller,
    async (tx) =>
      (
        await tx.query(
          `select public.create_sponsored_bot('Shop Bot','Description','shop',1000,5000,10000) as id`,
        )
      ).rows[0].id,
    { commit: true },
  );
  await db.query(`update public.bots set status='published' where id=$1`, [bot]);
  const catalog = await db.query(`select id from public.bots_public where id=$1`, [bot]);
  eq(catalog.rows.length, 1);
  const order = await as(
    db,
    buyer,
    async (tx) => (await tx.query(`select (public.create_order($1,7)).id as id`, [bot])).rows[0].id,
    { commit: true },
  );
  const details = await db.query(`select amount,subscription_days from public.orders where id=$1`, [
    order,
  ]);
  eq(details.rows[0], { amount: 5000, subscription_days: 7 });
});

await check("seller webhook delivery infrastructure is removed", async () => {
  const result = await db.query(
    `select to_regclass('public.bot_subscription_webhooks') as config,
            to_regclass('public.subscription_webhook_outbox') as outbox`,
  );
  eq(result.rows[0], { config: null, outbox: null });
  const route = await db.query(
    `select count(*)::int as count from information_schema.routines
     where routine_schema='public' and routine_name in (
       'set_bot_subscription_webhook','process_expired_subscriptions',
       'claim_subscription_webhooks','finish_subscription_webhook'
     )`,
  );
  eq(route.rows[0].count, 0);
});

summary();
