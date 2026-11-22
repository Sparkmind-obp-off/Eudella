import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppBindings, AuthContext } from "../env";
import { HttpError, unauthorized, forbidden } from "./errors";
import { nowIso, safeEqual, sha256Hex } from "./util";

export const SESSION_COOKIE = "eud_session";

export const requestId: MiddlewareHandler<AppBindings> = async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
  c.header("X-Request-Id", c.get("requestId"));
};

/** Security headers on every API response. */
export const securityHeaders: MiddlewareHandler<AppBindings> = async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Cache-Control", "no-store");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Cross-Origin-Opener-Policy", "same-origin");
};

export async function loadSession(c: Context<AppBindings>): Promise<AuthContext | undefined> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return undefined;
  const hash = await sha256Hex(token);
  const row = await c.env.DB
    .prepare(
      `SELECT s.id, s.user_id, s.tenant_id, s.csrf_token, s.expires_at, s.revoked_at, u.status
       FROM sessions s JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
       WHERE s.token_hash = ?`,
    )
    .bind(hash)
    .first<{ id: string; user_id: string; tenant_id: string; csrf_token: string; expires_at: string; revoked_at: string | null; status: AuthContext["status"] }>();
  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now() || row.status === "closed") return undefined;
  return { sessionId: row.id, userId: row.user_id, tenantId: row.tenant_id, csrfToken: row.csrf_token, status: row.status };
}

/** Require an authenticated session. Tenant and user are derived ONLY from the session. */
export const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const auth = await loadSession(c);
  if (!auth) throw unauthorized("Your session has ended. Please sign in again.");
  c.set("auth", auth);
  await next();
};

/** Allow paused accounts only to read, manage privacy, export, resume, delete or sign out. */
export const blockWhenPaused: MiddlewareHandler<AppBindings> = async (c, next) => {
  const auth = c.get("auth");
  if (auth?.status === "paused" && c.req.method !== "GET") {
    throw forbidden("Your account is paused. Resume it in Privacy settings to make changes.", "account_paused");
  }
  await next();
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** CSRF: Origin check + per-session double-submit token header on every state-changing request. */
export const csrf: MiddlewareHandler<AppBindings> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const origin = c.req.header("Origin");
  const allowed = (c.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const self = new URL(c.req.url).origin;
  if (origin && origin !== self && !allowed.includes(origin)) throw forbidden("Cross-site request blocked.", "csrf_origin");
  const auth = c.get("auth");
  if (auth) {
    const header = c.req.header("X-CSRF-Token") ?? "";
    if (!safeEqual(header, auth.csrfToken)) throw forbidden("Security check failed. Please reload the page.", "csrf_token");
  }
  await next();
};

/** Fixed-window rate limiter backed by D1 (no paid KV / Durable Objects). */
export function rateLimit(bucket: string, limit: number, windowSec: number): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "local";
    const who = c.get("auth")?.userId ?? ip;
    const window = Math.floor(Date.now() / 1000 / windowSec) * windowSec;
    const key = `${bucket}:${who}`;
    const row = await c.env.DB
      .prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1 RETURNING count")
      .bind(key, window)
      .first<{ count: number }>();
    const count = row?.count ?? 1;
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(Math.max(0, limit - count)));
    if (count > limit) {
      c.header("Retry-After", String(window + windowSec - Math.floor(Date.now() / 1000)));
      throw new HttpError(429, "rate_limited", "Too many requests. Please wait a moment and try again.");
    }
    // Opportunistic cleanup of old windows (~1% of requests).
    if (Math.random() < 0.01) await c.env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(window - 3600).run();
    await next();
  };
}

/** Idempotency for sensitive operations: replay the stored response for a repeated Idempotency-Key. */
export const idempotent: MiddlewareHandler<AppBindings> = async (c, next) => {
  const key = c.req.header("Idempotency-Key");
  const auth = c.get("auth");
  if (!key || !auth) return next();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) throw new HttpError(400, "invalid_input", "Invalid Idempotency-Key header.");
  const route = `${c.req.method} ${new URL(c.req.url).pathname}`;
  const prior = await c.env.DB.prepare("SELECT response_json, status_code FROM idempotency_keys WHERE user_id = ? AND route = ? AND key = ?").bind(auth.userId, route, key).first<{ response_json: string; status_code: number }>();
  if (prior) {
    c.header("Idempotent-Replay", "true");
    return c.body(prior.response_json, prior.status_code as 200, { "Content-Type": "application/json" });
  }
  await next();
  if (c.res.status < 500) {
    const body = await c.res.clone().text();
    await c.env.DB.prepare("INSERT OR IGNORE INTO idempotency_keys (key, user_id, route, response_json, status_code, created_at) VALUES (?,?,?,?,?,?)").bind(key, auth.userId, route, body, c.res.status, nowIso()).run();
  }
};
