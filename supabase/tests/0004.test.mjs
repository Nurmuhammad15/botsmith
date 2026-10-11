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
    mig("0004_withdrawal_card_privacy.sql"),
  ],
});

for (const [id, email, role] of [
  [U.seller, "seller@x.uz", "seller"],
  [U.buyer, "buyer@x.uz", "buyer"],
  [U.admin, "admin@x.uz", "buyer"],
]) {
  await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [
    id,
    email,
    JSON.stringify({ role, full_name: email }),
  ]);
}
await db.query(`update public.profiles set role='admin' where id=$1`, [U.admin]);

// seller earns 2,000,000 through one paid order, then requests a withdrawal
const bot = (
  await db.query(
    `insert into public.bots (seller_id,title,description,price,category,status)
     values ($1,'Bot','d',2000000,'shop','published') returning id`,
    [U.seller],
  )
).rows[0].id;
await db.query(
  `insert into public.orders (bot_id,bot_title,buyer_id,seller_id,amount,status)
   values ($1,'Bot',$2,$3,2000000,'paid')`,
  [bot, U.buyer, U.seller],
);
const CARD = "8600123412341234";
let withdrawalId;
await as(
  db,
  U.seller,
  async (tx) => {
    const r = await tx.query(
      `select * from public.request_withdrawal(1000000, $1, 'Sotuvchi Bek')`,
      [CARD],
    );
    withdrawalId = r.rows[0].id;
  },
  { commit: true },
);

const LIST =
  "id, seller_id, amount, fee, payout, card_last4, card_holder, status, created_at, processed_at";

console.log("\ncard number privacy");
await check("card_last4 is derived from the stored number", async () => {
  const r = await db.query(`select card_last4 from public.withdrawals where id=$1`, [withdrawalId]);
  eq(r.rows[0].card_last4, "1234");
});
await check(
  "sellers read their withdrawals with explicit columns, never the card number",
  async () => {
    await as(db, U.seller, async (tx) => {
      const r = await tx.query(`select ${LIST} from public.withdrawals`);
      eq(r.rows.length, 1);
      eq(r.rows[0].card_last4, "1234");
      await rejects(
        () => sp(tx, `select card_number from public.withdrawals`),
        "permission denied",
      );
      await rejects(() => sp(tx, `select * from public.withdrawals`), "permission denied");
    });
  },
);
await check("admins cannot read the card number with a plain select either", async () => {
  await as(db, U.admin, async (tx) => {
    eq((await tx.query(`select ${LIST} from public.withdrawals`)).rows.length, 1);
    await rejects(() => sp(tx, `select card_number from public.withdrawals`), "permission denied");
  });
});
await check("the card number cannot be changed or smuggled out by clients", async () => {
  await as(db, U.seller, async (tx) => {
    await rejects(
      () => sp(tx, `update public.withdrawals set card_number='0000000000000000'`),
      "permission denied",
    );
  });
});
await check("anon sees nothing", async () => {
  await as(db, null, async (tx) => {
    await rejects(() => sp(tx, `select ${LIST} from public.withdrawals`), "permission denied");
  });
});

console.log("\naudited reveal");
await check("only admins can reveal, and it is recorded", async () => {
  for (const who of [U.seller, U.buyer]) {
    await as(db, who, async (tx) => {
      await rejects(
        () => sp(tx, `select public.admin_reveal_withdrawal_card($1)`, [withdrawalId]),
        "forbidden",
      );
    });
  }
  await as(db, null, async (tx) => {
    await rejects(
      () => sp(tx, `select public.admin_reveal_withdrawal_card($1)`, [withdrawalId]),
      "permission denied",
    );
  });
  await as(
    db,
    U.admin,
    async (tx) => {
      const r = await tx.query(`select public.admin_reveal_withdrawal_card($1) as card`, [
        withdrawalId,
      ]);
      eq(r.rows[0].card, CARD);
      await rejects(
        () =>
          sp(
            tx,
            `select public.admin_reveal_withdrawal_card('99999999-9999-9999-9999-999999999999')`,
          ),
        "withdrawal_not_found",
      );
    },
    { commit: true },
  );
  const audit = await db.query(
    `select withdrawal_id, admin_id from public.withdrawal_card_reveals`,
  );
  eq(audit.rows, [{ withdrawal_id: withdrawalId, admin_id: U.admin }]);
});
await check("only admins can read the audit trail", async () => {
  await as(db, U.admin, async (tx) =>
    eq((await tx.query(`select count(*)::int c from public.withdrawal_card_reveals`)).rows[0].c, 1),
  );
  await as(db, U.seller, async (tx) =>
    eq((await tx.query(`select count(*)::int c from public.withdrawal_card_reveals`)).rows[0].c, 0),
  );
  await as(db, null, async (tx) => {
    await rejects(
      () => sp(tx, `select * from public.withdrawal_card_reveals`),
      "permission denied",
    );
  });
});

console.log("\nexisting behaviour still works");
await check("requesting a withdrawal and admin status changes are unaffected", async () => {
  await as(db, U.admin, async (tx) => {
    await tx.query(`select public.admin_set_withdrawal_status($1,'paid')`, [withdrawalId]);
    const r = await tx.query(`select status, processed_at from public.withdrawals where id=$1`, [
      withdrawalId,
    ]);
    eq(r.rows[0].status, "paid");
    truthy(r.rows[0].processed_at);
  });
  await as(db, U.seller, async (tx) => {
    const r = await tx.query(
      `select * from public.request_withdrawal(100000, $1, 'Sotuvchi Bek')`,
      [CARD],
    );
    eq(String(r.rows[0].amount), "100000");
  });
});

summary();
