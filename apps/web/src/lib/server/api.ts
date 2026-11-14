import "server-only";
import { SignJWT } from "jose";
import type { SessionUser } from "./auth";

/**
 * Backend-for-frontend helpers. The browser never talks to FastAPI directly: every call goes
 * through Next, which attaches a 5-minute HS256 token for the signed-in user
 * (issuer oro-web, audience oro-api; checked in backend/app/core/security.py).
 */
export const API_URL = (process.env.API_INTERNAL_URL ?? "http://localhost:8000").replace(/\/$/, "");

const secret = () => new TextEncoder().encode(process.env.AUTH_JWT_SECRET ?? "dev-only-change-me-dev-only-change-me");

export async function apiToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name ?? undefined })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer("oro-web")
    .setAudience("oro-api")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
}

/** The visitor's IP, taken from the edge (Cloudflare first, then Caddy). Used only for hashed rate limits. */
export function clientIp(h: Headers): string {
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "127.0.0.1";
}

export async function apiHeaders(user: SessionUser | null, incoming?: Headers): Promise<Headers> {
  const h = new Headers({ Accept: "application/json" });
  if (user) h.set("Authorization", `Bearer ${await apiToken(user)}`);
  if (incoming) {
    h.set("X-Forwarded-For", clientIp(incoming));
    const rid = incoming.get("x-request-id");
    if (rid) h.set("X-Request-ID", rid);
  }
  return h;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail?: string,
  ) {
    super(detail ?? title);
  }
}

/** Server-side JSON call to the API as `user`. Throws ApiError with the problem title/detail. */
export async function api<T>(path: string, user: SessionUser | null, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const h = await apiHeaders(user);
  if (init.json !== undefined) h.set("Content-Type", "application/json");
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: h,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const p = (await res.json().catch(() => ({}))) as { title?: string; detail?: string };
    throw new ApiError(res.status, p.title ?? res.statusText, p.detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
