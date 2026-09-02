import { betterAuth } from "better-auth";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";

// Create D1 database instance from Cloudflare D1 binding
// This must be called at request time with the correct env
export function createD1Database(db: any) {
	const dialect = new D1Dialect({ database: db });
	return new Kysely({ dialect });
}

export function createBetterAuth(db: any) {
	const database = createD1Database(db);
	const adapter = kyselyAdapter(database, { type: "sqlite" });

	return betterAuth({
		database: adapter,
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
		},
		socialProviders: {
			google: {
				clientId: "",
				clientSecret: "",
			},
		},
		baseURL: "https://landing-page.mineme-shahriar.workers.dev",
		advanced: {
			joins: true,
		},
	});
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>;
