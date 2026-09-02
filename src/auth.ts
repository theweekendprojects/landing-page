import { betterAuth } from "better-auth";
import { createEmDashKyselyInstance } from "./auth/better-auth-adapter.js";

export const auth = betterAuth({
	database: {
		db: createEmDashKyselyInstance(),
		type: "sqlite",
	},
	appURL: "http://localhost:4321",
	appName: "Landing Page",
	emailPassword: true,
	externalProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
		},
	},
});
