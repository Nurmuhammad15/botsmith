import fs from "node:fs";
import { boot, migration as mig, as, check, summary, eq, rejects } from "./harness.mjs";

const U = {
  seller: "11111111-1111-1111-1111-111111111111",
  buyer: "22222222-2222-2222-2222-222222222222",
  admin: "33333333-3333-3333-3333-333333333333",
  otherSeller: "44444444-4444-4444-4444-444444444444",
};

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
    "0017_seller_profile_details.sql",
    "0018_seller_cv.sql",
    "0025_single_price_bots.sql",
  ].map(mig),
});

for (const [id, email, role] of [
  [U.seller, "seller@x.uz", "seller"],
  [U.buyer, "buyer@x.uz", "buyer"],
  [U.admin, "admin@x.uz", "buyer"],
  [U.otherSeller, "other@x.uz", "seller"],
]) {
  await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [
    id,
    email,
    JSON.stringify({ role, full_name: email }),
  ]);
}
await db.query(`update public.profiles set role='admin' where id=$1`, [U.admin]);

const existingBotId = "55555555-5555-5555-5555-555555555555";
await db.query(
  `insert into public.bots
    (id,seller_id,title,description,price,category,status)
   values ($1,$2,'Existing Bot','Already approved',1000,'shop','published')`,
  [existingBotId, U.seller],
);
const existingBotId2 = "66666666-6666-6666-6666-666666666666";
await db.query(
  `insert into public.bots
    (id,seller_id,title,description,price,category,status)
   values ($1,$2,'Existing Bot 2','Also approved',2000,'shop','published')`,
  [existingBotId2, U.seller],
);
await db.exec(fs.readFileSync(mig("0029_bot_api_access.sql"), "utf8"));

const botId = await as(
  db,
  U.seller,
  async (tx) =>
    (
      await tx.query(
        `select public.create_sponsored_bot('Shop Bot','Description','shop',1000,5000,10000) as id`,
      )
    ).rows[0].id,
  { commit: true },
);

const setStatus = (status) =>
  as(
    db,
    U.admin,
    (tx) =>
      tx.query(`select public.admin_set_bot_status($1,$2::public.bot_status)`, [botId, status]),
    { commit: true },
  );

const service = async (sql, params = []) =>
  as(db, "service", async (tx) => (await tx.query(sql, params)).rows[0], { commit: true });

console.log("\nAPI key issue and access checks");
await check("migration also issues a one-time key to already-published bots", async () => {
  const key = (
    await db.query(`select secret_once from public.bot_api_keys where bot_id=$1`, [existingBotId])
  ).rows[0].secret_once;
  eq(key.startsWith("bsk_"), true);
  // Every existing bot gets its own distinct key (several published bots must not share one).
  const keys = (await db.query(`select secret_once from public.bot_api_keys`)).rows.map(
    (row) => row.secret_once,
  );
  eq(keys.length, 2);
  eq(new Set(keys).size, 2);
});

await check("approval creates a unique private key, unavailable before approval", async () => {
  eq(
    (await db.query(`select count(*)::int as n from public.bot_api_keys where bot_id=$1`, [botId]))
      .rows[0].n,
    0,
  );
  await setStatus("published");
  const key = (
    await db.query(
      `select key_hash,key_prefix,secret_once from public.bot_api_keys where bot_id=$1`,
      [botId],
    )
  ).rows[0];
  eq(key.key_prefix, key.secret_once.slice(0, 12));
  eq(key.key_hash === key.secret_once, false);
  eq(key.secret_once.startsWith("bsk_"), true);
});

