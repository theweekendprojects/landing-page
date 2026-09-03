/**
 * Better-Auth catch-all Astro route for EmDash.
 *
 * Mounted by the plugin at `/api/auth/[...all]` (Better-Auth's default
 * `basePath` is `/api/auth`). Handles every Better-Auth endpoint
 * (`/api/auth/sign-in/email`, `/api/auth/sign-up/email`,
 * `/api/auth/callback/:provider`, `/api/auth/get-session`, etc.).
 *
 * Because this path is not under `/_emdash`, EmDash treats it as a public
 * route. On the anonymous public path EmDash attaches only a *partial*
 * `locals.emdash` (no `db`), so instead of reading `locals.emdash.db` we
 * resolve the shared runtime via `withEmDashRuntime()` — the officially
 * supported way to reach `runtime.db` from a request-free/public context. It
 * also installs the correct request-scoped DB in ALS for us.
 *
 * After a successful sign-in or sign-up, we bridge the freshly created
 * Better-Auth session into EmDash's own Astro session by writing
 * `session.set("user", { id })`. EmDash's admin middleware reads that key on
 * subsequent requests, so the same account works for both the public site and
 * `/_emdash/admin` (subject to the user's `role`).
 */

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { withEmDashRuntime } from "emdash/middleware";
import { getAuthProviderStorage } from "emdash/api/route-utils";
import { createBetterAuth } from "./auth.js";
import { BETTER_AUTH_STORAGE_CONFIG, PROVIDER_ID } from "./index.js";
import type { BetterAuthStorage } from "./emdash-adapter.js";

export const prerender = false;

/** Endpoints whose success should establish an EmDash session. */
const SESSION_ESTABLISHING = [
	"/api/auth/sign-in/email",
	"/api/auth/sign-up/email",
	"/api/auth/callback/",
];

/**
 * Normalize a configured base URL: trim whitespace and any trailing slash so
 * Better Auth builds `${baseURL}/verify-email?...` cleanly (no `//`).
 */
function normalizeOrigin(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const trimmed = value.trim().replace(/\/+$/, "");
	if (!trimmed) return undefined;
	try {
		// Accept a full URL or a bare origin; return just the origin.
		return new URL(trimmed).origin;
	} catch {
		return undefined;
	}
}

/**
 * Resolve the canonical public origin for the site, in priority order:
 *
 *   1. `BETTER_AUTH_URL` / `BETTER_AUTH_BASE_URL` env var — an explicit
 *      override the operator sets. Highest priority; the escape hatch for
 *      multi-domain deployments (custom domain + *.workers.dev, proxies, etc.).
 *   2. Astro's `site` config (`context.site`) — reused automatically if the
 *      adopting site already set `site:` in astro.config.mjs (common for
 *      canonical URLs / sitemaps). Zero extra config for those sites.
 *   3. The request origin — zero-config fallback that "just works" for a
 *      single-domain site.
 *
 * This is what makes the plugin portable: a new blog can adopt it with no
 * config at all (tier 3), reuse its existing `site:` (tier 2), or set one env
 * var for anything multi-domain (tier 1).
 *
 * IMPORTANT: absolute URLs are unavoidable for the links Better Auth emails
 * (a verification link opened days later from a mail client has no "current
 * origin"), so we always resolve to an absolute origin here. Only the *source*
 * of that origin degrades gracefully. Client-side calls remain origin-relative
 * (see client.ts) and need none of this.
 */
function resolveBaseURL(request: Request, siteFromConfig: URL | undefined): string {
	const workerEnv = env as Record<string, string | undefined>;
	const requestOrigin = new URL(request.url).origin;

	const configured =
		normalizeOrigin(workerEnv.BETTER_AUTH_URL) ??
		normalizeOrigin(workerEnv.BETTER_AUTH_BASE_URL) ??
		normalizeOrigin(siteFromConfig?.href);

	return configured ?? requestOrigin;
}

function readEnvConfig(request: Request, siteFromConfig: URL | undefined) {
	const workerEnv = env as Record<string, string | undefined>;
	const secret = workerEnv.BETTER_AUTH_SECRET ?? "insecure-dev-secret-change-me";
	const googleId = workerEnv.GOOGLE_CLIENT_ID;
	const googleSecret = workerEnv.GOOGLE_CLIENT_SECRET;
	const hasGoogle =
		!!googleId && !!googleSecret && googleSecret !== "PASTE_YOUR_CLIENT_SECRET_HERE";

	// The origin this request actually arrived on (canonical domain, the
	// *.workers.dev URL, or localhost in dev).
	const requestOrigin = new URL(request.url).origin;

	// Canonical origin used for ALL generated links (verification/reset emails,
	// OAuth callbacks, post-auth redirects), independent of the request host.
	const baseURL = resolveBaseURL(request, siteFromConfig);

	// Trust both the canonical origin and the origin the request came in on, so
	// requests made via the *.workers.dev URL (or localhost) aren't rejected as
	// untrusted during CSRF / redirect validation. De-duplicated.
	const trustedOrigins = Array.from(new Set([baseURL, requestOrigin]));

	return {
		baseURL,
		secret,
		google: hasGoogle ? { clientId: googleId!, clientSecret: googleSecret! } : undefined,
		trustedOrigins,
	};
}

/** Endpoints whose success should tear down the EmDash session. */
const SESSION_CLEARING = ["/api/auth/sign-out"];

const handler: APIRoute = async ({ request, session, site }) => {
	const path = new URL(request.url).pathname;
	const isSessionEstablishing = SESSION_ESTABLISHING.some((p) =>
		p.endsWith("/") ? path.startsWith(p) : path === p,
	);
	const isSessionClearing = SESSION_CLEARING.some((p) =>
		p.endsWith("/") ? path.startsWith(p) : path === p,
	);

	try {
		return await withEmDashRuntime(async (runtime) => {
			const storage = getAuthProviderStorage(
				runtime.db,
				PROVIDER_ID,
				BETTER_AUTH_STORAGE_CONFIG,
			) as unknown as BetterAuthStorage;

			const authOptions = readEnvConfig(request, site);
			// Pass the EmDash email pipeline to Better Auth for password reset
			// and email verification emails. This plugin remains provider-agnostic
			// — it depends only on EmDash's runtime.email, never on a specific
			// email provider like emdash-smtp or Resend.
			authOptions.email = runtime.email || null;

			const auth = createBetterAuth(runtime.db, storage, authOptions);
			const response = await auth.handler(request);

			// Bridge a successful auth into EmDash's own Astro session.
			if (session && isSessionEstablishing && response.ok) {
				try {
					const setCookie = response.headers.get("set-cookie");
					const headers = new Headers();
					if (setCookie) headers.set("cookie", setCookie);
					const result = await auth.api.getSession({ headers });
					const userId = result?.user?.id;
					if (userId) await session.set("user", { id: userId });
				} catch (err) {
					console.error("[better-auth] session bridge failed:", err);
				}
			}

			// Better-Auth sign-out clears only its own cookie; tear down EmDash's
			// bridged session too so the user is fully logged out.
			if (session && isSessionClearing && response.ok) {
				try {
					session.destroy();
				} catch (err) {
					console.error("[better-auth] session destroy failed:", err);
				}
			}

			return response;
		});
	} catch (err) {
		console.error("[better-auth] handler error:", err);
		return new Response(
			JSON.stringify({ error: "Authentication error", message: String(err) }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}
};

export const GET = handler;
export const POST = handler;
