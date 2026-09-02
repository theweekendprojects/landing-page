import type { AuthProviderDescriptor, SessionBridge } from "emdash";
import type { BetterAuthInstance } from "./auth";

export function betterAuthProvider(
	auth: BetterAuthInstance,
): AuthProviderDescriptor {
	return {
		id: "better-auth",
		name: "Better Auth",
		providers: [
			{
				id: "email",
				name: "Email",
				type: "email",
				signIn: async ({
					email,
					password,
					session,
				}: {
					email: string;
					password: string;
					session: SessionBridge;
				}) => {
					const response = await auth.api.signInEmail({
						email,
						password,
						session: {
							headers: new Headers(),
						},
					});

					if (response.ok) {
						const user = response.data?.user;
						if (user) {
							await session.set("user", { id: user.id });
						}
						return {
							success: true,
							data: response.data,
						};
					}

					return {
						success: false,
						error: response.error?.message || "Sign in failed",
					};
				},
				signUp: async ({
					email,
					password,
					name,
					session,
				}: {
					email: string;
					password: string;
					name?: string;
					session: SessionBridge;
				}) => {
					const response = await auth.api.signUpEmail({
						email,
						password,
						name,
						session: {
							headers: new Headers(),
						},
					});

					if (response.ok) {
						const user = response.data?.user;
						if (user) {
							await session.set("user", { id: user.id });
						}
						return {
							success: true,
							data: response.data,
						};
					}

					return {
						success: false,
						error: response.error?.message || "Sign up failed",
					};
				},
			},
			{
				id: "google",
				name: "Google",
				type: "oauth",
				url: "/api/auth/callback/google",
				signIn: async ({ session }: { session: SessionBridge }) => {
					// Google OAuth is handled by the catch-all route
					// This just triggers the redirect
					return {
						success: true,
						data: { url: "/api/auth/callback/google" },
					};
				},
			},
		],
	};
}
