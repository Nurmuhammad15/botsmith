<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Seller sections use standalone leaf routes and a shared horizontal navigation in DashboardLayout; this keeps seller navigation distinct from the marketplace and every section directly accessible.
- Data is real: Supabase Postgres with RLS (`supabase/migrations/`, applied in order). Pages read/write through `src/lib/api*.ts`; balances, prices, statuses and view counts change only via SECURITY DEFINER functions, never from client-side state. Tests for the SQL live in `supabase/tests/` (PGlite; see README).
- Bot covers are public (bucket `bot-covers`); bot files are private (`bot-files`) and readable only by the seller and buyers with a paid order. Storage paths are always `<seller_id>/<bot_id>/<file>`.
- Online payments: `/api/payme` and `/api/click` (code in `src/server/payments/`, `*.server.ts` files are server-only) drive a state machine in `0003_payments.sql` using the service-role key. Keys come from server env vars (`.env.example`); without them the app falls back to admin-confirmed payments. Seller payouts are manual; never imply that money was sent automatically.
- Withdrawal card numbers are not selectable by clients (`0004`): list columns explicitly on `withdrawals`, show `card_last4`, and let admins reveal the full number only via `admin_reveal_withdrawal_card` (audited).
