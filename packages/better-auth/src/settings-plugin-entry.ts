/**
 * Runtime entrypoint for the Better Auth settings companion plugin.
 *
 * This is the module the `format: "native"` descriptor (in index.ts) points at
 * via `entrypoint`. EmDash imports it and calls `createPlugin()` to instantiate
 * the plugin in-process.
 *
 * WHY A CUSTOM ADMIN PAGE (not `settingsSchema`):
 * EmDash's declarative `admin.settingsSchema` auto-renders a form, but that form
 * is only surfaced through the admin "Plugins" manager page, which first calls
 * the `/_emdash/api/admin/plugins` list endpoint. On this EmDash version that
 * endpoint 500s (a pre-existing core bug unrelated to this plugin — it throws
 * before our plugin is even reached), so a `settingsSchema` form never displays.
 *
 * So we use the same mechanism `emdash-smtp` uses instead: declare an
 * `admin.pages` entry (its own sidebar link + route) and a `routes.admin`
 * handler that renders a Block Kit form and persists values via `ctx.kv`. That
 * path has its own URL and never touches the broken list endpoint, so it works
 * today. The auth provider reads the saved values back at request time via
 * `getPluginSettings(SETTINGS_PLUGIN_ID)` (see route.ts + settings.ts).
 *
 * STORAGE LAYOUT: we write each field as its own kv key `settings:<field>`.
 * `ctx.kv.set("settings:x", v)` persists to the options table under
 * `plugin:<id>:settings:x` — exactly the prefix `getPluginSettings(<id>)` reads
 * back — so the admin page and the auth route agree on the same values with no
 * translation. (Verified against EmDash's createKVAccess + getPluginSettings.)
 *
 * SECURITY: secret fields are stored in the database (masked in the UI via
 * `secret_input`/`has_value`, not encrypted at rest), the same way emdash-smtp
 * stores its API key. See settings.ts for the full tradeoff note.
 */

import { definePlugin } from "emdash";

import {
	SETTINGS_ADMIN_PAGE_PATH,
	SETTINGS_KEYS,
	SETTINGS_PLUGIN_ID,
	readKvSettings,
	writeKvSettings,
} from "./settings.js";

// Keep in sync with the version reported by the descriptor factory.
export const SETTINGS_PLUGIN_VERSION = "0.1.0";

/** Block Kit form submit action id. */
const SAVE_ACTION_ID = "save_auth";

/** Minimal shape of the admin interaction payload we care about. */
interface AdminInteraction {
	type?: string;
	action_id?: string;
	values?: Record<string, unknown>;
}

/** A rendered admin page: Block Kit elements + optional toast. */
interface AdminPage {
	blocks: unknown[];
	toast?: { message: string; type: "info" | "success" | "error" };
}

/**
 * Build the settings page from the current saved values. Secret fields render
 * with `has_value` (never the value itself) so the UI shows "configured"
 * without exposing the secret.
 */
function buildSettingsPage(
	saved: Record<string, unknown>,
	toast?: AdminPage["toast"],
): AdminPage {
	const bool = (v: unknown) => v === true || v === "true" || v === "1" || v === "on";
	const str = (v: unknown) => (typeof v === "string" ? v : "");
	const hasVal = (v: unknown) => typeof v === "string" && v.trim() !== "";

	const blocks: unknown[] = [
		{ type: "header", text: "Better Auth" },
		{
			type: "context",
			text: "Configure Better Auth without redeploying. Blank fields fall back to the matching Worker env var (BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET, BETTER_AUTH_URL), then to built-in defaults.",
		},
		{ type: "divider" },
		{
			type: "form",
			block_id: "better-auth-settings",
			fields: [
				{
					type: "toggle",
					action_id: SETTINGS_KEYS.requireEmailVerification,
					label: "Require email verification",
					description:
						"Block unverified accounts from signing in. Needs a working email provider (Settings → Email).",
					initial_value: bool(saved[SETTINGS_KEYS.requireEmailVerification]),
				},
				{
					type: "toggle",
					action_id: SETTINGS_KEYS.sendOnSignIn,
					label: "Re-send verification on sign-in",
					description: "Re-send the link when an unverified user tries to log in.",
					initial_value: bool(saved[SETTINGS_KEYS.sendOnSignIn]),
				},
				{
					type: "toggle",
					action_id: SETTINGS_KEYS.autoSignInAfterVerification,
					label: "Auto sign-in after verification",
					description: "Log the user in immediately when they click the verification link.",
					initial_value: bool(saved[SETTINGS_KEYS.autoSignInAfterVerification]),
				},
				{
					type: "text_input",
					action_id: SETTINGS_KEYS.baseUrl,
					label: "Canonical site URL",
					placeholder: "https://example.com",
					initial_value: str(saved[SETTINGS_KEYS.baseUrl]),
				},
				{
					type: "secret_input",
					action_id: SETTINGS_KEYS.betterAuthSecret,
					label: "Better Auth secret",
					has_value: hasVal(saved[SETTINGS_KEYS.betterAuthSecret]),
				},
				{
					type: "text_input",
					action_id: SETTINGS_KEYS.googleClientId,
					label: "Google client ID",
					initial_value: str(saved[SETTINGS_KEYS.googleClientId]),
				},
				{
					type: "secret_input",
					action_id: SETTINGS_KEYS.googleClientSecret,
					label: "Google client secret",
					has_value: hasVal(saved[SETTINGS_KEYS.googleClientSecret]),
				},
			],
			submit: { label: "Save settings", action_id: SAVE_ACTION_ID },
		},
		{
			type: "context",
			text: "Security: secret fields are stored in the database (masked here, not encrypted at rest) — the same as other EmDash plugins. For the strongest posture on the session signing key, leave 'Better Auth secret' blank and keep BETTER_AUTH_SECRET as a Worker secret.",
		},
	];

	return toast ? { blocks, toast } : { blocks };
}

/**
 * Native-format factory. EmDash calls this and expects a `ResolvedPlugin`.
 * Declares the sidebar admin page and the interaction handler backing it.
 */
export function createPlugin() {
	return definePlugin({
		id: SETTINGS_PLUGIN_ID,
		version: SETTINGS_PLUGIN_VERSION,
		admin: {
			pages: [{ path: SETTINGS_ADMIN_PAGE_PATH, label: "Better Auth", icon: "shield" }],
		},
		routes: {
			admin: {
				handler: async (routeCtx: {
					input?: AdminInteraction;
					kv: import("emdash").KVAccess;
				}): Promise<AdminPage> => {
					const interaction: AdminInteraction = routeCtx.input ?? {
						type: "page_load",
						// path echoed for parity with emdash-smtp; unused (single page).
					};

					if (interaction.type === "form_submit" && interaction.action_id === SAVE_ACTION_ID) {
						await writeKvSettings(routeCtx.kv, interaction.values ?? {});
						const saved = await readKvSettings(routeCtx.kv);
						return buildSettingsPage(saved, {
							message: "Settings saved.",
							type: "success",
						});
					}

					// page_load (and any other interaction) -> render current state.
					const saved = await readKvSettings(routeCtx.kv);
					return buildSettingsPage(saved);
				},
			},
		},
	});
}

export default createPlugin;
