import { createAdapterFactory } from "better-auth/adapters";
import type { Kysely } from "kysely";
import type { D1Database } from "@cloudflare/workers-types";

// EmDash's real tables
interface UsersTable {
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
}

interface OAuthAccountsTable {
	provider: string;
	provider_account_id: string;
	user_id: string;
	password?: string;
	created_at: string;
}

interface AuthSessionsTable {
	id: string;
	user_id: string;
	expires_at: string;
	created_at: string;
	updated_at: string;
	ip_address?: string;
	user_agent?: string;
}

interface AuthVerificationsTable {
	id: string;
	identifier: string;
	value: string;
	expires_at: string;
	created_at: string;
	updated_at: string;
}

interface DB {
	users: UsersTable;
	oauth_accounts: OAuthAccountsTable;
	auth_sessions: AuthSessionsTable;
	auth_verifications: AuthVerificationsTable;
}

export function createBetterAuthAdapter(db: Kysely<DB> | D1Database) {
	const adapterFactory = createAdapterFactory({
		models: {
			user: "users",
			account: "oauth_accounts",
			session: "auth_sessions",
			verification: "auth_verifications",
		},
	});

	return adapterFactory(
		{
			get connection() {
				return db;
			},
		},
		{
			User: {
				map: (data: UsersTable) => ({
					id: data.id,
					email: data.email,
					name: data.name,
					emailVerified: data.email_verified,
					image: data.avatar_url,
					role: data.role,
					disabled: data.disabled,
					data: data.data,
					createdAt: data.created_at,
					updatedAt: data.updated_at,
				}),
				fields: {
					email: "email",
					name: "name",
					emailVerified: "email_verified",
					image: "avatar_url",
					role: "role",
					disabled: "disabled",
					data: "data",
					createdAt: "created_at",
					updatedAt: "updated_at",
				},
			},
			Account: {
				map: (data: OAuthAccountsTable) => ({
					id: `${data.provider}:${data.provider_account_id}`,
					userId: data.user_id,
					provider: data.provider,
					providerAccountId: data.provider_account_id,
					accessToken: data.password || undefined,
					refreshToken: undefined,
					accessTokenExpiresAt: undefined,
					refreshTokenExpiresAt: undefined,
					scope: undefined,
					idToken: undefined,
					accessTokenType: undefined,
					createdAt: data.created_at,
					updatedAt: data.created_at,
				}),
				fields: {
					userId: "user_id",
					provider: "provider",
					providerAccountId: "provider_account_id",
					accessToken: "password",
				},
			},
			Session: {
				map: (data: AuthSessionsTable) => ({
					id: data.id,
					userId: data.user_id,
					expiresAt: data.expires_at,
					sessionToken: data.id,
					createdAt: data.created_at,
					updatedAt: data.updated_at,
					ipAddress: data.ip_address,
					userAgent: data.user_agent,
				}),
				fields: {
					userId: "user_id",
					expiresAt: "expires_at",
					sessionToken: "id",
					createdAt: "created_at",
					updatedAt: "updated_at",
					ipAddress: "ip_address",
					userAgent: "user_agent",
				},
			},
			Verification: {
				map: (data: AuthVerificationsTable) => ({
					id: data.id,
					identifier: data.identifier,
					value: data.value,
					expiresAt: data.expires_at,
					createdAt: data.created_at,
					updatedAt: data.updated_at,
				}),
				fields: {
					identifier: "identifier",
					value: "value",
					expiresAt: "expires_at",
					createdAt: "created_at",
					updatedAt: "updated_at",
				},
			},
		},
	);
}
