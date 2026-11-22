import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { AppBindings } from "../env";
import { LoginInput, SignupInput, CONSENT_SCOPES } from "../../shared/contracts";
import { body } from "../lib/validate";
import { hashPassword, verifyPassword, DUMMY_HASH } from "../lib/password";
import { newId, nowIso, randomToken, sha256Hex } from "../lib/util";
import { conflict, HttpError } from "../lib/errors";
import { SESSION_COOKIE, loadSession, rateLimit, csrf } from "../lib/middleware";
import { logActivity, POLICY_VERSION } from "../services/core";

export const authRoutes = new Hono<AppBindings>();

async function createSession(c: import("hono").Context<AppBindings>, userId: string, tenantId: string) {
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const ttlHours = Math.min(Math.max(Number(c.env.SESSION_TTL_HOURS) || 168, 1), 24 * 30);
  const expires = new Date(Date.now() + ttlHours * 3600 * 1000);
  await c.env.DB
    .prepare("INSERT INTO sessions (id, user_id, tenant_id, token_hash, csrf_token, created_at, expires_at, user_agent) VALUES (?,?,?,?,?,?,?,?)")
    .bind(newId("ses"), userId, tenantId, await sha256Hex(token), csrfToken, nowIso(), nowIso(expires), (c.req.header("User-Agent") ?? "").slice(0, 200))
    .run();
  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "Lax", path: "/", expires });
  return csrfToken;
}

authRoutes.post("/signup", csrf, rateLimit("signup", 10, 3600), async (c) => {
  const input = await body(c, SignupInput);
  const db = c.env.DB;
  const exists = await db.prepare("SELECT 1 FROM users WHERE email = ?").bind(input.email).first();
  if (exists) throw conflict("An account with this email already exists. Try signing in.", "email_taken");
  const now = nowIso();
  const tenantId = newId("ten");
  const userId = newId("usr");
  const hash = await hashPassword(input.password);
  const stmts = [
    db.prepare("INSERT INTO tenants (id, kind, name, created_at, updated_at) VALUES (?, 'personal', ?, ?, ?)").bind(tenantId, `Personal space`, now, now),
    db.prepare("INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?)").bind(userId, tenantId, input.email, hash, now, now),
    db.prepare("INSERT INTO profiles (user_id, tenant_id, display_name, locale, created_at, updated_at) VALUES (?,?,?,?,?,?)").bind(userId, tenantId, input.displayName, input.locale, now, now),
    // Privacy-protective defaults: AI off, email off, product updates off.
    db.prepare("INSERT INTO user_preferences (user_id, tenant_id, ai_assistance_enabled, memory_enabled, updated_at) VALUES (?,?,0,1,?)").bind(userId, tenantId, now),
    db.prepare("INSERT INTO notification_preferences (user_id, tenant_id, updated_at) VALUES (?,?,?)").bind(userId, tenantId, now),
    // Every consent scope starts explicitly NOT granted; the user opts in during onboarding.
    ...CONSENT_SCOPES.map((scope) =>
      db.prepare("INSERT INTO consent_records (id, tenant_id, user_id, scope, granted, purpose, policy_version, created_at) VALUES (?,?,?,?,0,?,?,?)").bind(newId("cns"), tenantId, userId, scope, "default_off_at_signup", POLICY_VERSION, now),
    ),
  ];
  await db.batch(stmts);
  await logActivity(db, { tenantId, userId }, "user", "account_created", "user", userId);
  const csrfToken = await createSession(c, userId, tenantId);
  return c.json({ ok: true, csrfToken }, 201);
});

authRoutes.post("/login", csrf, rateLimit("login", 10, 300), async (c) => {
  const input = await body(c, LoginInput);
  const user = await c.env.DB.prepare("SELECT id, tenant_id, password_hash, status FROM users WHERE email = ?").bind(input.email).first<{ id: string; tenant_id: string; password_hash: string; status: string }>();
  const ok = await verifyPassword(input.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok || user.status === "closed") throw new HttpError(401, "invalid_credentials", "Email or password is incorrect.");
  const csrfToken = await createSession(c, user.id, user.tenant_id);
  await logActivity(c.env.DB, { tenantId: user.tenant_id, userId: user.id }, "user", "signed_in");
  return c.json({ ok: true, csrfToken });
});

authRoutes.post("/logout", async (c) => {
  const auth = await loadSession(c);
  if (auth) {
    const header = c.req.header("X-CSRF-Token") ?? "";
    if (header !== auth.csrfToken) throw new HttpError(403, "csrf_token", "Security check failed. Please reload the page.");
    await c.env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ?").bind(nowIso(), auth.sessionId, auth.userId).run();
    await logActivity(c.env.DB, auth, "user", "signed_out");
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/session", async (c) => {
  const auth = await loadSession(c);
  if (!auth) return c.json({ authenticated: false });
  const u = await c.env.DB
    .prepare("SELECT u.email, u.status, u.onboarding_completed, p.display_name, p.locale FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = ? AND u.tenant_id = ?")
    .bind(auth.userId, auth.tenantId)
    .first<{ email: string; status: string; onboarding_completed: number; display_name: string; locale: string }>();
  if (!u) return c.json({ authenticated: false });
  return c.json({
    authenticated: true,
    csrfToken: auth.csrfToken,
    user: { email: u.email, status: u.status, onboardingCompleted: u.onboarding_completed === 1, displayName: u.display_name, locale: u.locale },
  });
});
