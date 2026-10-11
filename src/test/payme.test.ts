import { describe, expect, it, vi } from "vitest";
import { handlePayme, isAuthorized } from "@/server/payments/payme.server";
import type { PaymentsStore, TxRow } from "@/server/payments/types";

const KEY = "s3cret-key";
const ORDER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const auth = (key = KEY) => `Basic ${btoa(`Paycom:${key}`)}`;

const tx = (patch: Partial<TxRow> = {}): TxRow => ({
  id: "tx-uuid-1",
  seq: 7,
  order_id: ORDER,
  provider: "payme",
  provider_tx_id: "5305e3bab097f420a62ced0b",
  provider_doc_id: null,
  amount_tiyin: 45_000_000,
  state: 1,
  reason: null,
  provider_time_ms: 1_700_000_000_000,
  created_at: "2026-10-11T10:00:00.000Z",
  performed_at: null,
  cancelled_at: null,
  ...patch,
});

function makeStore(overrides: Partial<PaymentsStore> = {}): PaymentsStore {
  const fail = () => Promise.reject(new Error("unexpected store call"));
  return {
    paymeCheckPerform: fail,
    paymeCreate: fail,
    paymePerform: fail,
    paymeCancel: fail,
    paymeGet: fail,
    paymeStatement: fail,
    clickPrepare: fail,
    clickComplete: fail,
    ...overrides,
  };
}

