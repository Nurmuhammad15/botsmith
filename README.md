# BotHub

BotHub is a marketplace for Telegram bot subscriptions. Buyers choose 1-, 7-, or 30-day access;
sellers set each plan's price and manage buyer access from the order list. BotHub tracks payments,
subscription periods, refunds, and seller balances; sellers manually grant or revoke access on
their own bot service. BotHub does not sell or deliver bot source files.

## Development

Use Node.js 22 and npm.

```sh
git clone <this-repository-url>
cd <repository-name>
nvm use 22
npm i
npm run dev
```

## Database setup

Run the files in `supabase/migrations/` **in order** in the Supabase SQL editor (each file once):

| File                                  | Adds                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `0001_marketplace.sql`                | profiles/roles, bots, orders, reviews, withdrawals, support chat, row-level security |
| `0002_media_chat_favorites.sql`       | cover images, legacy bot-file storage, chat, favorites, de-duplicated view counting  |
| `0003_payments.sql`                   | Payme / Click payment transactions and their state machine                           |
| `0004_withdrawal_card_privacy.sql`    | private seller card numbers and audited admin reveal                                 |
| `0005_review_fixes.sql`               | refund, media moderation, review privacy, and size-limit fixes                       |
| `0006_chat_fixes.sql`                 | chat access and consistency fixes                                                    |
| `0007_subscriptions.sql`              | 1/7/30-day plans, consent and refunds, 5% commission, and expiry tracking            |
| `0008_manual_subscription_access.sql` | Removes seller webhooks; sellers manage access from paid orders                      |

To create the first administrator, register normally, then run in the SQL editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

Storage notes: covers are public images (JPG/PNG/WebP, 5 MB, up to 5 per bot). The old private
`bot-files` bucket may remain in the database for migration compatibility, but BotHub no longer
accepts, sells, or grants access to bot source files.

### Testing the SQL

The migrations are covered by tests that run against Postgres (PGlite, in WebAssembly) with
Supabase's roles stubbed in:

```sh
npm test
node supabase/tests/run.mjs
```

## Online payments (Payme and Click)

Buyers pay on the provider's page; the provider then calls two endpoints of this app, which mark
the order paid in the database. Nothing is marked paid by the browser.

| Endpoint          | Provider call                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/payme` | Payme Merchant API (JSON-RPC: CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction, CheckTransaction, GetStatement) |
| `POST /api/click` | Click Shop API (Prepare and Complete, MD5-signed)                                                                                                |

Before payment, buyers must accept the versioned subscription and refund terms. Until the provider
credentials below are set, the order page shows no online pay buttons; an administrator can confirm
an offline payment after seeing the buyer's recorded consent.

1. Open a merchant account. Both providers contract with businesses (a legal entity or a
   registered self-employed merchant with a settlement account); this takes days to weeks and
   cannot be done in code.
2. **Payme Business:** create a _web cash desk with billing_. Add one account field named
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

## Subscription access and refunds

No seller webhook, public seller endpoint, cron job, or webhook secret is required. BotHub is the
source of truth for payment, refund status, and subscription start/end times. Sellers use
**Seller dashboard → Orders** to see paid, expiring, expired, and refund-requested subscriptions,
then message buyers there to grant or revoke access on their bot service. Access on a seller's
external bot is managed manually; it is not automatically changed by BotHub. This keeps buyer
payments and refund decisions under platform control without requiring sellers to expose a server
endpoint or subscribe to Vercel Pro.

Subscription refund requests are reviewed by an administrator, and approved refunds must first be
manually processed through the original payment provider before being marked complete in Admin.

Seller revenue is 85% of the listed plan price. It becomes withdrawable 24 hours after payment if
no refund request is under review. Each manual withdrawal also charges a separate 5% fee.

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
