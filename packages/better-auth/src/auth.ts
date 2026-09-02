import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createBetterAuthAdapter } from "./better-auth-adapter";
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

export function createBetterAuth(db: DBClient) {
	const adapter = createBetterAuthAdapter(db);

	return betterAuth({
		database: adapter,
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
		},
		plugins: [
			{
				id: "google",
				config: {
					clientId: "",
					clientSecret: "",
					callback: "/api/auth/callback/google",
					profile: async (accessToken) => {
						const res = await fetch(
							"https://www.googleapis.com/oauth2/v2/userinfo",
							{
								headers: {
									Authorization: `Bearer ${accessToken}`,
								},
							},
						);
						const data = await res.json();
						return {
							id: data.id,
							email: data.email,
							name: data.name,
							image: data.picture,
						};
					},
				},
			},
		],
		instanceMetadata: {
			baseURL: "https://theweekendprojects-landing-page.mineme-shahriar.workers.dev",
		},
	});
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>;
