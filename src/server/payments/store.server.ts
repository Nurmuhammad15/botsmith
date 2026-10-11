import type { PaymentsStore, StoreError, TxResult, TxRow } from "./types";

/** The only part of the Supabase client the store needs (lets tests pass a fake). */
export type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** PaymentsStore backed by the SQL functions in 0003_payments.sql (service role only). */
export function createPaymentsStore(client: RpcClient): PaymentsStore {
  async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(`${name} failed: ${error.message}`);
    return data as T;
  }

  const tx = async (name: string, args: Record<string, unknown>): Promise<TxResult> =>
    call<TxResult>(name, args);

  return {
    async paymeCheckPerform(orderId, amountTiyin) {
      return call<{ ok: true; title: string } | { error: StoreError }>("payme_check_perform", {
        p_order: orderId,
        p_amount_tiyin: amountTiyin,
      });
    },
    paymeCreate: (id, timeMs, amountTiyin, orderId) =>
      tx("payme_create_transaction", {
        p_id: id,
        p_time_ms: timeMs,
        p_amount_tiyin: amountTiyin,
        p_order: orderId,
      }),
    paymePerform: (id) => tx("payme_perform_transaction", { p_id: id }),
    paymeCancel: (id, reason) => tx("payme_cancel_transaction", { p_id: id, p_reason: reason }),
    paymeGet: (id) => tx("payme_get_transaction", { p_id: id }),
    async paymeStatement(fromMs, toMs) {
      return call<TxRow[]>("payme_statement", { p_from_ms: fromMs, p_to_ms: toMs });
    },
    clickPrepare: (clickTransId, paydocId, orderId, amountTiyin) =>
      tx("click_prepare", {
        p_click_trans_id: clickTransId,
        p_paydoc_id: paydocId,
        p_order: orderId,
        p_amount_tiyin: amountTiyin,
      }),
    clickComplete: (clickTransId, prepareSeq, orderId, amountTiyin, clickError) =>
      tx("click_complete", {
        p_click_trans_id: clickTransId,
        p_prepare_seq: prepareSeq,
        p_order: orderId,
        p_amount_tiyin: amountTiyin,
        p_click_error: clickError,
      }),
  };
}
