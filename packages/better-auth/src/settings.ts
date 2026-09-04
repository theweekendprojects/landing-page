/**
 * Better Auth admin-configurable settings.
 *
 * Single source of truth for the settings the companion EmDash plugin exposes
 * in the admin UI (a custom Block Kit page — see settings-plugin-entry.ts) and
 * that the auth route reads back at request time (via {@link resolveSettings}).
 *
 * WHY A COMPANION PLUGIN: Better Auth registers with EmDash as an
 * `AuthProviderDescriptor`, and that path has NO admin settings surface. Only
 * the full plugin system (`plugins: [...]` / `definePlugin`) can add admin UI.
 * So we ship a tiny second registration — a native plugin whose only job is to
 * own the settings page + storage. The auth provider reads those saved values
 * at runtime.
 *
 * WHY A CUSTOM PAGE (not `settingsSchema`): the declarative auto-rendered form
 * only shows in the admin "Plugins" manager, which is broken by a pre-existing
 * core bug (the plugin-list endpoint 500s). So we render our own Block Kit page
 * via `admin.pages` + `routes.admin`, like `emdash-smtp` does — its own sidebar
 * link + route, which sidesteps the broken list endpoint.
 *
 * STORAGE LAYOUT: each field is stored as its own kv key `settings:<field>`
 * (via `ctx.kv` in the admin page). `ctx.kv` persists to the options table
 * under `plugin:<id>:settings:<field>` — the exact prefix
 * `getPluginSettings(<id>)` reads back — so the admin page and the auth route
 * see the same flat `{ field: value }` map with no translation.
 *
 * PRECEDENCE: saved admin settings win over Worker env vars, which win over
 * built-in defaults. Env vars remain a working fallback so the site keeps
 * functioning before anything is saved.
 *
 * SECRETS TRADEOFF: secret values (incl. `betterAuthSecret`,
 * `googleClientSecret`) are stored in the DB as plaintext — the masked
 * `secret_input` field only hides them in the UI, it does not encrypt at rest.
 * Same as how `emdash-smtp` stores its API key. `betterAuthSecret` is the
 * session signing key; if the database leaks, sessions can be forged. Accepted
 * tradeoff pending an EmDash feature for encrypted secrets — until then,
 * keeping `BETTER_AUTH_SECRET` as a Worker secret (leave the admin field blank)
 * is the stronger posture.
 */

import type { KVAccess } from "emdash";

/** Plugin id that owns the settings form + storage namespace. */
export const SETTINGS_PLUGIN_ID = "better-auth-settings";

/**
 * Relative path for the settings admin page. Becomes the sidebar link
 * `/_emdash/admin/plugins/better-auth-settings/settings`.
 */
export const SETTINGS_ADMIN_PAGE_PATH = "/settings";

/**
 * Setting keys. Kept as a const object so the schema, the resolver, and any
 * callers all reference the same string literals (no typo drift).
 */
export const SETTINGS_KEYS = {
	requireEmailVerification: "requireEmailVerification",
	sendOnSignIn: "sendOnSignIn",
	autoSignInAfterVerification: "autoSignInAfterVerification",
	baseUrl: "baseUrl",
	betterAuthSecret: "betterAuthSecret",
	googleClientId: "googleClientId",
	googleClientSecret: "googleClientSecret",
} as const;

/**
 * Built-in defaults, applied when neither a saved setting nor an env var is
 * present. Must be applied in code: EmDash does NOT materialize
 * `settingsSchema` defaults into stored values, and `getPluginSetting`
 * returns `undefined` for unset keys.
 */
export const SETTINGS_DEFAULTS = {
	requireEmailVerification: true,
	sendOnSignIn: true,
	autoSignInAfterVerification: true,
} as const;

/** Boolean-typed setting keys (rendered as toggles, coerced on read). */
const BOOLEAN_KEYS = [
	SETTINGS_KEYS.requireEmailVerification,
	SETTINGS_KEYS.sendOnSignIn,
	SETTINGS_KEYS.autoSignInAfterVerification,
] as const;

/** Secret-typed setting keys (masked in UI; preserved on save when blank). */
const SECRET_KEYS = [
	SETTINGS_KEYS.betterAuthSecret,
	SETTINGS_KEYS.googleClientSecret,
] as const;

/** Plain-text setting keys. */
const TEXT_KEYS = [SETTINGS_KEYS.baseUrl, SETTINGS_KEYS.googleClientId] as const;

/**
 * Read every saved setting from plugin kv into a flat `{ field: value }` map.
 * Each field is its own kv key `settings:<field>`, matching the layout
 * `getPluginSettings(SETTINGS_PLUGIN_ID)` reads (so the auth route sees the
 * same values). Missing keys are simply absent from the map.
 */
