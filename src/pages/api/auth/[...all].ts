import { createBetterAuth } from "@theweekendprojects/better-auth";
import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";

export const GET: APIRoute = async (ctx) => {
	console.log("[API Route] GET request for:", ctx.request.url);
	return handleRequest(ctx);
};

export const POST: APIRoute = async (ctx) => {
	console.log("[API Route] POST request for:", ctx.request.url);
	return handleRequest(ctx);
};

async function handleRequest(ctx: any) {
	try {
		const db = env.DB;
		if (!db) {
			console.log("[API Route] No DB binding found");
			return new Response(JSON.stringify({ error: "No DB binding found" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}
		const auth = createBetterAuth(db);
		console.log("[API Route] Calling Better-Auth handler");
		const response = await auth.handler(ctx.request);
		console.log("[API Route] Better-Auth response:", response.status, response.headers.get("Content-Type"));
		return response;
	} catch (err: any) {
		console.error("[API Route] Error:", err?.message);
		const stack = err?.stack || String(err);
		return new Response(JSON.stringify({ error: err?.message || String(err), stack }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
