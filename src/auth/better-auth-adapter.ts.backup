/**
 * Better Auth Database Adapter for EmDash
 *
 * Maps Better Auth's expected schema to EmDash's native tables:
 * - users → users (EmDash's native users table)
 * - auth_credentials → auth_credentials (new table for password hashes)
 * - oauth_accounts → oauth_accounts (EmDash's existing OAuth table)
 * - auth_sessions → auth_sessions (new table for Better Auth sessions)
 * - auth_verifications → auth_verifications (new table for tokens)
 *
 * Better Auth v1 uses createAdapterFactory to wrap a CustomAdapter:
 * - The factory handles ID generation, field transformation, joins, logging
 * - We implement CustomAdapter with table/field name mappings to EmDash tables
 *
 * Usage in astro.config.mjs:
 *   betterAuth({
 *     database: {
 *       db: createEmDashKyselyInstance(),
 *       type: "sqlite"
 *     },
 *     // ...other options
 *   })
 */

import type { DBAdapterInstance, CustomAdapter, BetterAuthOptions } from "better-auth";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";

// Dynamically import to avoid ESM resolution issues
const { createAdapterFactory } = await import("@better-auth/core/db/adapter");

/**
 * Get EmDash table name from Better Auth model name
 */
function getTableName(model: string): string {
	const modelToTable: Record<string, string> = {
		user: "users",
		account: "oauth_accounts",
		session: "auth_sessions",
		verification: "auth_verifications",
		// Fallback for other models like rateLimit
		rateLimit: "rateLimit",
	};
	return modelToTable[model] || model;
}

/**
 * Transform Better Auth field names to EmDash field names
 * (handles camelCase → snake_case conversions)
 */
function transformInput(
	model: string,
	data: Record<string, any>,
): Record<string, any> {
	const fieldMappings: Record<string, Record<string, string>> = {
		user: {
			emailVerified: "email_verified",
			image: "avatar_url",
		},
		session: {
			ipAddress: "ip_address",
			userAgent: "user_agent",
		},
		account: {
			issuer: "provider",
			accountId: "provider_account_id",
			providerId: "provider",
			userId: "user_id",
			accessToken: "access_token",
			refreshToken: "refresh_token",
			idToken: "id_token",
			accessTokenExpiresAt: "expires_at",
			refreshTokenExpiresAt: "refresh_token_expires_at",
		},
		verification: {
			createdAt: "created_at",
			updatedAt: "updated_at",
		},
	};

	const transformed: Record<string, any> = {};
	for (const [key, value] of Object.entries(data)) {
		if (key === "id" || key === "userId") {
			transformed[key] = value;
		} else {
			transformed[fieldMappings[model]?.[key] || key] = value;
		}
	}
	return transformed;
}

/**
 * Transform EmDash field names back to Better Auth field names
 */
function transformOutput(
	model: string,
	data: Record<string, any>,
): Record<string, any> {
	const inverseFieldMappings: Record<string, Record<string, string>> = {
		user: {
			email_verified: "emailVerified",
			avatar_url: "image",
		},
		session: {
			ip_address: "ipAddress",
			user_agent: "userAgent",
		},
		account: {
			provider: "providerId",
			provider_account_id: "accountId",
			user_id: "userId",
			access_token: "accessToken",
			refresh_token: "refreshToken",
			id_token: "idToken",
			expires_at: "accessTokenExpiresAt",
			refresh_token_expires_at: "refreshTokenExpiresAt",
		},
		verification: {
			created_at: "createdAt",
			updated_at: "updatedAt",
		},
	};

	const transformed: Record<string, any> = {};
	for (const [key, value] of Object.entries(data)) {
		if (key === "id" || key === "userId") {
			transformed[key] = value;
		} else {
			transformed[inverseFieldMappings[model]?.[key] || key] = value;
		}
	}
	return transformed;
}

/**
 * CustomAdapter implementation for EmDash
 * 
 * Better Auth's createAdapterFactory wraps this CustomAdapter and handles:
 * - ID generation
 * - Field transformation (boolean, date, JSON, arrays)
 * - Where clause transformation
 * - Join handling
 * - Debug logging
 */
