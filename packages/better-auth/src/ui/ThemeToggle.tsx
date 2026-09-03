/**
 * Standalone light/dark/system theme toggle for the auth pages.
 *
 * Better Auth UI's themePlugin only surfaces theme selection inside the
 * post-login UserButton dropdown and account settings — there's no user button
 * on the sign-in/sign-up screens. This small segmented control gives visitors
 * the same three-way choice directly on the auth pages, driven by the shared
 * `useTheme` hook.
 */

import { Button, ButtonGroup } from "@heroui/react";
import * as React from "react";
import { THEMES, type ThemeChoice } from "./useTheme.js";

const LABELS: Record<ThemeChoice, string> = {
	system: "System",
	light: "Light",
	dark: "Dark",
};

export interface ThemeToggleProps {
	theme: string;
	setTheme: (theme: string) => void;
}

export function ThemeToggle({ theme, setTheme }: ThemeToggleProps) {
	return (
		<ButtonGroup size="sm" variant="flat" aria-label="Theme">
			{THEMES.map((t) => (
				<Button
					key={t}
					onPress={() => setTheme(t)}
					color={theme === t ? "primary" : "default"}
					aria-pressed={theme === t}
				>
					{LABELS[t]}
				</Button>
			))}
		</ButtonGroup>
	);
}