async function call(
  body: unknown,
  options: {
    store?: PaymentsStore | null;
    header?: string | null;
    method?: string;
    fiscal?: Parameters<typeof handlePayme>[1]["fiscal"];
    key?: string | undefined;
  } = {},
) {
  const headers = new Headers({ "content-type": "application/json" });
  const header = options.header === undefined ? auth() : options.header;
  if (header) headers.set("authorization", header);
  const request = new Request("https://example.uz/api/payme", {
    method: options.method ?? "POST",
    headers,
    body: options.method === "GET" ? null : typeof body === "string" ? body : JSON.stringify(body),
  });
  const response = await handlePayme(request, {
    key: "key" in options ? options.key : KEY,
    store: options.store === undefined ? makeStore() : options.store,
    fiscal: options.fiscal,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const rpc = (method: string, params: Record<string, unknown>, id = 1) => ({ method, params, id });

describe("Payme authentication and protocol errors", () => {
  it("accepts Basic Paycom:<key> and rejects anything else with -32504 (still HTTP 200)", async () => {
    expect(isAuthorized(auth(), KEY)).toBe(true);
    expect(isAuthorized(auth("wrong"), KEY)).toBe(false);
    expect(isAuthorized(`Basic ${btoa(`Other:${KEY}`)}`, KEY)).toBe(false);
    expect(isAuthorized("Bearer abc", KEY)).toBe(false);
    expect(isAuthorized("Basic !!!", KEY)).toBe(false);
    expect(isAuthorized(null, KEY)).toBe(false);
    expect(isAuthorized(auth(""), "")).toBe(false); // unset key never authorizes

    for (const header of [null, auth("wrong")]) {
      const { status, body } = await call(rpc("CheckTransaction", { id: "x" }, 42), { header });
      expect(status).toBe(200);
      expect(body["id"]).toBe(42);
      expect(body["error"]).toMatchObject({ code: -32504 });
      expect(body).not.toHaveProperty("result");
    }
  });

  it("never touches the store before authenticating", async () => {
    const store = makeStore({ paymePerform: vi.fn() });
    await call(rpc("PerformTransaction", { id: "x" }), { store, header: auth("nope") });
    expect(store.paymePerform).not.toHaveBeenCalled();
  });

  it("answers errors with localized messages in ru, uz and en", async () => {
    const { body } = await call(rpc("CheckTransaction", { id: "x" }), { header: null });
    const message = (body["error"] as { message: Record<string, string> }).message;
    expect(Object.keys(message).sort()).toEqual(["en", "ru", "uz"]);
    for (const text of Object.values(message)) expect(text.length).toBeGreaterThan(3);
  });

  it("rejects non-POST (-32300), broken JSON (-32700) and malformed RPC (-32600)", async () => {
    expect((await call(null, { method: "GET" })).body["error"]).toMatchObject({ code: -32300 });
    expect((await call("{not json")).body["error"]).toMatchObject({ code: -32700 });
    expect((await call({ id: 3 })).body["error"]).toMatchObject({ code: -32600 });
    expect((await call({ method: "X", id: 3 })).body["error"]).toMatchObject({ code: -32600 });
    expect((await call({ method: 5, params: {}, id: 3 })).body["error"]).toMatchObject({
      code: -32600,
    });
  });

  it("answers unknown methods with -32601 naming the method in data", async () => {
    const { body } = await call(rpc("DoMagic", {}));
    expect(body["error"]).toMatchObject({ code: -32601, data: "DoMagic" });
  });

  it("reports -32400 when the server has no database, and never leaks internal errors", async () => {
    expect(
      (await call(rpc("CheckTransaction", { id: "x" }), { store: null })).body["error"],
    ).toMatchObject({
      code: -32400,
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = makeStore({
      paymeGet: () => Promise.reject(new Error("connection string postgres://secret")),
    });
    const { body } = await call(rpc("CheckTransaction", { id: "x" }), { store: broken });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(body["error"]).toMatchObject({ code: -32400 });
    spy.mockRestore();
  });

  it("refuses everything when no key is configured", async () => {
    const { body } = await call(rpc("CheckTransaction", { id: "x" }), { key: undefined });
    expect(body["error"]).toMatchObject({ code: -32504 });
  });
});

describe("CheckPerformTransaction", () => {
  const params = { amount: 45_000_000, account: { order_id: ORDER } };

  it("allows a payable order and forwards the order id and amount", async () => {
    const paymeCheckPerform = vi.fn().mockResolvedValue({ ok: true, title: "Shop Bot" });
    const { body } = await call(rpc("CheckPerformTransaction", params), {
      store: makeStore({ paymeCheckPerform }),
    });
    expect(body["result"]).toEqual({ allow: true });
    expect(paymeCheckPerform).toHaveBeenCalledWith(ORDER, 45_000_000);
  });

  it("adds the fiscal receipt detail only when configured", async () => {
    const store = makeStore({
      paymeCheckPerform: vi.fn().mockResolvedValue({ ok: true, title: "Shop Bot" }),
    });
    const { body } = await call(rpc("CheckPerformTransaction", params), {
      store,
      fiscal: { code: "10305001001000000", packageCode: "123456", vatPercent: 12 },
    });
    expect(body["result"]).toEqual({
      allow: true,
      detail: {
        receipt_type: 0,
        items: [
          {
            title: "Shop Bot",
            price: 45_000_000,
            count: 1,
            code: "10305001001000000",
            package_code: "123456",
            vat_percent: 12,
          },
        ],
      },
    });
  });

  it.each([
    ["order_not_found", -31050],
    ["order_not_payable", -31051],
    ["invalid_amount", -31001],
  ] as const)("maps %s to %i (account errors name order_id)", async (error, code) => {
    const store = makeStore({ paymeCheckPerform: vi.fn().mockResolvedValue({ error }) });
    const { body } = await call(rpc("CheckPerformTransaction", params), { store });
    expect(body["error"]).toMatchObject({ code });
    if (code <= -31050) expect(body["error"]).toMatchObject({ data: "order_id" });
  });

  it("validates input before asking the store", async () => {
    const store = makeStore({ paymeCheckPerform: vi.fn() });
    for (const bad of [0, -5, 1.5, "100", null]) {
      const { body } = await call(
        rpc("CheckPerformTransaction", { amount: bad, account: { order_id: ORDER } }),
        { store },
      );
      expect(body["error"]).toMatchObject({ code: -31001 });
    }
    for (const account of [undefined, {}, { order_id: "197" }, { order_id: 5 }, "x"]) {
      const { body } = await call(rpc("CheckPerformTransaction", { amount: 100, account }), {
        store,
      });
      expect(body["error"]).toMatchObject({ code: -31050, data: "order_id" });
    }
    expect(store.paymeCheckPerform).not.toHaveBeenCalled();
  });
});

describe("CreateTransaction", () => {
  const params = {
    id: "5305e3bab097f420a62ced0b",
    time: 1_700_000_000_000,
    amount: 45_000_000,
    account: { order_id: ORDER.toUpperCase() },
  };

  it("returns create_time, transaction and state 1", async () => {
    const paymeCreate = vi.fn().mockResolvedValue({ tx: tx() });
    const { body } = await call(rpc("CreateTransaction", params), {
      store: makeStore({ paymeCreate }),
    });
    expect(body["result"]).toEqual({
      create_time: Date.parse("2026-10-11T10:00:00.000Z"),
      transaction: "tx-uuid-1",
      state: 1,
    });
    // the order id reaches the database normalised to lower case
    expect(paymeCreate).toHaveBeenCalledWith(params.id, params.time, 45_000_000, ORDER);
  });

  it("maps -31008 (another active transaction / expired) and -31001", async () => {
    for (const [error, code] of [
      ["cannot_perform", -31008],
      ["invalid_amount", -31001],
      ["order_not_found", -31050],
    ] as const) {
      const store = makeStore({ paymeCreate: vi.fn().mockResolvedValue({ error }) });
      expect((await call(rpc("CreateTransaction", params), { store })).body["error"]).toMatchObject(
        {
          code,
        },
      );
    }
  });

  it("requires id and time", async () => {
    const store = makeStore({ paymeCreate: vi.fn() });
    for (const patch of [{ id: "" }, { id: 5 }, { time: "now" }, { time: 0 }]) {
      const { body } = await call(rpc("CreateTransaction", { ...params, ...patch }), { store });
      expect(body["error"]).toMatchObject({ code: -32600 });
    }
    expect(store.paymeCreate).not.toHaveBeenCalled();
  });
});

describe("PerformTransaction / CancelTransaction / CheckTransaction", () => {
  it("performs and reports state 2 with perform_time", async () => {
    const performed = tx({ state: 2, performed_at: "2026-10-11T10:05:00.000Z" });
    const { body } = await call(rpc("PerformTransaction", { id: "x" }), {
      store: makeStore({ paymePerform: vi.fn().mockResolvedValue({ tx: performed }) }),
    });
    expect(body["result"]).toEqual({
      transaction: "tx-uuid-1",
      perform_time: Date.parse("2026-10-11T10:05:00.000Z"),
      state: 2,
    });
  });

  it("maps perform errors: unknown -31003, not possible -31008", async () => {
    for (const [error, code] of [
      ["tx_not_found", -31003],
      ["cannot_perform", -31008],
    ] as const) {
      const store = makeStore({ paymePerform: vi.fn().mockResolvedValue({ error }) });
      expect(
        (await call(rpc("PerformTransaction", { id: "x" }), { store })).body["error"],
      ).toMatchObject({ code });
    }
  });

  it("cancels with the given reason, defaulting to 10 (unknown)", async () => {
    const paymeCancel = vi.fn().mockResolvedValue({
      tx: tx({ state: -2, reason: 5, cancelled_at: "2026-10-11T11:00:00.000Z" }),
    });
    const store = makeStore({ paymeCancel });
    const { body } = await call(rpc("CancelTransaction", { id: "abc", reason: 5 }), { store });
    expect(body["result"]).toEqual({
      transaction: "tx-uuid-1",
      cancel_time: Date.parse("2026-10-11T11:00:00.000Z"),
      state: -2,
    });
    expect(paymeCancel).toHaveBeenCalledWith("abc", 5);
    await call(rpc("CancelTransaction", { id: "abc" }), { store });
    expect(paymeCancel).toHaveBeenLastCalledWith("abc", 10);
  });

  it("maps cancel errors: -31007 when the order is already delivered, -31003 unknown", async () => {
    for (const [error, code] of [
      ["cannot_cancel", -31007],
      ["tx_not_found", -31003],
    ] as const) {
      const store = makeStore({ paymeCancel: vi.fn().mockResolvedValue({ error }) });
      expect(
        (await call(rpc("CancelTransaction", { id: "x", reason: 5 }), { store })).body["error"],
      ).toMatchObject({ code });
    }
  });

  it("CheckTransaction returns all fields, with 0 for absent times and null reason", async () => {
    const { body } = await call(rpc("CheckTransaction", { id: "x" }), {
      store: makeStore({ paymeGet: vi.fn().mockResolvedValue({ tx: tx() }) }),
    });
    expect(body["result"]).toEqual({
      create_time: Date.parse("2026-10-11T10:00:00.000Z"),
      perform_time: 0,
      cancel_time: 0,
      transaction: "tx-uuid-1",
      state: 1,
      reason: null,
    });
    const missing = await call(rpc("CheckTransaction", { id: "x" }), {
      store: makeStore({ paymeGet: vi.fn().mockResolvedValue({ error: "tx_not_found" }) }),
    });
    expect(missing.body["error"]).toMatchObject({ code: -31003 });
  });
});

describe("GetStatement", () => {
  it("lists transactions in Payme's format", async () => {
    const paymeStatement = vi
      .fn()
      .mockResolvedValue([tx({ state: 2, performed_at: "2026-10-11T10:05:00.000Z" })]);
    const { body } = await call(rpc("GetStatement", { from: 1, to: 2_000_000_000_000 }), {
      store: makeStore({ paymeStatement }),
    });
    expect(paymeStatement).toHaveBeenCalledWith(1, 2_000_000_000_000);
    expect(body["result"]).toEqual({
      transactions: [
        {
          id: "5305e3bab097f420a62ced0b",
          time: 1_700_000_000_000,
          amount: 45_000_000,
          account: { order_id: ORDER },
          create_time: Date.parse("2026-10-11T10:00:00.000Z"),
          perform_time: Date.parse("2026-10-11T10:05:00.000Z"),
          cancel_time: 0,
          transaction: "tx-uuid-1",
          state: 2,
          reason: null,
        },
      ],
    });
  });

  it("requires numeric from/to", async () => {
    const { body } = await call(rpc("GetStatement", { from: "a", to: 2 }));
    expect(body["error"]).toMatchObject({ code: -32600 });
  });
});
