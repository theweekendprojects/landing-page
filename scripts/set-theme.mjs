#!/usr/bin/env node
/**
 * Switches the active theme by rewriting the @import in src/styles/theme.css,
 * and the ACTIVE_THEME constant in src/styles/active-theme.ts (which drives
 * per-theme hero/about copy in src/content/theme-copy.ts).
 *
 * Usage:
 *   node scripts/set-theme.mjs <name>
 *   node scripts/set-theme.mjs --list
 *
 * Themes live in src/styles/themes/<name>.css. This script only ever
 * touches the @import line at the bottom of theme.css and the
 * ACTIVE_THEME string -- it never edits the theme files themselves.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const themesDir = join(root, "src/styles/themes");
const themeCssPath = join(root, "src/styles/theme.css");
const activeThemePath = join(root, "src/styles/active-theme.ts");

function listThemes() {
	return readdirSync(themesDir)
		.filter((f) => f.endsWith(".css"))
		.map((f) => f.replace(/\.css$/, ""))
		.sort();
}

const arg = process.argv[2];
const available = listThemes();

if (!arg || arg === "--list" || arg === "-l") {
	console.log("Available themes:");
	for (const name of available) console.log(`  ${name}`);
	if (!arg) {
		console.log("\nUsage: node scripts/set-theme.mjs <name>");
		process.exitCode = 1;
	}
	process.exit();
}

if (!available.includes(arg)) {
	console.error(`Unknown theme "${arg}". Available themes:\n${available.map((n) => `  ${n}`).join("\n")}`);
	process.exit(1);
}

const current = readFileSync(themeCssPath, "utf8");
const importLine = `@import "./themes/${arg}.css";`;
const updated = current.replace(/@import\s+"\.\/themes\/[\w-]+\.css";/, importLine);

if (updated === current && !current.includes(importLine)) {
	console.error("Could not find an existing @import line to replace in theme.css. Is the file intact?");
	process.exit(1);
}

writeFileSync(themeCssPath, updated);

const currentActiveTheme = readFileSync(activeThemePath, "utf8");
const updatedActiveTheme = currentActiveTheme.replace(
	/export const ACTIVE_THEME = "[\w-]+";/,
	`export const ACTIVE_THEME = "${arg}";`,
);
writeFileSync(activeThemePath, updatedActiveTheme);

console.log(`Switched active theme to "${arg}". Restart the dev server to see the change.`);
