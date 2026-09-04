/**
 * Runtime entrypoint for the Better Auth settings companion plugin.
 *
 * This is the module the `format: "native"` descriptor (in index.ts) points
 * at via `entrypoint`. EmDash imports it and calls `createPlugin(options)` to
 * instantiate the plugin in-process.
 *
 * The plugin is intentionally minimal: it declares no hooks and no routes. Its
 * only reason to exist is to be a registered plugin that owns a
 * `settingsSchema`, so EmDash renders the auto-generated settings form under
 * the admin UI and persists the values in plugin storage. The Better Auth
 * *auth provider* (registered separately via `authProviders:`) reads those
 * saved values back at request time — see `resolveSettings` in settings.ts and
 * its use in route.ts.
 *
 * The `settingsSchema` is also declared on the descriptor (index.ts) because
 * that's the static, build-time-visible surface EmDash uses to render the
 * form; we mirror it here for completeness/self-documentation of the runtime
 * plugin. Both reference the same `SETTINGS_SCHEMA` constant, so they can't
 * drift.
 */

import { definePlugin } from "emdash";

import { SETTINGS_PLUGIN_ID, SETTINGS_SCHEMA } from "./settings.js";

// Keep in sync with the version reported by the descriptor factory.
export const SETTINGS_PLUGIN_VERSION = "0.1.0";

/**
 * Native-format factory. EmDash calls this with the descriptor's `options`
 * (unused here) and expects a `ResolvedPlugin` back.
 */
export function createPlugin() {
	return definePlugin({
		id: SETTINGS_PLUGIN_ID,
		version: SETTINGS_PLUGIN_VERSION,
		admin: {
			settingsSchema: SETTINGS_SCHEMA,
		},
	});
}

export default createPlugin;
