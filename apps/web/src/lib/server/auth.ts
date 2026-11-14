import "server-only";
import { optionalEnv } from "@/lib/env";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { Pool } from "pg";

/**
 * Accounts (PLAN §4): Better Auth, self-hosted, in its own database (`oro_auth`) so its
 * tables never mix with the API's. Email + password works with no outside service;
 * Google turns on when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set.
 */
const google =
  optionalEnv(process.env.GOOGLE_CLIENT_ID) && optionalEnv(process.env.GOOGLE_CLIENT_SECRET)
    ? { google: { clientId: optionalEnv(process.env.GOOGLE_CLIENT_ID)!, clientSecret: optionalEnv(process.env.GOOGLE_CLIENT_SECRET)!, prompt: "select_account" as const } }
    : undefined;

const globalForPool = globalThis as unknown as { oroAuthPool?: Pool };
const pool =
  globalForPool.oroAuthPool ??
  new Pool({
    connectionString: process.env.AUTH_DATABASE_URL ?? "postgres://oro:oro@localhost:5432/oro_auth",
    max: 5,
    idleTimeoutMillis: 30_000,
  });
if (process.env.NODE_ENV !== "production") globalForPool.oroAuthPool = pool;

export const auth = betterAuth({
  appName: "ORO",
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  // DPDP: people can erase their own account (Settings → Your data).
  user: { deleteUser: { enabled: true } },
  emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128, autoSignIn: true },
  socialProviders: google,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: { enabled: true, window: 60, max: 30 },
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_URL?.startsWith("http://") },
  plugins: [nextCookies()],
});

export const googleEnabled = Boolean(google);

export type SessionUser = { id: string; email: string; name: string | null };

/** The signed-in user for this request, or null. Reads cookies, so callers sit inside <Suspense>. */
export async function currentUser(): Promise<SessionUser | null> {
  try {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s?.user) return null;
    return { id: s.user.id, email: s.user.email, name: s.user.name || null };
  } catch {
    return null;
  }
}
