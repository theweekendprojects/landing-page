/**
 * Better Auth admin-configurable settings.
 *
 * This module is the single source of truth for the settings that the
 * companion EmDash plugin exposes in the admin UI (auto-rendered from
 * `SETTINGS_SCHEMA`) and that the auth route reads back at request time
 * (via {@link resolveSettings}).
 *
 * WHY A COMPANION PLUGIN: Better Auth registers with EmDash as an
 * `AuthProviderDescriptor`, and that registration path has NO admin settings
 * surface. Only the full plugin system (`plugins: [...]` / `definePlugin`)
 * can declare a `settingsSchema` that EmDash auto-renders into a settings
 * form and persists. So we ship a tiny second registration — a native plugin
 * whose only job is to own the settings form + storage. The auth provider then
 * reads those saved values at runtime.
 *
 * PRECEDENCE: saved admin settings win over Worker env vars, which win over
 * built-in defaults. Env vars remain a working fallback so the site keeps
 * functioning before anything is saved (and so a future migration to
 * encrypted-secret env storage is easy).
 *
 * SECRETS TRADEOFF: values entered in the admin UI (including
 * `betterAuthSecret` and `googleClientSecret`) are stored in EmDash's
 * `_plugin_storage` table in D1 as plaintext — `type: "secret"` only masks the
 * field in the UI, it does not encrypt at rest. This is the same way
 * `emdash-smtp` stores its Resend API key. `betterAuthSecret` is the session
 * signing key; if the database leaks, sessions can be forged. This is an
 * explicit, accepted tradeoff pending an EmDash feature for encrypted secret
 * storage — until then, keeping `BETTER_AUTH_SECRET` as a Worker secret (env
 * fallback, leaving the admin field blank) remains the stronger posture.
 */

import type { SettingField } from "emdash";

/** Plugin id that owns the settings form + storage namespace. */
export const SETTINGS_PLUGIN_ID = "better-auth-settings";

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

/**
 * The admin settings form, auto-rendered by EmDash from this schema.
 *
 * `boolean` → toggle, `secret` → masked input, `url`/`string` → text inputs.
 * Descriptions are shown under each field, so we use them to warn about the
 * secret-storage tradeoff and the env-var fallback right where the operator
 * is looking.
 */
export const SETTINGS_SCHEMA: Record<string, SettingField> = {
	[SETTINGS_KEYS.requireEmailVerification]: {
		type: "boolean",
		label: "Require email verification",
		description:
			"When on, a new account cannot sign in until its email is verified. Blocks bot-created accounts. Requires a working email provider (Settings → Email).",
		default: SETTINGS_DEFAULTS.requireEmailVerification,
	},
	[SETTINGS_KEYS.sendOnSignIn]: {
		type: "boolean",
		label: "Re-send verification on sign-in",
		description:
			"When an unverified user tries to sign in, automatically re-send the verification link so they don't have to find the original email.",
		default: SETTINGS_DEFAULTS.sendOnSignIn,
	},
	[SETTINGS_KEYS.autoSignInAfterVerification]: {
		type: "boolean",
		label: "Auto sign-in after verification",
		description:
			"When on, clicking the verification link logs the user in immediately (no separate sign-in step).",
		default: SETTINGS_DEFAULTS.autoSignInAfterVerification,
	},
	[SETTINGS_KEYS.baseUrl]: {
		type: "url",
		label: "Canonical site URL",
		description:
			"Absolute origin used for links in verification / password-reset emails (e.g. https://example.com). Leave blank to use astro.config `site:` or the request origin. Overrides the BETTER_AUTH_URL env var when set.",
		placeholder: "https://example.com",
	},
	[SETTINGS_KEYS.betterAuthSecret]: {
		type: "secret",
		label: "Better Auth secret",
		description:
			"Session signing key (min 32 chars). SECURITY: stored in the database, not encrypted — leave blank to keep using the BETTER_AUTH_SECRET Worker secret (recommended for the signing key).",
	},
	[SETTINGS_KEYS.googleClientId]: {
		type: "string",
		label: "Google client ID",
		description: "Enables Google sign-in when both Google fields are set. Falls back to the GOOGLE_CLIENT_ID env var.",
	},
	[SETTINGS_KEYS.googleClientSecret]: {
		type: "secret",
		label: "Google client secret",
		description:
			"Stored in the database (masked in UI, not encrypted at rest). Falls back to the GOOGLE_CLIENT_SECRET env var when blank.",
	},
};

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
