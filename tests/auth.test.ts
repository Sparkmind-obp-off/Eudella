import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, setup, uniqueEmail, ORIGIN } from "./helpers";

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h.dispose(); });

describe("authentication & sessions", () => {
  it("signs up with privacy-protective defaults (AI off, all consents off)", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("a"));
    const s = await c.json<{ authenticated: boolean }>("GET", "/api/auth/session");
    expect(s.data.authenticated).toBe(true);
    const prefs = await c.json<{ aiAssistanceEnabled: boolean; aiAvailableOnPlatform: boolean }>("GET", "/api/preferences");
    expect(prefs.data.aiAssistanceEnabled).toBe(false);
    expect(prefs.data.aiAvailableOnPlatform).toBe(false);
    const cons = await c.json<{ current: Record<string, boolean> }>("GET", "/api/consents");
    expect(Object.values(cons.data.current).every((v) => v === false)).toBe(true);
  });

  it("sets an HttpOnly SameSite cookie and stores only a token hash", async () => {
    const c = new Client(h.call);
    const email = uniqueEmail("cookie");
    const r = await c.signup(email);
    const cookie = r.res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const raw = c.cookie.split("=")[1]!;
    const row = await h.db.prepare("SELECT token_hash FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = ?").bind(email).first<{ token_hash: string }>();
    expect(row?.token_hash).not.toBe(raw);
    expect(row?.token_hash).toHaveLength(64);
  });

  it("rejects duplicate email, weak password and missing terms", async () => {
    const email = uniqueEmail("dup");
    await new Client(h.call).signup(email);
    const c = new Client(h.call);
    expect((await c.json("POST", "/api/auth/signup", { email, password: "correct-horse-battery", displayName: "X", acceptTerms: true })).status).toBe(409);
    const weak = await c.json<{ error: { fields: Record<string, string> } }>("POST", "/api/auth/signup", { email: uniqueEmail("w"), password: "short", displayName: "X", acceptTerms: true });
    expect(weak.status).toBe(400);
    expect(weak.data.error.fields.password).toBeDefined();
    expect((await c.json("POST", "/api/auth/signup", { email: uniqueEmail("t"), password: "correct-horse-battery", displayName: "X", acceptTerms: false })).status).toBe(400);
  });

  it("login with wrong password fails with a generic message", async () => {
    const email = uniqueEmail("login");
    await new Client(h.call).signup(email);
    const c = new Client(h.call);
    const bad = await c.json<{ error: { message: string } }>("POST", "/api/auth/login", { email, password: "wrong-password!!" });
    expect(bad.status).toBe(401);
    const unknown = await c.json<{ error: { message: string } }>("POST", "/api/auth/login", { email: uniqueEmail("nobody"), password: "wrong-password!!" });
    expect(unknown.status).toBe(401);
    expect(unknown.data.error.message).toBe(bad.data.error.message);
    expect((await c.login(email)).status).toBe(200);
  });

  it("unauthenticated requests to protected routes return 401", async () => {
    const c = new Client(h.call);
    for (const p of ["/api/profile", "/api/needs", "/api/approvals", "/api/export", "/api/catalog/resources"]) {
      expect((await c.req("GET", p)).status).toBe(401);
    }
  });

  it("expired sessions are rejected", async () => {
    const c = new Client(h.call);
    const email = uniqueEmail("exp");
    await c.signup(email);
    expect((await c.req("GET", "/api/profile")).status).toBe(200);
    await h.db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = (SELECT id FROM users WHERE email = ?)").bind(email).run();
    expect((await c.req("GET", "/api/profile")).status).toBe(401);
  });

  it("logout invalidates the session server-side (replayed cookie is rejected)", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("out"));
    const stolen = c.cookie;
    expect((await c.json("POST", "/api/auth/logout")).status).toBe(200);
    const replay = new Client(h.call);
    replay.cookie = stolen;
    expect((await replay.req("GET", "/api/profile")).status).toBe(401);
  });

  it("CSRF: state-changing requests need the session token header and a same-site origin", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("csrf"));
    const token = c.csrf;
    c.csrf = "";
    expect((await c.req("POST", "/api/needs", { title: "x", area: "work" })).status).toBe(403);
    c.csrf = token;
    expect((await c.req("POST", "/api/needs", { title: "x", area: "work" }, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await c.req("POST", "/api/needs", { title: "x", area: "work" }, { Origin: ORIGIN })).status).toBe(201);
  });
});
