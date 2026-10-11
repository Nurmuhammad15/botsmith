/// <reference types="node" />
// Payme Business "Merchant API" endpoint (JSON-RPC 2.0).
// Spec: https://developer.help.paycom.uz/protokol-merchant-api/ and /metody-merchant-api/
//
//  * Payme calls this endpoint with  Authorization: Basic base64("Paycom:" + KEY)
//  * every reply is HTTP 200 with either {"result":…,"id":…} or {"error":{code,message,data},"id":…}
//  * amounts are in tiyin; the cash desk's account field is "order_id" (our orders.id)
import { createHash, timingSafeEqual } from "node:crypto";
import { UUID_PATTERN, type PaymentsStore, type StoreError, type TxRow } from "./types";

type Localized = { ru: string; uz: string; en: string };
type RpcId = number | string | null;

export type FiscalConfig = {
  /** IKPU (product/service classifier code) registered for the cash desk. */
  code: string;
  packageCode: string;
  vatPercent: number;
};

export type PaymeDeps = {
  /** The cash desk key (or the sandbox TEST_KEY); unset means "not configured". */
  key: string | undefined;
  /** Null when the server has no database access; authorized requests then get a system error. */
  store: PaymentsStore | null;
  /** When set, CheckPerformTransaction also returns the fiscal receipt `detail`. */
  fiscal?: FiscalConfig | undefined;
};

const ERRORS = {
  notPost: [
    -32300,
    {
      ru: "Метод запроса не POST",
      uz: "So'rov usuli POST emas",
      en: "Request method must be POST",
    },
  ],
  parse: [-32700, { ru: "Ошибка разбора JSON", uz: "JSON tahlil xatosi", en: "JSON parse error" }],
  invalidRequest: [
    -32600,
    { ru: "Неверный запрос", uz: "Noto'g'ri so'rov", en: "Invalid request" },
  ],
  methodNotFound: [-32601, { ru: "Метод не найден", uz: "Usul topilmadi", en: "Method not found" }],
  auth: [
    -32504,
    {
      ru: "Недостаточно привилегий для выполнения метода",
      uz: "Usulni bajarish uchun huquqlar yetarli emas",
      en: "Insufficient privileges to perform this method",
    },
  ],
  system: [-32400, { ru: "Системная ошибка", uz: "Tizim xatosi", en: "System error" }],
  invalidAmount: [-31001, { ru: "Неверная сумма", uz: "Noto'g'ri summa", en: "Invalid amount" }],
  txNotFound: [
    -31003,
    { ru: "Транзакция не найдена", uz: "Tranzaksiya topilmadi", en: "Transaction not found" },
  ],
  cannotCancel: [
    -31007,
    {
      ru: "Заказ выполнен. Невозможно отменить транзакцию",
      uz: "Buyurtma bajarilgan. Tranzaksiyani bekor qilib bo'lmaydi",
      en: "Order is completed. The transaction cannot be cancelled",
    },
  ],
  cannotPerform: [
    -31008,
    {
      ru: "Невозможно выполнить операцию",
      uz: "Operatsiyani bajarib bo'lmaydi",
      en: "Unable to perform the operation",
    },
  ],
  orderNotFound: [
    -31050,
    { ru: "Заказ не найден", uz: "Buyurtma topilmadi", en: "Order not found" },
  ],
  orderNotPayable: [
    -31051,
    {
      ru: "Заказ нельзя оплатить",
      uz: "Buyurtmani to'lab bo'lmaydi",
      en: "The order cannot be paid",
    },
  ],
} as const satisfies Record<string, readonly [number, Localized]>;

type ErrorKey = keyof typeof ERRORS;

class PaymeError extends Error {
  constructor(
    readonly key: ErrorKey,
    readonly data?: unknown,
  ) {
    super(key);
  }
}

/** Account errors must name the offending account sub-field in `data`. */
const accountError = (key: "orderNotFound" | "orderNotPayable") => new PaymeError(key, "order_id");

const STORE_ERRORS: Record<StoreError, () => PaymeError> = {
  order_not_found: () => accountError("orderNotFound"),
  order_not_payable: () => accountError("orderNotPayable"),
  invalid_amount: () => new PaymeError("invalidAmount"),
  cannot_perform: () => new PaymeError("cannotPerform"),
  cannot_cancel: () => new PaymeError("cannotCancel"),
  tx_not_found: () => new PaymeError("txNotFound"),
  already_paid: () => new PaymeError("cannotPerform"),
  cancelled: () => new PaymeError("cannotPerform"),
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time comparison of the Basic credentials against `Paycom:<key>`. */
export function isAuthorized(header: string | null, key: string): boolean {
  if (!key || !header || !header.startsWith("Basic ")) return false;
  let provided: string;
  try {
    provided = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  return timingSafeEqual(sha256(provided), sha256(`Paycom:${key}`));
}

const reply = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=UTF-8" },
  });

