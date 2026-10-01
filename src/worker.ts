import emdashWorker, { PluginBridge } from "@emdash-cms/cloudflare/worker";

export { PluginBridge };

/**
 * Browser-cache the optimized images.
 *
 * EmDash's `<Image>` emits `/_image?...` (Astro's deterministic resize/reformat
 * endpoint) and raw media loads hit `/_emdash/api/media/file/<ULID>` (immutable,
 * content-addressed filenames). The `routeRules` maxAge in astro.config.mjs makes
 * Cloudflare's EDGE cache store both for a year (verified: `cf-cache-status: HIT`),
 * but on the Astro Cloudflare adapter the response that reaches the BROWSER still
 * carries the conservative default `Cache-Control: public, max-age=0,
 * must-revalidate` (withastro/astro#13164, #16692). So every repeat view and every
 * client-side navigation re-requests each image and pays a revalidation round trip,
 * even though the bytes never change.
 *
 * Both URL shapes are safe to cache immutably in the browser: media filenames are
 * ULIDs that never change content, and each `/_image` variant is keyed by its full
 * href+w+h+f query, so a given URL always yields identical bytes. We rewrite ONLY
 * those two paths, ONLY on successful GETs, and leave every other response (EmDash
 * admin/API `private, no-store`, HTML, etc.) exactly as the framework set it.
 *
 * ponytail: narrowest responsible layer — a header rewrite in the site's own Worker
 * entry, no plugin, no core change. The ceiling: it can't shorten the 1-2s FIRST
 * transform of an uncached variant (that's the edge cache's job, already handled);
 * it only stops the browser from re-fetching. If EmDash ever sets a long-lived
 * browser Cache-Control on these routes itself, delete this wrapper.
 */
const IMMUTABLE = "public, max-age=31536000, immutable";

function isCacheableImagePath(pathname: string): boolean {
	return (
		pathname === "/_image" ||
		pathname.startsWith("/_emdash/api/media/file/")
	);
}

const baseFetch = emdashWorker.fetch;

export default {
	...emdashWorker,
	fetch: baseFetch
		? async function fetch(request: Request, env: unknown, ctx: unknown) {
				const response = await (
					baseFetch as (r: Request, e: unknown, c: unknown) => Promise<Response>
				)(request, env, ctx);

				if (request.method !== "GET" || !response.ok) return response;

				let pathname: string;
				try {
					pathname = new URL(request.url).pathname;
				} catch {
					return response;
				}
				if (!isCacheableImagePath(pathname)) return response;

				// Clone headers so we never mutate an immutable/locked header set.
				const headers = new Headers(response.headers);
				headers.set("cache-control", IMMUTABLE);
				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers,
				});
			}
		: undefined,
} satisfies ExportedHandler;
