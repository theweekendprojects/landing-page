import { betterAuth } from "better-auth";
import { createAdapterFactory } from "better-auth/adapters";
import { google } from "better-auth/react/plugins";
import type { Kysely } from "kysely";
import type { AuthTables } from "./adapter.js";

// ============================================================================
// Custom adapter using createAdapterFactory
// ============================================================================

const emDashAdapter = (db: Kysely<AuthTables>) =>
	createAdapterFactory({
		config: {
			adapterId: "emdash",
			adapterName: "EmDash Custom Adapter",
			usePlural: false,
			debugLogs: false,
			supportsJSON: false,
			supportsDates: true,
			supportsBooleans: true,
			supportsNumericIds: true,
		},
		adapter: ({ getModelName }) => {
			const usersTable = getModelName("user");
			const sessionsTable = getModelName("session");
			const accountsTable = getModelName("account");
			const verificationsTable = getModelName("verification");

			return {
				create: async ({ data, model }) => {
					const tableName = getModelName(model);
					
					switch (model) {
						case "user": {
							const now = new Date().toISOString();
							const id = crypto.randomUUID();
							
							const row = {
								id,
								email: data.email?.toLowerCase(),
								name: data.name ?? null,
								avatar_url: data.avatarUrl ?? null,
								role: 10,
								email_verified: data.emailVerified ? 1 : 0,
								disabled: 0,
								data: null,
								password: (data as any).password ?? null,
								created_at: now,
								updated_at: now,
							};
							
							await db.insertInto(tableName).values(row).execute();
							return row;
						}
						
						case "session": {
							const id = crypto.randomUUID();
							const now = new Date().toISOString();
							
							const row = {
								id,
								user_id: data.userId,
								expires_at: data.expiresAt.toISOString(),
								created_at: now,
								updated_at: now,
								ip_address: data.ipAddress ?? null,
								user_agent: data.userAgent ?? null,
							};
							
							await db.insertInto(tableName).values(row).execute();
							return row;
						}
						
						case "account": {
							const now = new Date().toISOString();
							
							const row = {
								provider: data.provider,
								provider_account_id: data.providerAccountId,
								user_id: data.userId,
								created_at: now,
								password: (data as any).password ?? null,
							};
							
							await db.insertInto(tableName).values(row).execute();
							return row;
						}
						
						case "verification": {
							const id = crypto.randomUUID();
							const now = new Date().toISOString();
							
							const row = {
								id,
								identifier: data.identifier,
								value: data.value,
								expires_at: data.expiresAt.toISOString(),
								created_at: now,
								updated_at: now,
							};
							
							await db.insertInto(tableName).values(row).execute();
							return row;
						}
						
						default:
							throw new Error(`Unsupported model: ${model}`);
					}
				},
				
				findUnique: async ({ model, where }) => {
					const tableName = getModelName(model);
					
					// Simplified - would need proper where clause parsing
					throw new Error(`findUnique not implemented for ${model}`);
				},
				
				findMany: async ({ model }) => {
					const tableName = getModelName(model);
					return await db.selectFrom(tableName).selectAll().execute();
				},
				
				findFirst: async ({ model, where }) => {
					const tableName = getModelName(model);
					return await db.selectFrom(tableName).selectAll().where("id", "=", where.id).executeTakeFirst();
				},
				
				update: async ({ model, where, update }) => {
					const tableName = getModelName(model);
					const now = new Date().toISOString();
					
					const set: Record<string, unknown> = { updated_at: now };
					if (update.email !== undefined) set.email = update.email.toLowerCase();
					if (update.name !== undefined) set.name = update.name;
					if (update.avatarUrl !== undefined) set.avatar_url = update.avatarUrl;
					if (update.password !== undefined) set.password = update.password;
					if (update.emailVerified !== undefined) set.email_verified = update.emailVerified ? 1 : 0;
					if (update.expiresAt !== undefined) set.expires_at = update.expiresAt.toISOString();
					
					await db.updateTable(tableName).set(set).where("id", "=", where.id).execute();
					return { ...update, id: where.id, updated_at: now };
				},
				
				updateMany: async ({ model, where, update }) => {
					const tableName = getModelName(model);
					// Would need proper where clause parsing
					throw new Error("updateMany not implemented");
				},
				
				delete: async ({ model, where }) => {
					const tableName = getModelName(model);
					await db.deleteFrom(tableName).where("id", "=", where.id).execute();
				},
				
				deleteMany: async ({ model, where }) => {
					const tableName = getModelName(model);
					// Would need proper where clause parsing
					throw new Error("deleteMany not implemented");
				},
				
				count: async ({ model, where }) => {
					const tableName = getModelName(model);
					const result = await db
						.selectFrom(tableName)
						.select((eb) => eb.fn.countAll<number>().as("count"))
						.executeTakeFirst();
					return result?.count ?? 0;
				},
				
				consumeOne: async ({ model, where }) => {
					// For one-time use tokens
					const tableName = getModelName(model);
					const row = await db.selectFrom(tableName).selectAll().where("id", "=", where.id).executeTakeFirst();
					if (row) {
						await db.deleteFrom(tableName).where("id", "=", where.id).execute();
					}
					return row ?? null;
				},
				
				incrementOne: async ({ model, where, count }) => {
					// For rate limiting, etc.
					throw new Error("incrementOne not implemented");
				},
			};
		},
	});

// ============================================================================
// Better-Auth configuration
// ============================================================================

export const auth = betterAuth({
	database: {
		driver: "kysely",
		adapter: emDashAdapter,
	},
	authProviders: {
		google: google({
			clientId: process.env.GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
			redirectUrl: process.env.GOOGLE_REDIRECT_URL || "",
		}),
	},
	emailPassword: {
		enabled: true,
	},
});

// ============================================================================
// Export types
// ============================================================================

export type Auth = typeof auth;
