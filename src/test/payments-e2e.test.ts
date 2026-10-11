// @vitest-environment node
// End-to-end check of the payment endpoints against the real SQL state machine.
//
// Needs PGlite (real Postgres compiled to WebAssembly). It is deliberately not a dependency of
// the project, so this suite is skipped unless it is available:
//
//   npm install --no-save @electric-sql/pglite     (or set PGLITE_PATH)
//   npm test
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { handleClick } from "@/server/payments/click.server";
import { handlePayme } from "@/server/payments/payme.server";
import { createPaymentsStore } from "@/server/payments/store.server";
// @ts-expect-error -- plain JavaScript test helper without type declarations
import { as, boot, migration, pgliteAvailable } from "../../supabase/tests/harness.mjs";

type Db = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

const KEY = "payme-test-key";
const CLICK_SECRET = "click-test-secret";
const CLICK_SERVICE = "777";
const SELLER = "11111111-1111-1111-1111-111111111111";
const BUYER = "22222222-2222-2222-2222-222222222222";
const PRICE = 450_000;
const TIYIN = PRICE * 100;

describe.skipIf(!pgliteAvailable)("payments end to end (handlers + SQL)", () => {
  let db: Db;
  let bot: string;

  const store = () =>
    createPaymentsStore({
      async rpc(name, args) {
        const keys = Object.keys(args);
        const named = keys.map((key, i) => `${key} => $${i + 1}`).join(", ");
        try {
          const rows = await as(
            db,
            "service",
            async (tx: Db) =>
              (
                await tx.query(
                  `select public.${name}(${named}) as r`,
                  keys.map((k) => args[k]),
                )
              ).rows,
            { commit: true },
          );
          return { data: rows[0]?.["r"], error: null };
        } catch (error) {
          return { data: null, error: { message: String((error as Error).message) } };
        }
      },
    });

  const newOrder = async (consented = true) => {
    const order = (
      await db.query(
        `insert into public.orders (bot_id,bot_title,buyer_id,seller_id,amount)
         values ($1,'Shop Bot',$2,$3,$4) returning id`,
        [bot, BUYER, SELLER, PRICE],
      )
    ).rows[0]!["id"] as string;
    if (consented) {
      await db.query(
        `update public.orders set terms_accepted_at=now(),terms_version='2026-10-11' where id=$1`,
        [order],
      );
    }
    return order;
  };
  const status = async (order: string) =>
    (await db.query(`select status from public.orders where id=$1`, [order])).rows[0]!["status"];

  beforeAll(async () => {
    db = await boot({
      migrations: [
        migration("0001_marketplace.sql"),
        migration("0002_media_chat_favorites.sql"),
        migration("0003_payments.sql"),
        migration("0004_withdrawal_card_privacy.sql"),
        migration("0005_review_fixes.sql"),
        migration("0006_chat_fixes.sql"),
        migration("0007_subscriptions.sql"),
      ],
    });
    for (const [id, email, role] of [
      [SELLER, "s@x.uz", "seller"],
      [BUYER, "b@x.uz", "buyer"],
    ]) {
      await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [
        id,
        email,
        JSON.stringify({ role, full_name: email }),
      ]);
    }
    bot = (
      await db.query(
        `insert into public.bots
          (seller_id,title,description,price,price_7_days,price_30_days,category,status)
         values ($1,'Shop Bot','d',$2,$3,$4,'shop','published') returning id`,
        [SELLER, PRICE, PRICE * 4, PRICE * 10],
      )
    ).rows[0]!["id"] as string;
    await db.query(
      `insert into public.bot_subscription_webhooks (bot_id,endpoint_url,signing_secret)
       values ($1,'https://bot.example.uz/webhook',$2)`,
      [bot, "a".repeat(32)],
    );
  });

  // ------------------------------------------------------------------ Payme
  const payme = async (method: string, params: Record<string, unknown>, key = KEY) => {
    const response = await handlePayme(
      new Request("https://example.uz/api/payme", {
        method: "POST",
        headers: { authorization: `Basic ${btoa(`Paycom:${key}`)}` },
        body: JSON.stringify({ method, params, id: 1 }),
      }),
      { key: KEY, store: store() },
    );
    return (await response.json()) as {
      result?: Record<string, unknown>;
      error?: { code: number; data?: unknown };
    };
  };

  it("refuses payment preparation if the buyer has not accepted subscription terms", async () => {
    const order = await newOrder(false);
    expect(await store().paymeCheckPerform(order, TIYIN)).toEqual({
      error: "terms_not_accepted",
    });
  });

  it("Payme: the full payment lifecycle, as the Payme sandbox exercises it", async () => {
    const order = await newOrder();
    const account = { order_id: order };

    expect(
      (await payme("CheckPerformTransaction", { amount: TIYIN, account }, "bad")).error?.code,
    ).toBe(-32504);
    expect(
      (await payme("CheckPerformTransaction", { amount: TIYIN + 100, account })).error?.code,
    ).toBe(-31001);
    expect(
      (
        await payme("CheckPerformTransaction", {
          amount: TIYIN,
          account: { order_id: "00000000-0000-4000-8000-000000000000" },
        })
      ).error,
    ).toMatchObject({ code: -31050, data: "order_id" });
    expect((await payme("CheckPerformTransaction", { amount: TIYIN, account })).result).toEqual({
      allow: true,
    });

    const t0 = Date.now();
    const created = await payme("CreateTransaction", {
      id: "p-1",
      time: t0,
      amount: TIYIN,
      account,
    });
    expect(created.result).toMatchObject({ state: 1 });
    const txId = created.result!["transaction"];
    expect(
      (await payme("CreateTransaction", { id: "p-1", time: t0, amount: TIYIN, account })).result,
    ).toMatchObject({ transaction: txId });
    expect(
      (await payme("CreateTransaction", { id: "p-2", time: t0, amount: TIYIN, account })).error
        ?.code,
    ).toBe(-31008);
    expect(await status(order)).toBe("pending_payment");

    expect((await payme("CheckTransaction", { id: "p-1" })).result).toMatchObject({
      state: 1,
      perform_time: 0,
      cancel_time: 0,
      reason: null,
    });

    const performed = await payme("PerformTransaction", { id: "p-1" });
    expect(performed.result).toMatchObject({ state: 2, transaction: txId });
    expect(await status(order)).toBe("paid");
    const again = await payme("PerformTransaction", { id: "p-1" });
    expect(again.result!["perform_time"]).toBe(performed.result!["perform_time"]);

    expect((await payme("CheckPerformTransaction", { amount: TIYIN, account })).error?.code).toBe(
      -31051,
    );

    const statement = await payme("GetStatement", { from: t0 - 1000, to: Date.now() + 1000 });
    expect((statement.result!["transactions"] as { id: string }[]).map((t) => t.id)).toContain(
      "p-1",
    );

    const refund = await payme("CancelTransaction", { id: "p-1", reason: 5 });
    expect(refund.result).toMatchObject({ state: -2 });
    expect(await status(order)).toBe("cancelled");
    expect((await payme("CheckTransaction", { id: "p-1" })).result).toMatchObject({
      state: -2,
      reason: 5,
    });
  });

  it("Payme: cancelling an unconfirmed transaction, and the 12 hour timeout", async () => {
    const order = await newOrder();
    const account = { order_id: order };
    await payme("CreateTransaction", { id: "p-c1", time: Date.now(), amount: TIYIN, account });
    expect((await payme("CancelTransaction", { id: "p-c1", reason: 3 })).result).toMatchObject({
      state: -1,
    });
    expect(await status(order)).toBe("pending_payment");

    const stale = await payme("CreateTransaction", {
      id: "p-old",
      time: Date.now() - 13 * 3600_000,
      amount: TIYIN,
      account,
    });
    expect(stale.result).toMatchObject({ state: 1 });
    expect((await payme("PerformTransaction", { id: "p-old" })).error?.code).toBe(-31008);
    expect((await payme("CheckTransaction", { id: "p-old" })).result).toMatchObject({
      state: -1,
      reason: 4,
    });
    expect(await status(order)).toBe("pending_payment");
  });

  it("Payme: a refund is refused with -31007 once delivery started", async () => {
    const order = await newOrder();
    const account = { order_id: order };
    await payme("CreateTransaction", { id: "p-d1", time: Date.now(), amount: TIYIN, account });
    await payme("PerformTransaction", { id: "p-d1" });
    await db.query(`update public.orders set status='delivering' where id=$1`, [order]);
    expect((await payme("CancelTransaction", { id: "p-d1", reason: 5 })).error?.code).toBe(-31007);
    expect(await status(order)).toBe("delivering");
  });

  // ------------------------------------------------------------------ Click
  const md5 = (s: string) => createHash("md5").update(s).digest("hex");
  const click = async (fields: Record<string, string>, secret = CLICK_SECRET) => {
    const complete = fields["action"] === "1";
    const params: Record<string, string> = {
      click_paydoc_id: "doc-1",
      service_id: CLICK_SERVICE,
      error: "0",
      error_note: "",
      sign_time: "2026-10-11 15:00:00",
      ...fields,
    };
    params["sign_string"] = md5(
      params["click_trans_id"]! +
        params["service_id"]! +
        secret +
        params["merchant_trans_id"]! +
        (complete ? params["merchant_prepare_id"]! : "") +
        params["amount"]! +
        params["action"]! +
        params["sign_time"]!,
    );
    const response = await handleClick(
      new Request("https://example.uz/api/click", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
      }),
      { secretKey: CLICK_SECRET, serviceId: CLICK_SERVICE, store: store() },
    );
    return (await response.json()) as Record<string, unknown>;
  };

  it("Click: prepare, complete, and replays", async () => {
    const order = await newOrder();
    const base = { click_trans_id: "ck-1", merchant_trans_id: order, amount: `${PRICE}.00` };

    expect(await click({ ...base, action: "0" }, "wrong-secret")).toMatchObject({ error: -1 });
    expect(await click({ ...base, action: "0", amount: "1.00" })).toMatchObject({ error: -2 });

    const prepared = await click({ ...base, action: "0" });
    expect(prepared).toMatchObject({ error: 0, error_note: "Success", merchant_trans_id: order });
    const prepareId = String(prepared["merchant_prepare_id"]);
    expect(prepareId).toMatch(/^\d+$/);
    expect(await status(order)).toBe("pending_payment");

    const completed = await click({ ...base, action: "1", merchant_prepare_id: prepareId });
    expect(completed).toMatchObject({ error: 0, merchant_confirm_id: Number(prepareId) });
    expect(await status(order)).toBe("paid");

    expect(await click({ ...base, action: "1", merchant_prepare_id: prepareId })).toMatchObject({
      error: -4,
    });
    expect(await click({ ...base, click_trans_id: "ck-1b", action: "0" })).toMatchObject({
      error: -4,
    });
  });

  it("Click: a failed payment reported by Click cancels the attempt but leaves the order payable", async () => {
    const order = await newOrder();
    const base = { click_trans_id: "ck-f1", merchant_trans_id: order, amount: `${PRICE}.00` };
    const prepared = await click({ ...base, action: "0" });
    const failed = await click({
      ...base,
      action: "1",
      merchant_prepare_id: String(prepared["merchant_prepare_id"]),
      error: "-5017",
    });
    expect(failed).toMatchObject({ error: -9 });
    expect(await status(order)).toBe("pending_payment");
    // the buyer can try again with a new Click transaction
    const retry = await click({ ...base, click_trans_id: "ck-f2", action: "0" });
    expect(retry).toMatchObject({ error: 0 });
  });

  it("an order paid through one provider cannot be paid through the other", async () => {
    const order = await newOrder();
    const account = { order_id: order };
    const prepared = await click({
      click_trans_id: "ck-x1",
      merchant_trans_id: order,
      amount: `${PRICE}.00`,
      action: "0",
    });
    await payme("CreateTransaction", { id: "p-x", time: Date.now(), amount: TIYIN, account });
    await payme("PerformTransaction", { id: "p-x" });
    expect(
      await click({
        click_trans_id: "ck-x1",
        merchant_trans_id: order,
        amount: `${PRICE}.00`,
        action: "1",
        merchant_prepare_id: String(prepared["merchant_prepare_id"]),
      }),
    ).toMatchObject({ error: -4 });
    const paid = await db.query(
      `select count(*)::int c from public.payment_transactions where order_id=$1 and state=2`,
      [order],
    );
    expect(paid.rows[0]!["c"]).toBe(1);
  });
});