await check("seller sees the pending key until confirming it; other users cannot", async () => {
  const pending = () =>
    as(
      db,
      U.seller,
      async (tx) => (await tx.query(`select * from public.pending_bot_api_keys()`)).rows,
      {
        commit: true,
      },
    );
  const first = (await pending()).find((row) => row.bot_id === botId);
  eq(first.api_key.startsWith("bsk_"), true);
  // Still shown after a "reload" (second call) until confirmed.
  eq((await pending()).find((row) => row.bot_id === botId).api_key, first.api_key);
  await rejects(
    () => as(db, U.otherSeller, (tx) => tx.query(`select public.confirm_bot_api_key($1)`, [botId])),
    "bot_not_found",
  );
  eq(
    (
      await as(
        db,
        U.otherSeller,
        async (tx) => (await tx.query(`select * from public.pending_bot_api_keys()`)).rows,
      )
    ).some((row) => row.bot_id === botId),
    false,
  );
  await as(db, U.seller, (tx) => tx.query(`select public.confirm_bot_api_key($1)`, [botId]), {
    commit: true,
  });
  eq(
    (await pending()).some((row) => row.bot_id === botId),
    false,
  );
});

await check("tariff and fixed-price orders return active access only while paid", async () => {
  const key = await as(
    db,
    U.seller,
    async (tx) =>
      (await tx.query(`select public.rotate_bot_api_key($1) as key`, [botId])).rows[0].key,
    { commit: true },
  );
  const keyHash = (
    await db.query(`select key_hash from public.bot_api_keys where bot_id=$1`, [botId])
  ).rows[0];

  const order = await as(
    db,
    U.buyer,
    async (tx) =>
      (await tx.query(`select (public.create_order($1,7)).id as id`, [botId])).rows[0].id,
    { commit: true },
  );
  await db.query(
    `update public.orders set status='paid', paid_at=now(),
     subscription_expires_at=now()+interval '7 days' where id=$1`,
    [order],
  );
  const tariffAccess = (
    await service(`select public.check_bot_subscription_access($1,$2) as result`, [
      keyHash.key_hash,
      U.buyer,
    ])
  ).result;
  eq(tariffAccess.active, true);
  eq(tariffAccess.subscription_days, 7);
  eq(typeof tariffAccess.expires_at, "string");
  await db.query(
    `update public.orders set subscription_expires_at=now()-interval '1 second' where id=$1`,
    [order],
  );
  eq(
    (
      await service(`select public.check_bot_subscription_access($1,$2) as result`, [
        keyHash.key_hash,
        U.buyer,
      ])
    ).result.active,
    false,
  );

  const singleBot = await as(
    db,
    U.seller,
    async (tx) =>
      (
        await tx.query(
          `select public.create_sponsored_bot('Single Bot','Description','shop',2000,null,null) as id`,
        )
      ).rows[0].id,
    { commit: true },
  );
  await as(
    db,
    U.admin,
    (tx) => tx.query(`select public.admin_set_bot_status($1,'published')`, [singleBot]),
    { commit: true },
  );
  const singleKeyHash = (
    await db.query(`select key_hash from public.bot_api_keys where bot_id=$1`, [singleBot])
  ).rows[0].key_hash;
  const singleOrder = await as(
    db,
    U.buyer,
    async (tx) =>
      (await tx.query(`select (public.create_order($1,0)).id as id`, [singleBot])).rows[0].id,
    { commit: true },
  );
  await db.query(`update public.orders set status='paid', paid_at=now() where id=$1`, [
    singleOrder,
  ]);
  eq(
    (
      await service(`select public.check_bot_subscription_access($1,$2) as result`, [
        singleKeyHash,
        U.buyer,
      ])
    ).result.active,
    true,
  );
  await db.query(`update public.orders set status='cancelled' where id=$1`, [singleOrder]);
  eq(
    (
      await service(`select public.check_bot_subscription_access($1,$2) as result`, [
        singleKeyHash,
        U.buyer,
      ])
    ).result.active,
    false,
  );
  eq(key.startsWith("bsk_"), true);
});

await check("rejecting a bot revokes its key and reapproval issues a different one", async () => {
  const previous = (
    await db.query(`select key_hash from public.bot_api_keys where bot_id=$1`, [botId])
  ).rows[0].key_hash;
  await setStatus("rejected");
  eq(
    (
      await service(`select public.check_bot_subscription_access($1,$2) as result`, [
        previous,
        U.buyer,
      ])
    ).result.error,
    "invalid_api_key",
  );
  await setStatus("published");
  const replacement = (
    await db.query(`select key_hash from public.bot_api_keys where bot_id=$1`, [botId])
  ).rows[0].key_hash;
  eq(replacement !== previous, true);
});

summary();
