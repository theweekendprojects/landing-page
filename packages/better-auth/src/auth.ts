/**
 * Better-Auth instance factory for EmDash.
 *
 * Wires Better-Auth to the EmDash custom adapter (users table + plugin
 * storage) and maps Better-Auth's `user` model onto EmDash's `users` columns
 * so a Better-Auth account IS an EmDash user.
 */

import { betterAuth } from "better-auth";
import type { Kysely } from "kysely";
import { emdashAdapter, type BetterAuthStorage } from "./emdash-adapter.js";

/**
 * EmDash's default role levels. New self-service sign-ups get SUBSCRIBER —
 * the lowest level — so hitting /signup never grants CMS admin access. A
 * user can be promoted to a higher role later via the EmDash admin UI, at
 * which point they can also sign in to /_emdash/admin (same users table).
 */
export const ROLE_SUBSCRIBER = 10;

export interface BetterAuthOptions {
	/**
	 * Public origin of the site, e.g. "https://example.workers.dev".
	 * Required by Better-Auth for cookie/redirect URL construction.
	 */
	baseURL: string;
	/**
	 * Secret used to sign tokens/cookies. Should come from an environment
	 * secret (e.g. `env.BETTER_AUTH_SECRET`). A stable per-site value.
	 */
	secret: string;
	/** Optional Google OAuth credentials. Omit to disable Google sign-in. */
	google?: { clientId: string; clientSecret: string };
	/** Extra trusted origins for CSRF/redirect validation. */
	trustedOrigins?: string[];
}

/**
 * Create a Better-Auth instance bound to the current request's EmDash
 * database and plugin storage.
 *
 * @param db      EmDash Kysely instance (from `locals.emdash.db`).
 * @param storage Plugin storage collections (from `getAuthProviderStorage`).
 * @param options Per-site configuration (baseURL, secret, optional Google).
 */
export function createBetterAuth(
	db: Kysely<{ users: Record<string, unknown> }>,
	storage: BetterAuthStorage,
	options: BetterAuthOptions,
) {
	return betterAuth({
		baseURL: options.baseURL,
		secret: options.secret,
		trustedOrigins: options.trustedOrigins,
		// Our adapter routes user -> users table, others -> plugin storage.
		database: emdashAdapter(db as unknown as Kysely<{ users: never }>, storage),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
		},
		...(options.google
			? {
					socialProviders: {
						google: {
							clientId: options.google.clientId,
							clientSecret: options.google.clientSecret,
						},
					},
				}
			: {}),
		// Map Better-Auth's `user` model onto EmDash's `users` columns. The
		// adapter's field-name mapping (via the factory) turns these logical
		// field names into physical column names before any SQL is built.
		user: {
			modelName: "users",
			fields: {
				name: "name",
				email: "email",
				emailVerified: "email_verified",
				image: "avatar_url",
				createdAt: "created_at",
				updatedAt: "updated_at",
			},
		},
		// account / session / verification live in schemaless plugin storage,
		// so we keep Better-Auth's native field names (no column mapping) and
		// just point each model at its own storage collection via modelName.
		account: { modelName: "account" },
		session: { modelName: "session" },
		verification: { modelName: "verification" },
		advanced: {
			// D1 has no native joins config need; keep defaults. Ensure we don't
			// try to use database-generated ids (our adapter makes ULIDs).
			database: {
				generateId: false,
			},
		},
	});
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>;
