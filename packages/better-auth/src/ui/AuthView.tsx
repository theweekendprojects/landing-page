/**
 * Better Auth UI (HeroUI) island for EmDash sites.
 *
 * A self-contained React island that renders Better Auth UI's prebuilt
 * authentication views (sign-in, sign-up, password recovery, etc.) styled with
 * HeroUI, laid out to match Better Auth UI's own HeroUI example: a sticky
 * header (brand + UserButton) over a centered auth card on a themed surface.
 *
 * The UserButton's dropdown carries the System / Light / Dark theme switcher
 * (via `themePlugin`), so theming lives exactly where the official demo puts
 * it — no separate custom control. The whole thing must live in one island so
 * the header's UserButton shares the AuthProvider/QueryClient context with the
 * card.
 *
 * Styling is self-contained (compiled by Tailwind v4, imported only here), so
 * the site's themed content pages never load these styles.
 *
 * `navigate` uses plain `window.location` since Astro islands have no client
 * router. `redirectTo` sends users to the site root after auth (a fresh
 * sign-up is a subscriber-role EmDash user, so we don't send them to the admin
 * which would bounce them).
 */

// Self-contained styles for the auth UI. Compiled by @tailwindcss/vite.
import "./auth.css";

import { Auth, AuthProvider, UserButton } from "@better-auth-ui/heroui";
import { themePlugin } from "@better-auth-ui/heroui/plugins/theme";
import { Link, Toast } from "@heroui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import * as React from "react";

import { authClient } from "../client.js";

// One QueryClient per island mount. Auth pages are standalone, so a simple
// per-mount client is enough (no SSR hydration boundary needed here).
let browserQueryClient: QueryClient | undefined;
function getQueryClient(): QueryClient {
	if (typeof window === "undefined") {
		return new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } });
	}
	browserQueryClient ??= new QueryClient({
		defaultOptions: { queries: { staleTime: 5_000 } },
	});
	return browserQueryClient;
}

/** Small brand mark shown in the header (generic app glyph). */
function BrandLogo() {
	return (
		<svg className="size-5" viewBox="0 0 60 45" fill="none" aria-hidden="true">
			<path
				fill="currentColor"
				fillRule="evenodd"
				clipRule="evenodd"
				d="M0 0H15V45H0V0ZM45 0H60V45H45V0ZM20 0H40V15H20V0ZM20 30H40V45H20V30Z"
			/>
		</svg>
	);
}

export interface AuthViewProps {
	/** Better Auth UI view path, e.g. "sign-in" | "sign-up". */
	path: string;
	/** Where to send the user after a successful auth. Defaults to "/". */
	redirectTo?: string;
	/** Social providers to show. Empty by default (email/password only). */
	socialProviders?: string[];
	/** Brand name shown in the header. */
	siteName?: string;
}

export default function AuthView({
	path,
	redirectTo = "/",
	socialProviders = [],
	siteName = "Home",
}: AuthViewProps) {
	const queryClient = getQueryClient();

	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
				<AuthProvider
					authClient={authClient}
					redirectTo={redirectTo}
					socialProviders={socialProviders}
					plugins={[themePlugin({ useTheme })]}
					navigate={({ to, replace }: { to: string; replace?: boolean }) => {
						if (replace) window.location.replace(to);
						else window.location.href = to;
					}}
				>
					<header className="sticky top-0 z-10 bg-background border-b">
						<div className="py-3 px-4 md:px-6 mx-auto justify-between flex items-center">
							<Link href="/" className="flex items-center gap-2.5 no-underline text-foreground">
								<BrandLogo />
								<h1 className="sm:text-base truncate font-semibold">{siteName}</h1>
							</Link>
							<UserButton size="icon" placement="bottom end" />
						</div>
					</header>

					<main className="flex-1 flex justify-center my-auto p-4 md:p-6">
						<Auth path={path} />
					</main>

					<Toast.Provider />
				</AuthProvider>
			</ThemeProvider>
		</QueryClientProvider>
	);
}
