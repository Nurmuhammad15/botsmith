/// <reference types="node" />
// Click "Shop API" endpoint: Prepare (action=0) and Complete (action=1).
// Reference: https://docs.click.uz (Shop API) and Click's own integration sample
// https://github.com/click-llc/click-integration-php
//
//  * Click POSTs form-encoded requests and expects HTTP 200 with a JSON body {error, error_note,…}
//  * sign_string = md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id
//                      + [merchant_prepare_id, Complete only] + amount + action + sign_time)
//  * amount is in so'm with up to two decimals; merchant_trans_id is our orders.id
import { createHash, timingSafeEqual } from "node:crypto";
import { UUID_PATTERN, type PaymentsStore, type StoreError, type TxRow } from "./types";

export type ClickDeps = {
  /** Unset values mean "not configured": every request is then answered with an error. */
  secretKey: string | undefined;
  serviceId: string | undefined;
  store: PaymentsStore | null;
};

// Click's error table.
const CODES = {
  success: [0, "Success"],
  signFailed: [-1, "SIGN CHECK FAILED!"],
  invalidAmount: [-2, "Incorrect parameter amount"],
  actionNotFound: [-3, "Action not found"],
  alreadyPaid: [-4, "Already paid"],
  orderNotFound: [-5, "User does not exist"],
  txNotFound: [-6, "Transaction does not exist"],
  updateFailed: [-7, "Failed to update user"],
  badRequest: [-8, "Error in request from click"],
  cancelled: [-9, "Transaction cancelled"],
} as const satisfies Record<string, readonly [number, string]>;

type CodeKey = keyof typeof CODES;

const STORE_ERRORS: Record<StoreError, CodeKey> = {
  order_not_found: "orderNotFound",
  order_not_payable: "alreadyPaid",
  invalid_amount: "invalidAmount",
  cannot_perform: "updateFailed",
  cannot_cancel: "updateFailed",
  tx_not_found: "txNotFound",
  already_paid: "alreadyPaid",
  cancelled: "cancelled",
};

const reply = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=UTF-8" },
  });

const md5 = (value: string) => createHash("md5").update(value).digest("hex");

/** Constant-time check of Click's signature (compared as digests so lengths never leak). */
export function signatureMatches(expected: string, provided: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v.toLowerCase()).digest();
  return timingSafeEqual(digest(expected), digest(provided));
}

/** What Click signs for a request (the Complete request also covers merchant_prepare_id). */
export function expectedSignature(params: Record<string, string>, secretKey: string): string {
  const isComplete = params["action"] === "1";
  return md5(
    (params["click_trans_id"] ?? "") +
      (params["service_id"] ?? "") +
      secretKey +
      (params["merchant_trans_id"] ?? "") +
      (isComplete ? (params["merchant_prepare_id"] ?? "") : "") +
      (params["amount"] ?? "") +
      (params["action"] ?? "") +
      (params["sign_time"] ?? ""),
  );
}

/** "450000.00" -> 45000000 tiyin without floating point arithmetic; null if malformed. */
export function amountToTiyin(amount: string): number | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) return null;
  const [, whole = "0", fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

async function readParams(request: Request): Promise<Record<string, string>> {
  const text = await request.text();
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, value == null ? "" : String(value)]),
    );
  }
  return Object.fromEntries(new URLSearchParams(text));
}

const REQUIRED = [
  "click_trans_id",
  "service_id",
  "click_paydoc_id",
  "merchant_trans_id",
  "amount",
  "action",
  "error",
  "sign_time",
  "sign_string",
] as const;

/** Handles one Click request; never throws. */
export async function handleClick(request: Request, deps: ClickDeps): Promise<Response> {
  const fail = (key: CodeKey, params: Record<string, string> = {}) => {
    const [error, error_note] = CODES[key];
    return reply({
      error,
      error_note,
      click_trans_id: params["click_trans_id"] ?? null,
      merchant_trans_id: params["merchant_trans_id"] ?? null,
    });
  };

  if (request.method !== "POST") return fail("badRequest");
  const { secretKey, serviceId, store } = deps;
  if (!secretKey || !serviceId || !store) {
    console.error("Click request received but payments are not configured");
    return fail("updateFailed");
  }

  let params: Record<string, string>;
  try {
    params = await readParams(request);
  } catch {
    return fail("badRequest");
  }

  const action = params["action"];
  const complete = action === "1";
  if (
    REQUIRED.some((name) => params[name] === undefined) ||
    (complete && params["merchant_prepare_id"] === undefined) ||
    params["service_id"] !== serviceId
  ) {
    return fail("badRequest", params);
  }
  if (!signatureMatches(expectedSignature(params, secretKey), params["sign_string"] ?? "")) {
    return fail("signFailed", params);
  }
  if (action !== "0" && action !== "1") return fail("actionNotFound", params);

  const orderId = params["merchant_trans_id"] ?? "";
  if (!UUID_PATTERN.test(orderId)) return fail("orderNotFound", params);
  const amountTiyin = amountToTiyin(params["amount"] ?? "");
  if (amountTiyin === null || amountTiyin <= 0) return fail("badRequest", params);

  const clickTransId = params["click_trans_id"] ?? "";
  const succeed = (tx: TxRow) => {
    const [error, error_note] = CODES.success;
    return reply({
      click_trans_id: clickTransId,
      merchant_trans_id: orderId,
      merchant_prepare_id: tx.seq,
      ...(complete ? { merchant_confirm_id: tx.seq } : {}),
      error,
      error_note,
    });
  };

  try {
    if (!complete) {
      const result = await store.clickPrepare(
        clickTransId,
        params["click_paydoc_id"] ?? "",
        orderId.toLowerCase(),
        amountTiyin,
      );
      return "error" in result ? fail(STORE_ERRORS[result.error], params) : succeed(result.tx);
    }

    const prepareId = params["merchant_prepare_id"] ?? "";
    const clickError = Number(params["error"]);
    if (!/^\d{1,15}$/.test(prepareId) || !Number.isInteger(clickError)) {
      return fail("badRequest", params);
    }
    const result = await store.clickComplete(
      clickTransId,
      Number(prepareId),
      orderId.toLowerCase(),
      amountTiyin,
      clickError,
    );
    return "error" in result ? fail(STORE_ERRORS[result.error], params) : succeed(result.tx);
  } catch (error) {
    console.error("Click request failed", error);
    return fail("updateFailed", params);
  }
}
