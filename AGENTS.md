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
- Data is real: Supabase Postgres with RLS (`supabase/migrations/`). Pages read/write through `src/lib/api.ts`; balances, prices and statuses change only via SECURITY DEFINER functions, never from client-side state. Payme/Click are not connected, so orders stay `pending_payment` until an admin marks them paid; never imply an automatic payment or payout happened.
