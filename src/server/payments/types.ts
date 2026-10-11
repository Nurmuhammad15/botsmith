// Shapes shared by the payment endpoints and their storage. The state machine itself lives in
// the database (supabase/migrations/0003_payments.sql); the endpoints only translate between
// the provider protocols and those functions.

/** A row of public.payment_transactions as returned by the SQL functions. */
export type TxRow = {
  id: string;
  seq: number;
  order_id: string;
  provider: "payme" | "click";
  provider_tx_id: string;
  provider_doc_id: string | null;
  amount_tiyin: number;
  /** 1 created, 2 performed, -1 cancelled, -2 cancelled after performing (refund). */
  state: 1 | 2 | -1 | -2;
  reason: number | null;
  provider_time_ms: number | null;
  created_at: string;
  performed_at: string | null;
  cancelled_at: string | null;
};

/** Business errors the SQL functions can report (instead of raising). */
export type StoreError =
  | "order_not_found"
  | "order_not_payable"
  | "invalid_amount"
  | "cannot_perform"
  | "cannot_cancel"
  | "tx_not_found"
  | "already_paid"
  | "cancelled";

export type TxResult = { tx: TxRow } | { error: StoreError };

export interface PaymentsStore {
  paymeCheckPerform(
    orderId: string,
    amountTiyin: number,
  ): Promise<{ ok: true; title: string } | { error: StoreError }>;
  paymeCreate(id: string, timeMs: number, amountTiyin: number, orderId: string): Promise<TxResult>;
  paymePerform(id: string): Promise<TxResult>;
  paymeCancel(id: string, reason: number): Promise<TxResult>;
  paymeGet(id: string): Promise<TxResult>;
  paymeStatement(fromMs: number, toMs: number): Promise<TxRow[]>;
  clickPrepare(
    clickTransId: string,
    paydocId: string,
    orderId: string,
    amountTiyin: number,
  ): Promise<TxResult>;
  clickComplete(
    clickTransId: string,
    prepareSeq: number,
    orderId: string,
    amountTiyin: number,
    clickError: number,
  ): Promise<TxResult>;
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
