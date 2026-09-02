import { betterAuthProvider, createBetterAuth } from "@theweekendprojects/better-auth";
import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";

export { PluginBridge };

// Export a custom fetch handler that intercepts /api/auth/* routes
// before passing to EmDash's handler
export default {
	async fetch(request: Request, env: any, ctx: any) {
		const url = new URL(request.url);
		console.log("Request URL:", url.pathname);

		// Intercept Better-Auth routes
		if (url.pathname.startsWith("/api/auth")) {
			console.log("Better-Auth route detected:", url.pathname);
			try {
				// Create auth instance with current env (D1 binding)
				const auth = createBetterAuth(env.DB);
				return await auth.handler(request);
			} catch (err) {
				console.error("Better-Auth error:", err);
				return new Response(
					JSON.stringify({ error: "Authentication error", message: String(err) }),
					{ status: 500, headers: { "Content-Type": "application/json" } }
				);
			}
		}

		// This should never be reached for /api/auth routes
		console.warn("Falling through to EmDash handler for:", url.pathname);
		return handler.fetch(request, env, ctx);
	},
	scheduled: createScheduledHandler(),
};
