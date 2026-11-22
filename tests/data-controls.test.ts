import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, setup, uniqueEmail } from "./helpers";

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h.dispose(); });

describe("user data controls", () => {
  it("export returns all personal data without secrets", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("export"));
    await c.json("POST", "/api/needs", { title: "Need A", area: "learning" });
    await c.json("POST", "/api/context", { category: "education", label: "Highest level", value: "Secondary" });
    const res = await c.req("GET", "/api/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment/);
    const text = await res.text();
    expect(text).not.toMatch(/password_hash|pbkdf2|token_hash|csrf_token/);
    const doc = JSON.parse(text) as { format: string; data: Record<string, unknown[]> };
    expect(doc.format).toBe("eudella-export-v1");
    expect(doc.data.needs).toHaveLength(1);
    expect(doc.data.personal_context).toHaveLength(1);
    expect(doc.data.consent_records!.length).toBeGreaterThan(0);
  });

  it("context can be corrected and deleted", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("correct"));
    const r = await c.json<{ id: string }>("POST", "/api/context", { category: "location", label: "City", value: "Bandung" });
    await c.json("PATCH", `/api/context/${r.data.id}`, { value: "Jakarta" });
    const list = await c.json<{ items: Array<{ value: string }> }>("GET", "/api/context");
    expect(list.data.items[0]!.value).toBe("Jakarta");
    expect((await c.req("DELETE", `/api/context/${r.data.id}`)).status).toBe(200);
    expect((await c.json<{ items: unknown[] }>("GET", "/api/context")).data.items).toHaveLength(0);
  });

  it("pause blocks changes and agents but allows export, consent and resume", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("pause"));
    expect((await c.json("POST", "/api/account/pause", { paused: true })).status).toBe(200);
    const blocked = await c.json<{ error: { code: string } }>("POST", "/api/needs", { title: "x", area: "work" });
    expect(blocked.status).toBe(403);
    expect(blocked.data.error.code).toBe("account_paused");
    expect((await c.req("POST", "/api/alsos/agents/run", { agent: "planning", message: "x" })).status).toBe(403);
    expect((await c.req("GET", "/api/export")).status).toBe(200);
    expect((await c.req("POST", "/api/consents", { scope: "product_updates", granted: false })).status).toBe(200);
    expect((await c.req("GET", "/api/needs")).status).toBe(200);
    expect((await c.json("POST", "/api/account/pause", { paused: false })).status).toBe(200);
    expect((await c.req("POST", "/api/needs", { title: "x", area: "work" })).status).toBe(201);
  });

  it("delete requires password + confirmation and erases every user-owned row", async () => {
    const c = new Client(h.call);
    const email = uniqueEmail("delete");
    await c.signup(email);
    const uid = (await h.db.prepare("SELECT id, tenant_id FROM users WHERE email = ?").bind(email).first<{ id: string; tenant_id: string }>())!;
    await c.json("POST", "/api/needs", { title: "N", area: "money" });
    await c.json("POST", "/api/plans", { title: "P", tasks: ["a", "b"] });
    await c.json("POST", "/api/context", { category: "other", label: "L", value: "V" });
    await c.json("POST", "/api/actions", { actionType: "send_message", destination: "d", subject: "s", body: "b" });
    await c.json("POST", "/api/alsos/agents/run", { agent: "support_discovery", message: "budget" });

    expect((await c.req("POST", "/api/account/delete", { password: "wrong-password", confirm: "DELETE" })).status).toBe(403);
    expect((await c.req("POST", "/api/account/delete", { password: "correct-horse-battery", confirm: "delete" })).status).toBe(400);
    const ok = await c.json<{ deleted: boolean }>("POST", "/api/account/delete", { password: "correct-horse-battery", confirm: "DELETE" });
    expect(ok.data.deleted).toBe(true);

    const tables = ["users", "profiles", "sessions", "personal_context", "user_preferences", "needs", "goals", "plans", "plan_tasks", "approvals", "consent_records", "activity_logs", "notifications", "notification_preferences", "agent_runs", "agent_events", "data_export_requests", "saved_items"];
    for (const t of tables) {
      const n = await h.db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE tenant_id = ?`).bind(uid.tenant_id).first<{ n: number }>();
      expect(n!.n, t).toBe(0);
    }
    const audit = await h.db.prepare("SELECT subject_hash FROM account_deletion_requests ORDER BY requested_at DESC LIMIT 1").first<{ subject_hash: string }>();
    expect(audit!.subject_hash).not.toContain(uid.id);
    expect((await c.req("GET", "/api/profile")).status).toBe(401);
    expect((await new Client(h.call).login(email)).status).toBe(401);
  });
});

describe("invalid input & safe errors", () => {
  it("rejects malformed JSON, wrong content type, bad enums, oversize fields", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("invalid"));
    const bad = await c.req("POST", "/api/needs", undefined, { "Content-Type": "application/json" });
    expect(bad.status).toBe(400);
    expect((await c.req("POST", "/api/needs", { title: "x", area: "space-travel" })).status).toBe(400);
    expect((await c.req("POST", "/api/needs", { title: "x".repeat(500), area: "work" })).status).toBe(400);
    expect((await c.req("POST", "/api/needs", { title: "   ", area: "work" })).status).toBe(400);
    expect((await c.req("POST", "/api/tasks", { title: "t", dueDate: "tomorrow" })).status).toBe(400);
    expect((await c.req("GET", "/api/needs?status=hacked")).status).toBe(400);
    expect((await c.req("GET", "/api/needs?limit=100000")).status).toBe(400);
    const sqli = await c.json<{ items: unknown[] }>("GET", "/api/catalog/resources?q=" + encodeURIComponent("' OR 1=1 --"));
    expect(sqli.status).toBe(200);
    expect(sqli.data.items).toHaveLength(0);
  });

  it("errors never leak internals", async () => {
    const anon = new Client(h.call);
    const r0 = await anon.json<{ error: { code: string } }>("GET", "/api/does-not-exist");
    expect(r0.status).toBe(401); // anonymous callers learn nothing about route existence
    const c = new Client(h.call);
    await c.signup(uniqueEmail("nf"));
    const r = await c.json<{ error: { code: string; message: string } }>("GET", "/api/does-not-exist");
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.data)).not.toMatch(/stack|at .*\.ts/);
  });

  it("pagination returns a cursor and stable pages", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("page"));
    for (let i = 0; i < 5; i++) await c.json("POST", "/api/tasks", { title: `Task ${i}` });
    const p1 = await c.json<{ items: Array<{ id: string }>; nextCursor: string }>("GET", "/api/tasks?limit=2");
    expect(p1.data.items).toHaveLength(2);
    const p2 = await c.json<{ items: Array<{ id: string }>; nextCursor: string }>("GET", `/api/tasks?limit=2&cursor=${encodeURIComponent(p1.data.nextCursor)}`);
    expect(p2.data.items).toHaveLength(2);
    expect(p2.data.items.map((i) => i.id)).not.toContain(p1.data.items[0]!.id);
  });
});

describe("rate limiting", () => {
  it("login is limited to 10 attempts per 5 minutes per client", async () => {
    // Avoid straddling a fixed-window boundary (would reset the counter mid-test).
    const intoWindow = (Date.now() / 1000) % 300;
    if (intoWindow > 295) await new Promise((r) => setTimeout(r, (301 - intoWindow) * 1000));
    const c = new Client(h.call, "203.0.113.7");
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await c.req("POST", "/api/auth/login", { email: "x@example.test", password: "nope-nope" })).status);
    expect(codes.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
    const last = await c.req("POST", "/api/auth/login", { email: "x@example.test", password: "nope-nope" });
    expect(last.headers.get("Retry-After")).toBeTruthy();
  });
  it("agent runs are limited per user", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("rl"));
    const intoWindow = (Date.now() / 1000) % 60;
    if (intoWindow > 50) await new Promise((r) => setTimeout(r, (61 - intoWindow) * 1000));
    let limited = false;
    for (let i = 0; i < 32; i++) {
      const r = await c.req("POST", "/api/alsos/agents/run", { agent: "life_navigator", message: "find a job" });
      if (r.status === 429) { limited = true; break; }
    }
    expect(limited).toBe(true);
  });
});
