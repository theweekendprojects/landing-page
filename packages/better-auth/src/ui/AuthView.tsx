/**
 * Better Auth UI (HeroUI) island for EmDash sites.
 *
 * A self-contained React island that renders Better Auth UI's prebuilt
 * authentication views (sign-in, sign-up, password recovery, etc.) styled with
 * HeroUI. Ships inside the plugin so any EmDash site gets working, styled auth
 * pages without adopting shadcn or restyling anything.
 *
 * Styling is self-contained: it imports HeroUI's own style bundle. Because the
 * auth pages are separate routes that render only this island, the site's
 * themed content pages never load these styles.
 *
 * The `navigate` prop uses plain `window.location` since Astro islands have no
 * client router. `redirectTo` sends users to the site root after auth (a
 * fresh sign-up is a subscriber-role EmDash user, so we don't send them to the
 * admin, which would bounce them).
 */

// Self-contained styles for the auth UI. This entry is compiled by Tailwind
// v4 (@tailwindcss/vite) so HeroUI's component styles are actually emitted.
// Imported only here, so the compiled CSS loads only on the /auth routes.
import "./auth.css";

import { Auth } from "@better-auth-ui/heroui";
import { AuthProvider } from "@better-auth-ui/heroui";
import { Toast } from "@heroui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

export interface AuthViewProps {
	/** Better Auth UI view path, e.g. "sign-in" | "sign-up". */
	path: string;
	/** Where to send the user after a successful auth. Defaults to "/". */
	redirectTo?: string;
	/** Social providers to show. Empty by default (email/password only). */
	socialProviders?: string[];
}

export default function AuthView({
	path,
	redirectTo = "/",
	socialProviders = [],
}: AuthViewProps) {
	const queryClient = getQueryClient();

	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider
				authClient={authClient}
				redirectTo={redirectTo}
				socialProviders={socialProviders}
				navigate={({ to, replace }: { to: string; replace?: boolean }) => {
					if (replace) window.location.replace(to);
					else window.location.href = to;
				}}
			>
				<div style={{ display: "flex", justifyContent: "center", padding: "1.5rem" }}>
					<Auth path={path} />
				</div>
				<Toast.Provider />
			</AuthProvider>
		</QueryClientProvider>
	);
}
