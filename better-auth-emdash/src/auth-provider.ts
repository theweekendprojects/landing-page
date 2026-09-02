/**
 * Better-Auth Auth Provider Descriptor for EmDash
 *
 * This wraps Better-Auth and integrates it with EmDash's auth system.
 *
 * EmDash's session only ever stores { id: string }. The middleware re-fetches
 * the full user row from users by id on every authenticated request.
 *
 * This provider:
 * 1. Registers Better-Auth as an auth provider with EmDash
 * 2. Handles login via email/password and Google OAuth
 * 3. Sets session.set("user", { id: user.id }) on successful login
 * 4. Provides a LoginButton component for the login page
 */

import type { AuthProviderDescriptor } from "emdash/src/auth/types.js";

/**
 * Configure Better-Auth as an auth provider for EmDash.
 *
 * This returns an AuthProviderDescriptor that EmDash uses to:
 * - Show the login button on the login page
 * - Route auth requests to Better-Auth's API
 *
 * The actual authentication happens in Better-Auth's catch-all API route
 * which sets EmDash's session.
 */
export function betterAuthProvider(): AuthProviderDescriptor {
	return {
		id: "better-auth",
		label: "Email / Google",
		adminEntry: "better-auth-emdash/auth-provider-admin",
	};
}
