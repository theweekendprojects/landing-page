import type { PluginDescriptor } from "emdash";
import { betterAuthProvider } from "./auth-provider.js";
import { createBetterAuth } from "./auth.js";
import type { Kysely } from "kysely";
import type { D1Database } from "@cloudflare/workers-types";

export function betterAuthPlugin(): PluginDescriptor {
	return {
		id: "better-auth",
		version: "0.1.0",
		format: "standard",
		entrypoint: "better-auth/sandbox",
		options: {},
		capabilities: ["users:read", "network:request"],
	};
}

// Re-export for use in astro.config.mjs
export { betterAuthProvider, createBetterAuth };
