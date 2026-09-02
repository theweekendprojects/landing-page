import type { PluginDescriptor } from "emdash";

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
