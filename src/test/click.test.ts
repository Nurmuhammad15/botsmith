import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  amountToTiyin,
  expectedSignature,
  handleClick,
  signatureMatches,
} from "@/server/payments/click.server";
import type { PaymentsStore, TxRow } from "@/server/payments/types";

const SECRET = "click-secret";
const SERVICE = "12345";
const ORDER = "0f8fad5b-d9cb-469f-a165-70867728950e";

const tx = (patch: Partial<TxRow> = {}): TxRow => ({
  id: "tx-uuid",
  seq: 42,
  order_id: ORDER,
  provider: "click",
  provider_tx_id: "98765",
  provider_doc_id: "555",
  amount_tiyin: 45_000_000,
  state: 1,
  reason: null,
  provider_time_ms: null,
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

/** Independent implementation of Click's documented signature, so the test does not just echo the code. */
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

function signed(extra: Record<string, string> = {}, secret = SECRET) {
  const base: Record<string, string> = {
    click_trans_id: "98765",
    service_id: SERVICE,
    click_paydoc_id: "555",
    merchant_trans_id: ORDER,
    amount: "450000.00",
    action: "0",
    error: "0",
    error_note: "Success",
    sign_time: "2026-10-11 15:00:00",
    ...extra,
  };
  const prepareId = base["action"] === "1" ? (base["merchant_prepare_id"] ?? "") : "";
  base["sign_string"] =
    extra["sign_string"] ??
    md5(
      base["click_trans_id"]! +
        base["service_id"]! +
        secret +
        base["merchant_trans_id"]! +
        prepareId +
        base["amount"]! +
        base["action"]! +
        base["sign_time"]!,
    );
  return base;
}

async function call(
  fields: Record<string, string>,
  options: { store?: PaymentsStore | null; method?: string; json?: boolean } = {},
) {
  const request = new Request("https://example.uz/api/click", {
    method: options.method ?? "POST",
    headers: {
      "content-type": options.json ? "application/json" : "application/x-www-form-urlencoded",
    },
    body:
      options.method === "GET"
        ? null
        : options.json
          ? JSON.stringify(fields)
          : new URLSearchParams(fields).toString(),
  });
  const response = await handleClick(request, {
    secretKey: SECRET,
    serviceId: SERVICE,
    store: options.store === undefined ? makeStore() : options.store,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("Click signature", () => {
  it("matches the documented formula for Prepare (no merchant_prepare_id)", () => {
    const p = signed();
    expect(expectedSignature(p, SECRET)).toBe(p["sign_string"]);
  });

  it("includes merchant_prepare_id for Complete", () => {
    const p = signed({ action: "1", merchant_prepare_id: "42" });
    expect(expectedSignature(p, SECRET)).toBe(p["sign_string"]);
    const without = md5("98765" + SERVICE + SECRET + ORDER + "450000.00" + "1" + p["sign_time"]);
    expect(without).not.toBe(p["sign_string"]);
  });

  it("compares case-insensitively and rejects different values", () => {
    expect(signatureMatches("ABCDEF", "abcdef")).toBe(true);
    expect(signatureMatches("abcdef", "abcdee")).toBe(false);
    expect(signatureMatches("abcdef", "")).toBe(false);
  });
});

describe("amountToTiyin", () => {
  it.each([
    ["450000", 45_000_000],
    ["450000.00", 45_000_000],
    ["450000.5", 45_000_050],
    ["450000.05", 45_000_005],
    ["0.01", 1],
    ["1234567.89", 123_456_789],
  ])("%s -> %i", (input, expected) => {
    expect(amountToTiyin(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "1.234", "1e5", "1,5", ".5", "5.", "1 000"])("rejects %j", (input) => {
    expect(amountToTiyin(input)).toBeNull();
  });
});

describe("Click Prepare", () => {
  it("creates the transaction and returns merchant_prepare_id", async () => {
    const clickPrepare = vi.fn().mockResolvedValue({ tx: tx() });
    const { status, body } = await call(signed(), { store: makeStore({ clickPrepare }) });
    expect(status).toBe(200);
    expect(body).toEqual({
      click_trans_id: "98765",
      merchant_trans_id: ORDER,
      merchant_prepare_id: 42,
      error: 0,
      error_note: "Success",
    });
    expect(clickPrepare).toHaveBeenCalledWith("98765", "555", ORDER, 45_000_000);
  });

  it("also accepts a JSON body", async () => {
    const clickPrepare = vi.fn().mockResolvedValue({ tx: tx() });
    const { body } = await call(signed(), { store: makeStore({ clickPrepare }), json: true });
    expect(body["error"]).toBe(0);
  });

  it("rejects a bad signature (-1) without touching the store", async () => {
    const clickPrepare = vi.fn();
    const { body } = await call(signed({ sign_string: "0".repeat(32) }), {
      store: makeStore({ clickPrepare }),
    });
    expect(body).toMatchObject({ error: -1, error_note: "SIGN CHECK FAILED!" });
    expect(clickPrepare).not.toHaveBeenCalled();
  });

  it("rejects a signature made with the wrong secret", async () => {
    const { body } = await call(signed({}, "other-secret"));
    expect(body["error"]).toBe(-1);
  });

  it("rejects tampered fields, because they are covered by the signature", async () => {
    const p = signed();
    expect((await call({ ...p, amount: "1.00" })).body["error"]).toBe(-1);
    expect(
      (await call({ ...p, merchant_trans_id: ORDER.replace("0f8", "1f8") })).body["error"],
    ).toBe(-1);
  });

  it("rejects requests for another service (-8) or with missing fields (-8)", async () => {
    expect((await call(signed({ service_id: "999" }))).body["error"]).toBe(-8);
    const p = signed();
    delete p["sign_time"];
    expect((await call(p)).body["error"]).toBe(-8);
    expect((await call(signed(), { method: "GET" })).body["error"]).toBe(-8);
  });

  it("rejects unknown actions (-3)", async () => {
    expect((await call(signed({ action: "2" }))).body["error"]).toBe(-3);
  });

  it("answers -5 for an order id that is not a UUID, without asking the database", async () => {
    const clickPrepare = vi.fn();
    const { body } = await call(signed({ merchant_trans_id: "197" }), {
      store: makeStore({ clickPrepare }),
    });
    expect(body["error"]).toBe(-5);
    expect(clickPrepare).not.toHaveBeenCalled();
  });

  it("answers -8 for a malformed or non-positive amount", async () => {
    for (const amount of ["abc", "0", "0.00", "1.234"]) {
      expect((await call(signed({ amount }))).body["error"]).toBe(-8);
    }
  });

  it.each([
    ["order_not_found", -5],
    ["invalid_amount", -2],
    ["already_paid", -4],
    ["cancelled", -9],
    ["tx_not_found", -6],
  ] as const)("maps store error %s to %i", async (error, code) => {
    const store = makeStore({ clickPrepare: vi.fn().mockResolvedValue({ error }) });
    const { body } = await call(signed(), { store });
    expect(body["error"]).toBe(code);
    expect(body["click_trans_id"]).toBe("98765");
    expect(body["merchant_trans_id"]).toBe(ORDER);
  });
});

describe("Click Complete", () => {
  const complete = (extra: Record<string, string> = {}) =>
    signed({ action: "1", merchant_prepare_id: "42", ...extra });

  it("completes and returns merchant_confirm_id", async () => {
    const clickComplete = vi.fn().mockResolvedValue({ tx: tx({ state: 2 }) });
    const { body } = await call(complete(), { store: makeStore({ clickComplete }) });
    expect(body).toEqual({
      click_trans_id: "98765",
      merchant_trans_id: ORDER,
      merchant_prepare_id: 42,
      merchant_confirm_id: 42,
      error: 0,
      error_note: "Success",
    });
    expect(clickComplete).toHaveBeenCalledWith("98765", 42, ORDER, 45_000_000, 0);
  });

  it("forwards a payment failure reported by Click (negative error)", async () => {
    const clickComplete = vi.fn().mockResolvedValue({ error: "cancelled" });
    const { body } = await call(complete({ error: "-5017" }), {
      store: makeStore({ clickComplete }),
    });
    expect(body["error"]).toBe(-9);
    expect(clickComplete).toHaveBeenCalledWith("98765", 42, ORDER, 45_000_000, -5017);
  });

  it("needs merchant_prepare_id, and signs over it", async () => {
    const p = complete();
    delete p["merchant_prepare_id"];
    expect((await call(p)).body["error"]).toBe(-8);
    // signed as a Prepare (without the prepare id) but sent as a Complete -> signature mismatch
    const wrong = signed({
      action: "1",
      merchant_prepare_id: "42",
      sign_string: signed()["sign_string"]!,
    });
    expect((await call(wrong)).body["error"]).toBe(-1);
  });

  it("rejects a non-numeric merchant_prepare_id", async () => {
    expect((await call(complete({ merchant_prepare_id: "4x2" }))).body["error"]).toBe(-8);
  });

  it.each([
    ["already_paid", -4],
    ["tx_not_found", -6],
    ["invalid_amount", -2],
    ["order_not_found", -5],
  ] as const)("maps store error %s to %i", async (error, code) => {
    const store = makeStore({ clickComplete: vi.fn().mockResolvedValue({ error }) });
    expect((await call(complete(), { store })).body["error"]).toBe(code);
  });
});

describe("Click server problems", () => {
  it("reports -7 when payments are not configured", async () => {
    const request = new Request("https://example.uz/api/click", {
      method: "POST",
      body: new URLSearchParams(signed()).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const deps of [
      { secretKey: undefined, serviceId: SERVICE, store: makeStore() },
      { secretKey: SECRET, serviceId: undefined, store: makeStore() },
      { secretKey: SECRET, serviceId: SERVICE, store: null },
    ]) {
      const response = await handleClick(request.clone(), deps);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ error: -7 });
    }
    spy.mockRestore();
  });

  it("reports -7 (without leaking details) when the database call throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = makeStore({
      clickPrepare: () => Promise.reject(new Error("password=hunter2")),
    });
    const { body } = await call(signed(), { store });
    expect(body["error"]).toBe(-7);
    expect(JSON.stringify(body)).not.toContain("hunter2");
    spy.mockRestore();
  });
});
