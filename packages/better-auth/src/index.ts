/**
 * Better Auth Plugin for EmDash CMS
 *
 * Provides email/password and Google OAuth authentication via Better-Auth.
 * Stores users in EmDash's native users table with password hashes in oauth_accounts.password.
 *
 * @example
 * ```typescript
 * // astro.config.mjs
 * import { betterAuthProvider } from "@theweekendprojects/better-auth";
 *
 * emdash({
 *   authProviders: [betterAuthProvider()],
 * });
 * ```
 */
import type { AuthProviderDescriptor } from "emdash";
import { createBetterAuth } from "./auth.js";

export { createBetterAuth } from "./auth.js";

export function betterAuthProvider(): AuthProviderDescriptor {
	return {
		id: "better-auth",
		label: "Better Auth",
	};
}