export async function readKvSettings(kv: KVAccess): Promise<Record<string, unknown>> {
	const allKeys = [...BOOLEAN_KEYS, ...SECRET_KEYS, ...TEXT_KEYS];
	const out: Record<string, unknown> = {};
	for (const key of allKeys) {
		const value = await kv.get<unknown>(`settings:${key}`);
		if (value !== null && value !== undefined) out[key] = value;
	}
	return out;
}

/**
 * Persist submitted form values to plugin kv.
 *
 * - Booleans are coerced and always written (a toggle always sends a value).
 * - Text fields: write trimmed value, or delete the key when cleared.
 * - Secret fields: only overwrite when the user typed a new value; a blank
 *   submission leaves the stored secret untouched (the masked input sends
 *   nothing when the operator didn't change it). Mirrors emdash-smtp.
 */
export async function writeKvSettings(
	kv: KVAccess,
	values: Record<string, unknown>,
): Promise<void> {
	for (const key of BOOLEAN_KEYS) {
		await kv.set(`settings:${key}`, coerceBool(values[key], false));
	}
	for (const key of TEXT_KEYS) {
		const next = trimOrUndefined(values[key]);
		if (next !== undefined) await kv.set(`settings:${key}`, next);
		else await kv.delete(`settings:${key}`);
	}
	for (const key of SECRET_KEYS) {
		const next = trimOrUndefined(values[key]);
		// Only update when a new secret was entered; blank = keep existing.
		if (next !== undefined) await kv.set(`settings:${key}`, next);
	}
}

/** Resolved, typed Better Auth configuration after merging all sources. */
export interface ResolvedAuthSettings {
	requireEmailVerification: boolean;
	sendOnSignIn: boolean;
	autoSignInAfterVerification: boolean;
	/** Canonical origin override, or undefined to let the route resolve it. */
	baseUrl?: string;
	/** Session signing secret, or undefined to fall back to env. */
	secret?: string;
	google?: { clientId: string; clientSecret: string };
}

/** Raw env values the resolver may fall back to (all optional). */
export interface AuthEnvFallback {
	secret?: string;
	googleClientId?: string;
	googleClientSecret?: string;
	baseUrl?: string;
}

function trimOrUndefined(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Coerce a stored/env setting into a boolean, tolerating the string values
 * EmDash's form persistence may produce ("true"/"false"/"1"/"0").
 */
function coerceBool(value: unknown, fallback: boolean): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const v = value.trim().toLowerCase();
		if (v === "true" || v === "1" || v === "on" || v === "yes") return true;
		if (v === "false" || v === "0" || v === "off" || v === "no") return false;
	}
	if (typeof value === "number") return value !== 0;
	return fallback;
}

/**
 * Merge saved admin settings over env fallbacks over built-in defaults into a
 * single typed config. Pure and synchronous so it's trivial to unit-test; the
 * async DB read (`getPluginSettings`) happens in the caller (the auth route).
 *
 * A placeholder Google secret (the template's PASTE_YOUR_... value) is treated
 * as "not set" so Google stays hidden until real credentials exist.
 */
export function resolveSettings(
	saved: Record<string, unknown>,
	env: AuthEnvFallback,
): ResolvedAuthSettings {
	const requireEmailVerification = coerceBool(
		saved[SETTINGS_KEYS.requireEmailVerification],
		SETTINGS_DEFAULTS.requireEmailVerification,
	);
	const sendOnSignIn = coerceBool(
		saved[SETTINGS_KEYS.sendOnSignIn],
		SETTINGS_DEFAULTS.sendOnSignIn,
	);
	const autoSignInAfterVerification = coerceBool(
		saved[SETTINGS_KEYS.autoSignInAfterVerification],
		SETTINGS_DEFAULTS.autoSignInAfterVerification,
	);

	const baseUrl =
		trimOrUndefined(saved[SETTINGS_KEYS.baseUrl]) ?? trimOrUndefined(env.baseUrl);

	const secret =
		trimOrUndefined(saved[SETTINGS_KEYS.betterAuthSecret]) ??
		trimOrUndefined(env.secret);

	const googleClientId =
		trimOrUndefined(saved[SETTINGS_KEYS.googleClientId]) ??
		trimOrUndefined(env.googleClientId);
	let googleClientSecret =
		trimOrUndefined(saved[SETTINGS_KEYS.googleClientSecret]) ??
		trimOrUndefined(env.googleClientSecret);
	if (googleClientSecret === "PASTE_YOUR_CLIENT_SECRET_HERE") {
		googleClientSecret = undefined;
	}

	const google =
		googleClientId && googleClientSecret
			? { clientId: googleClientId, clientSecret: googleClientSecret }
			: undefined;

	return {
		requireEmailVerification,
		sendOnSignIn,
		autoSignInAfterVerification,
		baseUrl,
		secret,
		google,
	};
}
