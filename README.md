# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js 22 and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
nvm use 22
npm i
npm run dev
```

## Database setup

Run the files in `supabase/migrations/` **in order** in the Supabase SQL editor (each file once):

| File | Adds |
| --- | --- |
| `0001_marketplace.sql` | profiles/roles, bots, orders, reviews, withdrawals, support chat, row level security |
| `0002_media_chat_favorites.sql` | cover images and bot files (Storage buckets `bot-covers` and `bot-files`), buyer–seller chat, favorites, de-duplicated view counting |
| `0003_payments.sql` | Payme / Click payment transactions and their state machine |
| `0005_review_fixes.sql` | fixes from the security review: refunds vs. withdrawals, file access timing, media moderation bypasses, review privacy, size limits |
| `0004_withdrawal_card_privacy.sql` | seller card numbers are no longer readable by clients; administrators reveal them through an audited function |

To create the first administrator, register normally, then run in the SQL editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

Storage notes: covers are public images (JPG/PNG/WebP, 5 MB, up to 5 per bot). Bot files are
private (50 MB each, up to 10 per bot) and can only be downloaded by the seller and by buyers whose
order is being delivered or done (the same moment refunds close). If your Supabase plan caps uploads below 50 MB, lower the bucket limit in
`0002_media_chat_favorites.sql`.

### Testing the SQL

The migrations are covered by tests that run against a real Postgres (PGlite, in WebAssembly)
with Supabase's roles stubbed in. It is not a project dependency, so install it on demand:

```sh
npm install --no-save @electric-sql/pglite
node supabase/tests/run.mjs          # roles, RLS, storage rules, chat, payments state machine
npm test                             # also runs the payment endpoint tests against the real SQL
```

## Online payments (Payme and Click)

Buyers pay on the provider's page; the provider then calls two endpoints of this app, which mark
the order paid in the database. Nothing is marked paid by the browser.

| Endpoint | Provider call |
| --- | --- |
| `POST /api/payme` | Payme Merchant API (JSON-RPC: CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction, CheckTransaction, GetStatement) |
| `POST /api/click` | Click Shop API (Prepare and Complete, MD5-signed) |

Until the credentials below are set, the order page shows no pay buttons and orders are confirmed
by an administrator (Admin → Buyurtmalar → "To'langan").

1. Open a merchant account. Both providers contract with businesses (a legal entity or a
   registered self-employed merchant with a settlement account); this takes days to weeks and
   cannot be done in code.
2. **Payme Business:** create a *web cash desk with billing*. Add one account field named
   `order_id` (text). Set its endpoint URL to `https://<your-domain>/api/payme`. Copy the cash desk
   ID and Key (the sandbox gives a separate `TEST_KEY`).
3. **Click:** in the merchant cabinet create a service whose Prepare and Complete URLs are both
   `https://<your-domain>/api/click`. Note the service ID, merchant ID and secret key.
4. Set the environment variables from `.env.example`. `SUPABASE_SERVICE_ROLE_KEY`, `PAYME_KEY`
   and `CLICK_SECRET_KEY` are secrets: add them only to your host's secret settings.
5. Test in each provider's sandbox first (Payme: `https://test.paycom.uz`, set
   `VITE_PAYME_CHECKOUT_URL` and use the `TEST_KEY`), then switch to the production keys.

Orders are charged at the price stored in the database; the amount in a payment link is only a
convenience and is verified by the endpoints (a wrong amount is rejected).

Money going **out** to sellers is still manual: a seller requests a withdrawal, an administrator
transfers it to the card and marks it paid. Automating this needs a payout product from your
payment provider or bank (ask Payme/Click about split payments or payouts to cards); it is a
separate agreement, not something the app can switch on by itself.

## Supabase authentication

Login and registration use Supabase Auth. Copy `.env.example` to `.env.local` and
set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project.
Enable email/password authentication and allow the app's local URL in the
project's redirect URL settings. Registration stores the name, contact phone,
and selected role as user metadata; passwords are handled by Supabase Auth.

Production builds are minified and do not include source maps. Browser-delivered
HTML and JavaScript can still be inspected with browser developer tools; never
put private keys, passwords, or server-only logic in client-side code. The
Supabase publishable/anon key is intended for browser use and must be protected
by correct Supabase Row Level Security policies.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
