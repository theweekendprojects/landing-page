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
import type { AuthProviderDescriptor, SessionBridge } from "emdash";
import { createBetterAuth } from "./auth.js";
import type { Kysely } from "kysely";
import type { D1Database } from "@cloudflare/workers-types";

interface DB {
	users: {
		id: string;
		email: string;
		name: string | null;
		avatar_url: string | null;
		role: string;
		email_verified: boolean;
		disabled: boolean;
		data: Record<string, unknown> | null;
		created_at: string;
		updated_at: string;
	};
	oauth_accounts: {
		provider: string;
		provider_account_id: string;
		user_id: string;
		password?: string;
		created_at: string;
	};
	auth_sessions: {
		id: string;
		user_id: string;
		expires_at: string;
		created_at: string;
		updated_at: string;
		ip_address?: string;
		user_agent?: string;
	};
	auth_verifications: {
		id: string;
		identifier: string;
		value: string;
		expires_at: string;
		created_at: string;
		updated_at: string;
	};
}

type DBClient = Kysely<DB> | D1Database;

export function betterAuthProvider(): AuthProviderDescriptor {
	return {
		id: "better-auth",
		name: "Better Auth",
		providers: [
			{
				id: "email",
				name: "Email",
				type: "email",
				signIn: async ({
					email,
					password,
					session,
				}: {
					email: string;
					password: string;
					session: SessionBridge;
				}) => {
					const auth = createBetterAuth(null as unknown as DBClient);
					const response = await auth.api.signInEmail({
						email,
						password,
						session: {
							headers: new Headers(),
						},
					});

					if (response.ok) {
						const user = response.data?.user;
						if (user) {
							await session.set("user", { id: user.id });
						}
						return {
							success: true,
							data: response.data,
						};
					}

					return {
						success: false,
						error: response.error?.message || "Sign in failed",
					};
				},
				signUp: async ({
					email,
					password,
					name,
					session,
				}: {
					email: string;
					password: string;
					name?: string;
					session: SessionBridge;
				}) => {
					const auth = createBetterAuth(null as unknown as DBClient);
					const response = await auth.api.signUpEmail({
						email,
						password,
						name,
						session: {
							headers: new Headers(),
						},
					});

					if (response.ok) {
						const user = response.data?.user;
						if (user) {
							await session.set("user", { id: user.id });
						}
						return {
							success: true,
							data: response.data,
						};
					}

					return {
						success: false,
						error: response.error?.message || "Sign up failed",
					};
				},
			},
			{
				id: "google",
				name: "Google",
				type: "oauth",
				url: "/api/auth/callback/google",
				signIn: async ({ session }: { session: SessionBridge }) => {
					// Google OAuth is handled by the catch-all route
					// This just triggers the redirect
					return {
						success: true,
						data: { url: "/api/auth/callback/google" },
					};
				},
			},
		],
	};
}

// Re-export for direct use
export { createBetterAuth };
