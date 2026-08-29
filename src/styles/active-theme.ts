/**
 * The currently active theme name, kept in sync with the @import in
 * theme.css by scripts/set-theme.mjs. This lets index.astro pick the
 * right per-theme hero/about copy (see src/content/theme-copy.ts)
 * without re-parsing CSS at build time.
 *
 * Don't edit this file directly -- run `pnpm theme <name>` instead.
 */
export const ACTIVE_THEME = "huashu-variation-1";
