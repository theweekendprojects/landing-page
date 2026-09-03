# @theweekendprojects/better-auth

Email/password (and optional Google) authentication for [EmDash](https://emdashcms.com) sites, powered by [Better Auth](https://better-auth.com) with prebuilt [Better Auth UI](https://better-auth-ui.com) (HeroUI) sign-in / sign-up pages.

It registers as an EmDash `AuthProviderDescriptor`, so it plugs in with a single line and ships everything it needs — the API handler, the styled auth pages, and a light/dark/system theme toggle — with **no per-site database migrations**.

## What you get

- **Real EmDash users.** A Better Auth sign-up creates a row in EmDash's own `users` table, so the account is a first-class EmDash user: visible in the admin and governed by EmDash RBAC (the `role` column). New sign-ups default to the lowest role (subscriber, `10`) so hitting `/signup` never grants admin access.
- **Prebuilt, styled auth pages** at `/auth/*` (plus `/login` and `/signup` aliases) — sign-in, sign-up, forgot-password, reset-password, sign-out. Self-styled with HeroUI; they don't touch your site's theme.
- **Light / Dark / System theme toggle** on the auth pages, persisted per visitor.
- **Session bridging.** After sign-in/up the plugin writes EmDash's own session cookie, so the same account works for both the public site and `/_emdash/admin` (subject to role).
- **Portable storage.** Better Auth's session/account/verification state lives in EmDash's shared plugin storage (`getAuthProviderStorage`), namespaced `auth:better-auth` — no custom tables, no migration files.

## Requirements

- **EmDash** `^0.30.0`
- **React** `>=19.2.6` and **react-dom** `>=19.2.6` (HeroUI peer requirement; bump your site if it pins an older patch)
- **`@astrojs/react`** integration in your Astro config (the auth pages are React islands)
- **`@tailwindcss/vite`** wired into your Astro config — **required**. Better Auth UI (HeroUI) ships its styles as Tailwind v4 source, which must be compiled. Without this the auth pages render unstyled.
- A Cloudflare Workers deployment (this plugin reads secrets from the Worker `env` and uses EmDash's D1-backed storage). Other adapters may work but are untested.

## Install

```bash
pnpm add @theweekendprojects/better-auth
# peer/build deps if your project doesn't already have them:
pnpm add -D @tailwindcss/vite
```

> Supply-chain note: the `@better-auth-ui/*` packages are released frequently. If your project enforces a pnpm `minimumReleaseAge` cooldown, add `"@better-auth-ui/*"` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`.

## Setup

### 1. Register the provider

```js
// astro.config.mjs
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { betterAuthProvider } from "@theweekendprojects/better-auth";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  // Required: compiles the HeroUI auth styles. Output is scoped to the auth
  // island, so it does not affect your site's own styling.
  vite: { plugins: [tailwindcss()] },
  integrations: [
    react(),
    emdash({
      // ...your database/storage config...
      authProviders: [betterAuthProvider()],
    }),
  ],
});
```

That's it — the plugin injects all of these routes for you:

| Route | Purpose |
| --- | --- |
| `/api/auth/[...all]` | Better Auth API handler (sign-in, sign-up, callbacks, get-session, sign-out) |
| `/auth/[...path]` | Prebuilt auth UI: `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/sign-out` |
| `/login` | Friendly alias → `/auth/sign-in` |
| `/signup` | Friendly alias → `/auth/sign-up` |
| `/_emdash/admin/login` | Overrides EmDash's built-in passkey login and redirects to `/auth/sign-in` (single login door), preserving `?redirect=` |

Do **not** create your own `src/pages/login.astro` / `signup.astro` / `api/auth/*` — they would conflict with the injected routes.

**Single login door.** EmDash normally sends unauthenticated admins to its own
passkey login at `/_emdash/admin/login`. This plugin injects a redirect there
to `/auth/sign-in`, so admins and members use the same Better Auth login
screen. Because a Better Auth account *is* an EmDash user (same `users` table),
an admin (role ≥ 50) who signs in via Better Auth gets full CMS access, and the
`?redirect=` param carries them back to the admin page they requested. EmDash's
native passkey login is still reachable if you remove this route.

### 2. Set the runtime secrets

The plugin reads these from the Worker environment at request time. Set them as Cloudflare secrets (not just `.env` — `.env` is build-time only and is **not** available to the deployed Worker):

```bash
# Required. Generate with: openssl rand -base64 32
wrangler secret put BETTER_AUTH_SECRET

# Optional — enables Google sign-in (omit for email/password only)
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

| Variable | Required | Notes |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Yes | Signing/encryption secret. At least 32 chars, high entropy. |
| `GOOGLE_CLIENT_ID` | No | Enables Google sign-in when both Google vars are set. |
| `GOOGLE_CLIENT_SECRET` | No | Google sign-in is disabled if this is missing or left as a placeholder. |

#### Enabling Google sign-in

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an OAuth **Web application** client.
2. Add this **authorized redirect URI** (Better Auth's default callback path):
   `https://<your-domain>/api/auth/callback/google`
3. Upload the credentials as Worker secrets and redeploy:
   ```bash
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   ```
The auth pages detect the configured credentials at runtime and show the Google button automatically — no code change needed. If the credentials are absent (or the secret is left as a placeholder), Google is hidden and only email/password is offered.
| `EMDASH_SITE_URL` | No | Public origin override. Defaults to the request origin. |

For local development, put the same values in `.dev.vars` so `wrangler dev` picks them up.

### 3. Deploy

```bash
pnpm build && wrangler deploy
```

Then visit `/login` or `/signup`.

### No database migration required

This plugin ships **no migration files** and you don't need to write any. It reuses tables EmDash already manages:

- **`users`** — EmDash's core users table (created by EmDash's own migrations, which run automatically on first request). Sign-ups insert rows here.
- **`_plugin_storage`** — EmDash's shared plugin-storage table (also core). Better Auth's `accounts` / `sessions` / `verifications` records are stored here under the `auth:better-auth` namespace. The indexes for those collections are created **automatically at runtime** from the `storage` config in `betterAuthProvider()` — no SQL, no migration step.

So on a fresh site the correct sequence is just: register the provider, set `BETTER_AUTH_SECRET`, deploy, and load a page once so EmDash applies its core migrations. If you inspect the D1 database, do not add or expect `auth_*` tables — this plugin does not use any bespoke tables.

## How it works

- **User model → EmDash `users` table** via a custom Better Auth adapter (`emdashAdapter`), with field mapping (`emailVerified` → `email_verified`, `image` → `avatar_url`, etc.).
- **account / session / verification → EmDash plugin storage** (`getAuthProviderStorage(db, "better-auth", ...)`), stored in the shared `_plugin_storage` table under the `auth:better-auth` namespace. No custom tables.
- **The auth pages are a React island** (`AuthView`) rendering Better Auth UI's `<Auth path=... />` inside `QueryClientProvider` + `AuthProvider`, pointed at the `/api/auth` handler. HeroUI styles are compiled by Tailwind and loaded **only** on the auth routes.
- **Session bridge:** on a successful sign-in/up the injected route calls `context.session.set("user", { id })`; on sign-out it destroys that session. EmDash's own middleware reads that key, so the login is recognized site-wide.

## Customization

- **Default role for new sign-ups** is subscriber (`ROLE_SUBSCRIBER = 10`). Promote users to higher roles from the EmDash admin UI; once promoted they can also access `/_emdash/admin`.
- **Post-auth redirect** defaults to `/`. The pages honor a `?redirect=<path>` query param.
- **Theme** defaults to system; visitors can switch Light/Dark/System and the choice persists in `localStorage`.
- **Use the island directly** if you want auth UI on your own page instead of the injected routes:

  ```astro
  ---
  import AuthView from "@theweekendprojects/better-auth/ui";
  ---
  <AuthView path="sign-in" redirectTo="/" client:load />
  ```

- **Use the client** in your own components:

  ```ts
  import { authClient } from "@theweekendprojects/better-auth/client";
  await authClient.signIn.email({ email, password });
  ```

## Package exports

| Export | What |
| --- | --- |
| `.` | `betterAuthProvider()`, `createBetterAuth`, `emdashAdapter`, `PROVIDER_ID`, `BETTER_AUTH_STORAGE_CONFIG`, `ROLE_SUBSCRIBER` |
| `./client` | Better Auth browser client (`authClient`) |
| `./ui` | `AuthView` React island |
| `./route` | The `/api/auth/[...all]` handler (injected automatically) |
| `./pages/auth`, `./pages/login`, `./pages/signup` | The injected Astro pages |
| `./admin` | Login button shown on EmDash's admin login page |
| `./auth`, `./adapter` | Lower-level `createBetterAuth` / `emdashAdapter` |

## Notes & limitations

- **Cloudflare Workers–oriented.** Secrets come from the Worker `env`; storage uses EmDash's D1-backed plugin storage.
- **Google sign-in** requires real credentials set as Worker secrets; it's hidden otherwise.
- **Dependency footprint.** The prebuilt UI pulls in HeroUI v3 + several TanStack packages. The client bundle loads only on the `/auth` routes, not your content pages.
- **Email verification / password reset** views exist under `/auth/*`, but sending emails requires an EmDash email-transport provider to be configured.

## License

MIT
