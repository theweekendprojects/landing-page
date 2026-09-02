/**
 * Better Auth Client Configuration
 *
 * This creates the Better Auth client for email/password + Google OAuth authentication.
 * The client is used in login/signup pages to authenticate users.
 *
 * Note: We don't use Better Auth UI components directly due to React version
 * conflicts (Better Auth UI requires React 19.2.6+, but EmDash uses 19.2.4).
 * Instead, we use createAuthClient directly with custom forms.
 */

import { betterAuth } from "better-auth";
import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client configuration
 * - Uses email/password authentication
 * - Uses Google OAuth (configured in astro.config.mjs)
 * - Connects to EmDash's database via the adapter
 */
export const authClient = createAuthClient({
	baseURL: "http://localhost:4321",
});

/**
 * Authentication actions available on the client
 */
export const { signIn, signOut, signUp, signOutAll, signInSocial } = authClient;

// Type exports for better type safety
export type { Session } from "better-auth";
