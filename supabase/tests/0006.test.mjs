import { boot, migration as mig, as, check, summary, eq, rejects, sp } from "./harness.mjs";

const U = {
  seller: "11111111-1111-1111-1111-111111111111",
  buyer: "22222222-2222-2222-2222-222222222222",
  other: "44444444-4444-4444-4444-444444444444",
};
const db = await boot({
  migrations: [
    "0001_marketplace.sql",
    "0002_media_chat_favorites.sql",
    "0003_payments.sql",
    "0004_withdrawal_card_privacy.sql",
    "0005_review_fixes.sql",
    "0006_chat_fixes.sql",
  ].map(mig),
});
for (const [id, email, role] of [
  [U.seller, "s@x.uz", "seller"],
  [U.buyer, "b@x.uz", "buyer"],
  [U.other, "o@x.uz", "buyer"],
]) {
  await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [
    id,
    email,
    JSON.stringify({ role, full_name: email }),
  ]);
}
const bot = (
  await db.query(
    `insert into public.bots (seller_id,title,description,price,category,status) values ($1,'Bot','d',1000,'shop','published') returning id`,
    [U.seller],
  )
).rows[0].id;
await db.query(
  `insert into public.orders (bot_id,bot_title,buyer_id,seller_id,amount,status) values ($1,'Bot',$2,$3,1000,'paid')`,
  [bot, U.buyer, U.seller],
);

await check("a seller sees a chat they opened before the buyer writes", async () => {
  let id;
  await as(
    db,
    U.seller,
    async (tx) => {
      id = (await tx.query(`select public.open_conversation($1,$2) as id`, [bot, U.buyer])).rows[0]
        .id;
      const l = (await tx.query(`select * from public.my_conversations()`)).rows;
      eq(
        l.map((r) => r.id),
        [id],
      );
    },
    { commit: true },
  );
});
await check(
  "chats opened by a buyer stay hidden from the seller until the buyer writes",
  async () => {
    const bot2 = (
      await db.query(
        `insert into public.bots (seller_id,title,description,price,category,status) values ($1,'Bot2','d',1000,'shop','published') returning id`,
        [U.seller],
      )
    ).rows[0].id;
    await as(db, U.other, (tx) => tx.query(`select public.open_conversation($1)`, [bot2]), {
      commit: true,
    });
    await as(db, U.seller, async (tx) => {
      const l = (await tx.query(`select bot_id from public.my_conversations()`)).rows;
      eq(
        l.some((r) => r.bot_id === bot2),
        false,
      );
    });
  },
);
await check(
  "a buyer can message about an ordered bot that left the catalogue, but not others",
  async () => {
    await db.query(`update public.bots set status='pending' where id=$1`, [bot]);
    await as(db, U.buyer, async (tx) => {
      await tx.query(`select public.open_conversation($1)`, [bot]);
    });
    await as(db, U.other, async (tx) => {
      await rejects(() => sp(tx, `select public.open_conversation($1)`, [bot]), "bot_not_found");
    });
    await as(db, U.seller, async (tx) => {
      await rejects(() => sp(tx, `select public.open_conversation($1)`, [bot]), "own_bot");
    });
  },
);

summary();
