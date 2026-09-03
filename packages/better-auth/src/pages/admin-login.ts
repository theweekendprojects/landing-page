/**
 * Single login door: override EmDash's built-in admin login.
 *
 * EmDash's auth middleware hardcodes a redirect to `/_emdash/admin/login` for
 * unauthenticated admin requests, and serves that path from its admin SPA
 * (a passkey login screen). By injecting a route at exactly this path (which
 * out-specifies EmDash's `/_emdash/admin/[...path]` catch-all in Astro's route
 * priority), we take over that URL and forward everyone to the Better Auth
 * sign-in page instead — so the site has one login door.
 *
 * EmDash appends `?redirect=<the admin path they wanted>`; we carry it through
 * to Better Auth as its `redirect` param so, after signing in, the user lands
 * back on the admin page they were headed to (e.g. `/_emdash/admin`).
 */

import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = ({ url, redirect }) => {
	// EmDash uses `?redirect=`; Better Auth's alias page reads the same key.
	// Default to the admin dashboard so a bare visit still lands somewhere useful.
	const target = url.searchParams.get("redirect") || "/_emdash/admin";
	const dest = `/auth/sign-in?redirect=${encodeURIComponent(target)}`;
	return redirect(dest, 302);
};