function errorReply(id: RpcId, error: PaymeError) {
  const [code, message] = ERRORS[error.key];
  return reply({
    error: { code, message, ...(error.data !== undefined ? { data: error.data } : {}) },
    id,
  });
}

const timestamp = (iso: string | null) => (iso ? Date.parse(iso) : 0);

const view = (tx: TxRow) => ({
  create_time: timestamp(tx.created_at),
  perform_time: timestamp(tx.performed_at),
  cancel_time: timestamp(tx.cancelled_at),
  transaction: tx.id,
  state: tx.state,
  reason: tx.reason,
});

function orderIdFrom(params: Record<string, unknown>): string {
  const account = params["account"];
  const orderId = isRecord(account) ? account["order_id"] : undefined;
  if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) {
    throw accountError("orderNotFound");
  }
  return orderId.toLowerCase();
}

function amountFrom(params: Record<string, unknown>): number {
  const amount = params["amount"];
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new PaymeError("invalidAmount");
  }
  return amount;
}

function idFrom(params: Record<string, unknown>): string {
  const id = params["id"];
  if (typeof id !== "string" || id.length === 0 || id.length > 64) {
    throw new PaymeError("invalidRequest");
  }
  return id;
}

function unwrap<T extends { error: StoreError } | { tx: TxRow }>(result: T): TxRow {
  if ("error" in result) throw STORE_ERRORS[result.error]();
  return result.tx;
}

async function dispatch(
  method: string,
  params: Record<string, unknown>,
  store: PaymentsStore,
  fiscal: FiscalConfig | undefined,
) {
  switch (method) {
    case "CheckPerformTransaction": {
      const amount = amountFrom(params);
      const checked = await store.paymeCheckPerform(orderIdFrom(params), amount);
      if ("error" in checked) throw STORE_ERRORS[checked.error]();
      return {
        allow: true,
        ...(fiscal
          ? {
              detail: {
                receipt_type: 0,
                items: [
                  {
                    title: checked.title,
                    price: amount,
                    count: 1,
                    code: fiscal.code,
                    package_code: fiscal.packageCode,
                    vat_percent: fiscal.vatPercent,
                  },
                ],
              },
            }
          : {}),
      };
    }
    case "CreateTransaction": {
      const time = params["time"];
      if (typeof time !== "number" || !Number.isSafeInteger(time) || time <= 0) {
        throw new PaymeError("invalidRequest");
      }
      const tx = unwrap(
        await store.paymeCreate(idFrom(params), time, amountFrom(params), orderIdFrom(params)),
      );
      return { create_time: timestamp(tx.created_at), transaction: tx.id, state: tx.state };
    }
    case "PerformTransaction": {
      const tx = unwrap(await store.paymePerform(idFrom(params)));
      return { transaction: tx.id, perform_time: timestamp(tx.performed_at), state: tx.state };
    }
    case "CancelTransaction": {
      const reason = params["reason"];
      const tx = unwrap(
        await store.paymeCancel(idFrom(params), typeof reason === "number" ? reason : 10),
      );
      return { transaction: tx.id, cancel_time: timestamp(tx.cancelled_at), state: tx.state };
    }
    case "CheckTransaction":
      return view(unwrap(await store.paymeGet(idFrom(params))));
    case "GetStatement": {
      const from = params["from"];
      const to = params["to"];
      if (typeof from !== "number" || typeof to !== "number") {
        throw new PaymeError("invalidRequest");
      }
      const rows = await store.paymeStatement(from, to);
      return {
        transactions: rows.map((tx) => ({
          id: tx.provider_tx_id,
          time: tx.provider_time_ms,
          amount: tx.amount_tiyin,
          account: { order_id: tx.order_id },
          ...view(tx),
        })),
      };
    }
    default:
      throw new PaymeError("methodNotFound", method);
  }
}

/** Handles one Payme request; never throws. */
export async function handlePayme(request: Request, deps: PaymeDeps): Promise<Response> {
  if (request.method !== "POST") return errorReply(null, new PaymeError("notPost"));

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorReply(null, new PaymeError("parse"));
  }
  const rawId = isRecord(body) ? body["id"] : undefined;
  const id: RpcId = typeof rawId === "number" || typeof rawId === "string" ? rawId : null;

  // Authenticate before looking at anything else in the request.
  if (!isAuthorized(request.headers.get("authorization"), deps.key ?? "")) {
    return errorReply(id, new PaymeError("auth"));
  }
  if (!deps.store) {
    console.error("Payme request received but the payments database is not configured");
    return errorReply(id, new PaymeError("system"));
  }
  if (!isRecord(body) || typeof body["method"] !== "string" || !isRecord(body["params"])) {
    return errorReply(id, new PaymeError("invalidRequest"));
  }

  try {
    const result = await dispatch(body["method"], body["params"], deps.store, deps.fiscal);
    return reply({ result, id });
  } catch (error) {
    if (error instanceof PaymeError) return errorReply(id, error);
    console.error("Payme request failed", error);
    return errorReply(id, new PaymeError("system"));
  }
}
