import type { Adapter, AdapterSession, AdapterUser, AdapterVerificationToken } from "better-auth";
import type { Kysely } from "kysely";

// ============================================================================
// Database schema types for EmDash's auth tables
// ============================================================================

export interface AuthTables {
	users: UserTable;
	oauth_accounts: OAuthAccountTable;
	auth_sessions: AuthSessionTable;
	auth_verifications: AuthVerificationTable;
}

interface UserTable {
	id: string;
	email: string;
	name: string | null;
	avatar_url: string | null;
	role: number;
	email_verified: number;
	disabled: number;
	data: string | null;
	password: string | null; // Added for Better-Auth password storage
	created_at: string;
	updated_at: string;
}

interface OAuthAccountTable {
	provider: string;
	provider_account_id: string;
	user_id: string;
	created_at: string;
	password?: string | null; // Added for email/password auth (optional)
}

interface AuthSessionTable {
	id: string;
	user_id: string;
	expires_at: string;
	created_at: string;
	updated_at: string;
	ip_address?: string | null;
	user_agent?: string | null;
}

interface AuthVerificationTable {
	id: string;
	identifier: string;
	value: string;
	expires_at: string;
	created_at: string;
	updated_at: string;
}

// ============================================================================
// Row converters
// ============================================================================

function rowToUser(row: Selectable<UserTable>): AdapterUser {
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		emailVerified: row.email_verified === 1,
		avatarUrl: row.avatar_url,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}

function rowToSession(row: Selectable<AuthSessionTable>): AdapterSession {
	return {
		id: row.id,
		userId: row.user_id,
		expiresAt: new Date(row.expires_at),
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
		ipAddress: row.ip_address,
		userAgent: row.user_agent,
	};
}