function createEmDashCustomAdapter(db: Kysely<any>): CustomAdapter {
	return {
		id: "emdash-kysely",

		// ==================== CORE METHODS ====================

		async create<T extends Record<string, any>>({
			model,
			data,
			select,
		}: {
			model: string;
			data: T;
			select?: string[] | undefined;
		}): Promise<T> {
			const tableName = getTableName(model);
			const transformedData = transformInput(model, data);

			let query = db.insertInto(tableName).values(transformedData);

			if (select && select.length > 0) {
				query = query.select(select);
			} else {
				query = query.returningAll();
			}

			const result = await query.executeTakeFirst();
			return transformOutput(model, result ?? ({} as T)) as T;
		},

		async findOne<T>({
			model,
			where,
			select,
			join,
		}: {
			model: string;
			where: any[];
			select?: string[] | undefined;
			join?: any | undefined;
		}): Promise<T | null> {
			const tableName = getTableName(model);

			let query = db.selectFrom(tableName);

			if (select && select.length > 0) {
				query = query.select(select);
			} else {
				query = query.selectAll();
			}

			query = query.where(this.buildWhereClause(tableName, where));

			if (join) {
				// Handle joins - for now just warn and continue
				console.warn(`[emdash-kysely] Joins not implemented for model ${model}`);
			}

			const result = await query.executeTakeFirst();
			return result ? transformOutput(model, result) : null;
		},

		async findMany<T>({
			model,
			where,
			limit,
			select,
			sortBy,
			offset,
			join,
		}: {
			model: string;
			where?: any[] | undefined;
			limit: number;
			select?: string[] | undefined;
			sortBy?: { field: string; direction: "asc" | "desc" } | undefined;
			offset?: number | undefined;
			join?: any | undefined;
		}): Promise<T[]> {
			const tableName = getTableName(model);

			let query = db.selectFrom(tableName);

			if (select && select.length > 0) {
				query = query.select(select);
			} else {
				query = query.selectAll();
			}

			if (where && where.length > 0) {
				query = query.where(this.buildWhereClause(tableName, where));
			}

			if (sortBy) {
				query = query.orderBy(sortBy.field, sortBy.direction);
			}

			if (offset !== undefined) {
				query = query.offset(offset);
			}

			query = query.limit(limit);

			if (join) {
				console.warn(`[emdash-kysely] Joins not implemented for model ${model}`);
			}

			const results = await query.execute();
			return results.map((r) => transformOutput(model, r));
		},

		async count({
			model,
			where,
		}: {
			model: string;
			where?: any[] | undefined;
		}): Promise<number> {
			const tableName = getTableName(model);

			let query = db
				.selectFrom(tableName)
				.select((eb) => eb.fn.count<number>("*").as("count"));

			if (where && where.length > 0) {
				query = query.where(this.buildWhereClause(tableName, where));
			}

			const result = await query.executeTakeFirst();
			return Number(result?.count ?? 0);
		},

		async update<T>({
			model,
			where,
			update,
		}: {
			model: string;
			where: any[];
			update: T;
		}): Promise<T | null> {
			const tableName = getTableName(model);
			const transformedUpdate = transformInput(model, update as Record<string, any>);

			const query = db.updateTable(tableName).set(transformedUpdate);
			const whereQuery = query.where(this.buildWhereClause(tableName, where));

			const result = await whereQuery.returningAll().executeTakeFirst();

			return result ? transformOutput(model, result) : null;
		},

		async updateMany({
			model,
			where,
			update,
		}: {
			model: string;
			where: any[];
			update: Record<string, any>;
		}): Promise<number> {
			const tableName = getTableName(model);
			const transformedUpdate = transformInput(model, update as Record<string, any>);

			const query = db.updateTable(tableName).set(transformedUpdate);
			const whereQuery = query.where(this.buildWhereClause(tableName, where));

			await whereQuery.execute();
			return 0; // Kysely doesn't return affected count directly
		},

		async delete({
			model,
			where,
		}: {
			model: string;
			where: any[];
		}): Promise<void> {
			const tableName = getTableName(model);

			await db
				.deleteFrom(tableName)
				.where(this.buildWhereClause(tableName, where))
				.execute();
		},

		async deleteMany({
			model,
			where,
		}: {
			model: string;
			where: any[];
		}): Promise<number> {
			const tableName = getTableName(model);

			await db
				.deleteFrom(tableName)
				.where(this.buildWhereClause(tableName, where))
				.execute();

			return 0;
		},

		// ==================== RACE-SAFE PRIMITIVES ====================

		async consumeOne<T>({
			model,
			where,
		}: {
			model: string;
			where: any[];
		}): Promise<T | null> {
			const tableName = getTableName(model);

			const query = db.deleteFrom(tableName);
			const whereQuery = query.where(this.buildWhereClause(tableName, where));

			const result = await whereQuery.returningAll().executeTakeFirst();

			return result ? transformOutput(model, result) : null;
		},

		async incrementOne<T>({
			model,
			where,
			increment,
			set,
		}: {
			model: string;
			where: any[];
			increment: Record<string, number>;
			set?: Record<string, unknown> | undefined;
		}): Promise<T | null> {
			const tableName = getTableName(model);

			const updates: Record<string, unknown> = { ...set };

			for (const [field, delta] of Object.entries(increment)) {
				updates[field] = db.ref(`${tableName}.${field}`).add(delta);
			}

			const query = db.updateTable(tableName).set(updates);
			const whereQuery = query.where(this.buildWhereClause(tableName, where));

			const result = await whereQuery.returningAll().executeTakeFirst();

			return result ? transformOutput(model, result) : null;
		},

		// ==================== HELPER METHODS ====================

		buildWhereClause(tableName: string, where: any[]): (qb: any) => any {
			return (qb: any) => {
				if (!where || where.length === 0) {
					return qb;
				}

				return where.reduce((query, w) => {
					const operator = w.operator ?? "eq";
					const field = w.field;
					const value = w.value;

					switch (operator) {
						case "eq":
							return query.where(`${tableName}.${field}`, "=", value);
						case "ne":
							return query.where(`${tableName}.${field}`, "!=", value);
						case "lt":
							return query.where(`${tableName}.${field}`, "<", value);
						case "lte":
							return query.where(`${tableName}.${field}`, "<=", value);
						case "gt":
							return query.where(`${tableName}.${field}`, ">", value);
						case "gte":
							return query.where(`${tableName}.${field}`, ">=", value);
						case "in":
							return query.whereIn(
								`${tableName}.${field}`,
								Array.isArray(value) ? value : [value],
							);
						case "not_in":
							return query.whereNotIn(
								`${tableName}.${field}`,
								Array.isArray(value) ? value : [value],
							);
						case "contains":
							return query.where(`${tableName}.${field}`, "like", `%${value}%`);
						case "starts_with":
							return query.where(`${tableName}.${field}`, "like", `${value}%`);
						case "ends_with":
							return query.where(`${tableName}.${field}`, "like", `%${value}`);
						default:
							return query.where(`${tableName}.${field}`, "=", value);
					}
				}, qb);
			};
		},
	};
}

/**
 * Create a Kysely instance connected to EmDash's D1 database
 *
 * Better Auth expects the database option to be:
 * - A Kysely instance
 * - An object with { db: Kysely<any>, type: "sqlite" | "postgres" | "mysql" }
 * - A dialect
 *
 * This function creates and returns a Kysely instance that Better Auth's
 * kyselyAdapter can wrap with its factory.
 */
export function createEmDashKyselyInstance(): Kysely<any> {
	// EmDash binds the D1 database to globalThis.DB at runtime
	// At config time, we access it via the global binding
	return new Kysely({
		dialect: new D1Dialect({
			database: (globalThis as any).DB,
		}),
	});
}

/**
 * DBAdapterInstance factory for Better Auth
 * 
 * Better Auth calls this when options.database is a function.
 * The factory wraps our CustomAdapter with the adapter factory that handles:
 * - ID generation
 * - Field transformation (boolean, date, JSON, arrays)
 * - Where clause transformation
 * - Join handling
 * - Debug logging
 * 
 * However, Better Auth v1's kyselyAdapter already does this wrapping internally,
 * so we just return the Kysely instance directly.
 */
export function createEmDashAdapter(): Kysely<any> {
	return createEmDashKyselyInstance();
}
