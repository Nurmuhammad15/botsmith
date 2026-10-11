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
- Seller forms are explicitly labeled frontend demos with transient React state until real account and payment services are requested; never imply that money moved or records were persisted.
