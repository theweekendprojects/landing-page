/**
 * Better-Auth plugin for EmDash CMS.
 *
 * Registers Better-Auth as an EmDash `AuthProviderDescriptor`. Sign-ups and
 * sign-ins create real EmDash users (in the `users` table), so a Better-Auth
 * account is a first-class EmDash user visible in the admin and governed by
 * EmDash RBAC. Better-Auth's own session/account/verification state lives in
 * EmDash plugin storage (`getAuthProviderStorage`), so the plugin is portable
 * across EmDash sites with no hand-written database migrations.
 *
 * @example
 * ```ts
 * // astro.config.mjs
 * import { betterAuthProvider } from "@theweekendprojects/better-auth";
 *
 * emdash({
 *   authProviders: [betterAuthProvider()],
 * });
 * ```
 *
 * Requires these Worker env vars / secrets at runtime:
 *   - BETTER_AUTH_SECRET       (required; `openssl rand -base64 32`)
 *   - GOOGLE_CLIENT_ID         (optional; enables Google sign-in)
 *   - GOOGLE_CLIENT_SECRET     (optional; enables Google sign-in)
 * The public origin is derived from the request (or EMDASH_SITE_URL).
 */

import type { AuthProviderDescriptor, PluginStorageConfig } from "emdash";

export { createBetterAuth, type BetterAuthOptions, ROLE_SUBSCRIBER } from "./auth.js";
export { emdashAdapter, type BetterAuthStorage } from "./emdash-adapter.js";

/** Provider id — also the storage namespace (`auth:better-auth`). */
export const PROVIDER_ID = "better-auth";

/**
 * Storage collections Better-Auth needs beyond the users table.
 * Indexes mirror the fields Better-Auth queries by so lookups stay fast:
 *   - accounts:      by userId (list a user's accounts) and by
 *                    provider+accountId (credential lookup on sign-in).
 *   - sessions:      by userId (revoke all) and token (session lookup).
 *   - verifications: by identifier (email verification / reset lookups).
 */
export const BETTER_AUTH_STORAGE_CONFIG = {
	accounts: {
		indexes: ["userId", "providerId", "accountId"] as const,
	},
	sessions: {
		indexes: ["userId", "token", "expiresAt"] as const,
	},
	verifications: {
		indexes: ["identifier", "expiresAt"] as const,
	},
} satisfies PluginStorageConfig;

/**
 * Register Better-Auth with EmDash.
 *
 * Returns an `AuthProviderDescriptor` that:
 *   - injects the catch-all Better-Auth route at `/api/auth/[...all]`
 *     (Better-Auth's default basePath), resolved from this package's exports;
 *   - declares the plugin storage collections it uses;
 *   - contributes a login button to the admin login page via `adminEntry`.
 */
export function betterAuthProvider(): AuthProviderDescriptor {
	return {
		id: PROVIDER_ID,
		label: "Better Auth",
		adminEntry: "@theweekendprojects/better-auth/admin",
		routes: [
			{
				pattern: "/api/auth/[...all]",
				entrypoint: "@theweekendprojects/better-auth/route",
			},
			// Prebuilt Better Auth UI (HeroUI) auth views, shipped with the
			// plugin so any EmDash site gets them without hand-writing auth
			// pages. Self-styled — they don't touch the site's theme. The
			// catch-all under /auth serves sign-in, sign-up, forgot-password,
			// reset-password, sign-out, etc. (Better Auth UI's default paths),
			// so the library's own cross-links resolve. /login and /signup are
			// friendly aliases that redirect into it.
			{
				pattern: "/auth/[...path]",
				entrypoint: "@theweekendprojects/better-auth/pages/auth",
			},
			{
				pattern: "/login",
				entrypoint: "@theweekendprojects/better-auth/pages/login",
			},
			{
				pattern: "/signup",
				entrypoint: "@theweekendprojects/better-auth/pages/signup",
			},
			// Single login door: override EmDash's built-in admin login page
			// (a static route out-specifies EmDash's /_emdash/admin/[...path]
			// catch-all) and redirect it to the Better Auth sign-in page,
			// carrying the ?redirect= param through. So admins and members use
			// the same login screen.
			{
				pattern: "/_emdash/admin/login",
				entrypoint: "@theweekendprojects/better-auth/pages/admin-login",
			},
		],
		storage: BETTER_AUTH_STORAGE_CONFIG,
	};
}
