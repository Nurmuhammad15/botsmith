# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

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