function rowToVerificationToken(row: Selectable<AuthVerificationTable>): AdapterVerificationToken {
	return {
		id: row.id,
		identifier: row.identifier,
		token: row.value,
		expiresAt: new Date(row.expires_at),
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}

// ============================================================================
// Adapter implementation
// ============================================================================

export function createEmDashAdapter<T extends AuthTables>(db: Kysely<T>): Adapter {
	const kdb = db as unknown as Kysely<AuthTables>;

	return {
		// ========================================================================
		// Users
		// ========================================================================

		async createUser(data: Omit<AdapterUser, "id" | "createdAt" | "updatedAt">): Promise<AdapterUser> {
			const now = new Date().toISOString();
			const id = crypto.randomUUID();

			const row: Insertable<UserTable> = {
				id,
				email: data.email.toLowerCase(),
				name: data.name ?? null,
				avatar_url: data.avatarUrl ?? null,
				role: 10, // Default to subscriber role
				email_verified: data.emailVerified ? 1 : 0,
				disabled: 0,
				data: null,
				password: data.password ?? null,
				created_at: now,
				updated_at: now,
			};

			await kdb.insertInto("users").values(row).execute();

			return {
				id,
				email: row.email,
				name: row.name,
				emailVerified: row.email_verified === 1,
				avatarUrl: row.avatar_url,
				createdAt: new Date(now),
				updatedAt: new Date(now),
				password: row.password,
			};
		},

		async getUser(id: string): Promise<AdapterUser | null> {
			const row = await kdb
				.selectFrom("users")
				.selectAll()
				.where("id", "=", id)
				.executeTakeFirst();

			return row ? rowToUser(row) : null;
		},

		async getUserByEmail(email: string): Promise<AdapterUser | null> {
			const row = await kdb
				.selectFrom("users")
				.selectAll()
				.where("email", "=", email.toLowerCase())
				.executeTakeFirst();

			return row ? rowToUser(row) : null;
		},

		async getUserByEmailAndProvider(
			_email: string,
			_provider: string,
		): Promise<AdapterUser | null> {
			// Not used by Better-Auth for our use case
			return null;
		},

		async getUserByAccount(
			_provider: string,
			_providerAccountId: string,
		): Promise<AdapterUser | null> {
			// Not used by Better-Auth for our use case
			return null;
		},

		async updateUser(
			id: string,
			data: Partial<Omit<AdapterUser, "id" | "email" | "createdAt">>,
		): Promise<AdapterUser> {
			const update: Partial<Insertable<UserTable>> = {
				updated_at: new Date().toISOString(),
			};

			if (data.name !== undefined) update.name = data.name;
			if (data.emailVerified !== undefined) update.email_verified = data.emailVerified ? 1 : 0;
			if (data.avatarUrl !== undefined) update.avatar_url = data.avatarUrl;
			if (data.password !== undefined) update.password = data.password;

			await kdb.updateTable("users").set(update).where("id", "=", id).execute();

			const row = await kdb
				.selectFrom("users")
				.selectAll()
				.where("id", "=", id)
				.executeTakeFirst();

			if (!row) {
				throw new Error("User not found after update");
			}

			return rowToUser(row);
		},

		async deleteUser(id: string): Promise<void> {
			await kdb.deleteFrom("users").where("id", "=", id).execute();
		},

		// ========================================================================
		// Sessions
		// ========================================================================

		async createSession(data: {
			userId: string;
			expiresAt: Date;
			ipAddress?: string | null;
			userAgent?: string | null;
		}): Promise<AdapterSession> {
			const now = new Date().toISOString();
			const id = crypto.randomUUID();

			const row: Insertable<AuthSessionTable> = {
				id,
				user_id: data.userId,
				expires_at: data.expiresAt.toISOString(),
				created_at: now,
				updated_at: now,
				ip_address: data.ipAddress ?? null,
				user_agent: data.userAgent ?? null,
			};

			await kdb.insertInto("auth_sessions").values(row).execute();

			return {
				id,
				userId: row.user_id,
				expiresAt: new Date(row.expires_at),
				createdAt: new Date(now),
				updatedAt: new Date(now),
				ipAddress: row.ip_address,
				userAgent: row.user_agent,
			};
		},

		async getSessionAndUser(sessionId: string): Promise<{
			session: AdapterSession;
			user: AdapterUser;
		} | null> {
			const result = await kdb
				.selectFrom("auth_sessions")
				.innerJoin("users", "auth_sessions.user_id", "users.id")
				.selectAll("auth_sessions")
				.selectAll("users")
				.where("auth_sessions.id", "=", sessionId)
				.executeTakeFirst();

			if (!result) return null;

			return {
				session: rowToSession(result),
				user: rowToUser(result),
			};
		},

		async updateSession(
			sessionId: string,
			data: Partial<Omit<AdapterSession, "id" | "userId" | "createdAt">>,
		): Promise<AdapterSession> {
			const update: Partial<Insertable<AuthSessionTable>> = {
				updated_at: new Date().toISOString(),
			};

			if (data.expiresAt !== undefined) update.expires_at = data.expiresAt.toISOString();
			if (data.ipAddress !== undefined) update.ip_address = data.ipAddress ?? null;
			if (data.userAgent !== undefined) update.user_agent = data.userAgent ?? null;

			await kdb
				.updateTable("auth_sessions")
				.set(update)
				.where("id", "=", sessionId)
				.execute();

			const row = await kdb
				.selectFrom("auth_sessions")
				.selectAll()
				.where("id", "=", sessionId)
				.executeTakeFirst();

			if (!row) {
				throw new Error("Session not found after update");
			}

			return rowToSession(row);
		},

		async deleteSession(sessionId: string): Promise<void> {
			await kdb.deleteFrom("auth_sessions").where("id", "=", sessionId).execute();
		},

		// ========================================================================
		// Account
		// ========================================================================

		async createAccount(data: {
			userId: string;
			provider: string;
			providerAccountId: string;
			accessToken?: string | null;
			refreshToken?: string | null;
			expiresAt?: Date | null;
			password?: string | null;
			primaryKey?: boolean;
		}): Promise<AdapterAccount> {
			const now = new Date().toISOString();

			const row: Insertable<OAuthAccountTable> = {
				provider: data.provider,
				provider_account_id: data.providerAccountId,
				user_id: data.userId,
				created_at: now,
				password: data.password ?? null,
			};

			await kdb.insertInto("oauth_accounts").values(row).execute();

			return {
				userId: row.user_id,
				provider: row.provider,
				providerAccountId: row.provider_account_id,
				accessToken: data.accessToken ?? null,
				refreshToken: data.refreshToken ?? null,
				expiresAt: data.expiresAt ?? null,
				password: row.password,
				primaryKey: data.primaryKey ?? false,
			};
		},

		async getAccount(
			provider: string,
			providerAccountId: string,
		): Promise<AdapterAccount | null> {
			const row = await kdb
				.selectFrom("oauth_accounts")
				.selectAll()
				.where("provider", "=", provider)
				.where("provider_account_id", "=", providerAccountId)
				.executeTakeFirst();

			if (!row) return null;

			return {
				userId: row.user_id,
				provider: row.provider,
				providerAccountId: row.provider_account_id,
				accessToken: null, // Not stored in oauth_accounts
				refreshToken: null, // Not stored in oauth_accounts
				expiresAt: null, // Not stored in oauth_accounts
				password: row.password ?? null,
				primaryKey: false, // Not tracked
			};
		},

		async updateAccount(
			_provider: string,
			_providerAccountId: string,
			_data: Partial<AdapterAccount>,
		): Promise<AdapterAccount> {
			// Not used by Better-Auth for our use case
			throw new Error("Account update not implemented");
		},

		// ========================================================================
		// Verification
		// ========================================================================

		async createVerification(data: {
			identifier: string;
			value: string;
			expiresAt: Date;
		}): Promise<AdapterVerificationToken> {
			const now = new Date().toISOString();
			const id = crypto.randomUUID();

			const row: Insertable<AuthVerificationTable> = {
				id,
				identifier: data.identifier,
				value: data.value,
				expires_at: data.expiresAt.toISOString(),
				created_at: now,
				updated_at: now,
			};

			await kdb.insertInto("auth_verifications").values(row).execute();

			return rowToVerificationToken(row);
		},

		async getVerification(
			identifier: string,
			value: string,
		): Promise<AdapterVerificationToken | null> {
			const row = await kdb
				.selectFrom("auth_verifications")
				.selectAll()
				.where("identifier", "=", identifier)
				.where("value", "=", value)
				.executeTakeFirst();

			return row ? rowToVerificationToken(row) : null;
		},

		async deleteVerification(
			identifier: string,
			value: string,
		): Promise<void> {
			await kdb
				.deleteFrom("auth_verifications")
				.where("identifier", "=", identifier)
				.where("value", "=", value)
				.execute();
		},

		async deleteExpiredVerifications(): Promise<void> {
			await kdb
				.deleteFrom("auth_verifications")
				.where("expires_at", "<", new Date().toISOString())
				.execute();
		},
	};
}

// ============================================================================
// Type helpers
// ============================================================================

type Selectable<T> = {
	[K in keyof T]: T[K];
};

type Insertable<T> = {
	[K in keyof T]?: T[K] extends string
		? string | null
		: T[K] extends number
		? number | null
		: T[K] extends boolean
		? number | null // SQLite uses 0/1 for booleans
		: T[K] extends Date
		? string | null // Store as ISO string
		: T[K] extends object
		? T[K] | null
		: T[K];
};

interface AdapterAccount {
	userId: string;
	provider: string;
	providerAccountId: string;
	accessToken?: string | null;
	refreshToken?: string | null;
	expiresAt?: Date | null;
	password?: string | null;
	primaryKey?: boolean;
}
