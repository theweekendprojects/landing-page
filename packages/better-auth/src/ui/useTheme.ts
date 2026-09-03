/**
 * Minimal `next-themes`-compatible theme hook for the auth UI island.
 *
 * Avoids pulling in `next-themes` (a Next-flavored dep) — Better Auth UI's
 * `themePlugin` only needs a hook shaped `{ theme, setTheme, themes }`, and
 * HeroUI dark mode is purely CSS-driven (`class="dark"` / `data-theme` on
 * <html>). So this hook:
 *   - tracks "system" | "light" | "dark", persisted in localStorage;
 *   - resolves "system" against `prefers-color-scheme` and re-resolves live;
 *   - reflects the resolved mode onto <html> (both the `dark` class and
 *     `data-theme`, so HeroUI and any CSS hook both work).
 */

import * as React from "react";

export const THEMES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEMES)[number];

const STORAGE_KEY = "ec-auth-theme";

function systemPrefersDark(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-color-scheme: dark)").matches
	);
}

/** Reflect the resolved light/dark mode onto the document element. */
export function applyTheme(choice: ThemeChoice): void {
	if (typeof document === "undefined") return;
	const resolved = choice === "system" ? (systemPrefersDark() ? "dark" : "light") : choice;
	const root = document.documentElement;
	root.classList.toggle("dark", resolved === "dark");
	root.setAttribute("data-theme", resolved);
}

function readStored(): ThemeChoice {
	if (typeof localStorage === "undefined") return "system";
	const v = localStorage.getItem(STORAGE_KEY);
	return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function useTheme() {
	const [theme, setThemeState] = React.useState<ThemeChoice>(readStored);

	const setTheme = React.useCallback((next: string) => {
		const choice = (THEMES as readonly string[]).includes(next)
			? (next as ThemeChoice)
			: "system";
		try {
			localStorage.setItem(STORAGE_KEY, choice);
		} catch {
			/* ignore storage failures (private mode, etc.) */
		}
		applyTheme(choice);
		setThemeState(choice);
	}, []);

	// Apply on mount and whenever the choice changes.
	React.useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	// When on "system", follow OS changes live.
	React.useEffect(() => {
		if (theme !== "system" || typeof window === "undefined") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [theme]);

	return { theme, setTheme, themes: [...THEMES] };
}
