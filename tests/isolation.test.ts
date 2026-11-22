import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, setup, uniqueEmail } from "./helpers";

let h: Awaited<ReturnType<typeof setup>>;
let alice: Client;
let bob: Client;
beforeAll(async () => {
  h = await setup();
  alice = new Client(h.call);
  bob = new Client(h.call);
  await alice.signup(uniqueEmail("alice"));
  await bob.signup(uniqueEmail("bob"));
});
afterAll(async () => { await h.dispose(); });

describe("authorization & tenant isolation", () => {
  it("one user cannot read, update or delete another user's records", async () => {
    const need = await alice.json<{ id: string }>("POST", "/api/needs", { title: "Find part-time work", area: "work" });
    const ctx = await alice.json<{ id: string }>("POST", "/api/context", { category: "work", label: "Current role", value: "Shop assistant" });
    const plan = await alice.json<{ id: string }>("POST", "/api/plans", { title: "Alice plan", tasks: ["step one"] });

    expect((await bob.req("GET", `/api/needs/${need.data.id}`)).status).toBe(404);
    expect((await bob.req("PATCH", `/api/needs/${need.data.id}`, { title: "hijack" })).status).toBe(404);
    expect((await bob.req("DELETE", `/api/needs/${need.data.id}`)).status).toBe(404);
    expect((await bob.req("PATCH", `/api/context/${ctx.data.id}`, { value: "hijack" })).status).toBe(404);
    expect((await bob.req("DELETE", `/api/context/${ctx.data.id}`)).status).toBe(404);
    expect((await bob.req("GET", `/api/plans/${plan.data.id}`)).status).toBe(404);

    const bobNeeds = await bob.json<{ items: unknown[] }>("GET", "/api/needs");
    expect(bobNeeds.data.items).toHaveLength(0);
    const bobCtx = await bob.json<{ items: unknown[] }>("GET", "/api/context");
    expect(bobCtx.data.items).toHaveLength(0);

    const still = await alice.json<{ title: string }>("GET", `/api/needs/${need.data.id}`);
    expect(still.data.title).toBe("Find part-time work");
  });

  it("client-supplied tenant_id / user_id / permission fields are ignored", async () => {
    const aliceRow = await h.db.prepare("SELECT u.id, u.tenant_id FROM users u JOIN sessions s ON s.user_id = u.id ORDER BY u.created_at LIMIT 1").first<{ id: string; tenant_id: string }>();
    const r = await bob.json<{ id: string }>("POST", "/api/needs", { title: "spoof", area: "work", tenant_id: aliceRow!.tenant_id, tenantId: aliceRow!.tenant_id, user_id: aliceRow!.id, permissionLevel: "L3" });
    expect(r.status).toBe(201);
    const row = await h.db.prepare("SELECT tenant_id, user_id FROM needs WHERE id = ?").bind(r.data.id).first<{ tenant_id: string; user_id: string }>();
    expect(row!.tenant_id).not.toBe(aliceRow!.tenant_id);
    expect(row!.user_id).not.toBe(aliceRow!.id);
  });

  it("cannot attach another user's plan, need or context to own records", async () => {
    const plan = await alice.json<{ id: string }>("POST", "/api/plans", { title: "Private plan" });
    expect((await bob.req("POST", "/api/tasks", { title: "sneaky", planId: plan.data.id })).status).toBe(404);
    const ctx = await alice.json<{ id: string }>("POST", "/api/context", { category: "other", label: "Secret", value: "do not share" });
    const r = await bob.json("POST", "/api/actions", { actionType: "share_data", destination: "someone@example.test", subject: "x", body: "y", shareContextIds: [ctx.data.id] });
    expect(r.status).toBe(404);
  });

  it("approvals, activity, notifications and agent runs are per-user", async () => {
    await alice.json("POST", "/api/consents", { scope: "external_actions", granted: true });
    const ap = await alice.json<{ id: string; payloadHash: string }>("POST", "/api/actions", { actionType: "send_message", destination: "Example Community Centre", subject: "Question", body: "Hello" });
    expect(ap.status).toBe(201);
    expect((await bob.req("POST", `/api/approvals/${ap.data.id}/decision`, { decision: "approve", payloadHash: ap.data.payloadHash })).status).toBe(404);
    expect((await bob.req("POST", `/api/approvals/${ap.data.id}/cancel`)).status).toBe(404);
    const bobAps = await bob.json<{ items: unknown[] }>("GET", "/api/approvals");
    expect(bobAps.data.items).toHaveLength(0);
    const run = await alice.json<{ runId: string }>("POST", "/api/alsos/agents/run", { agent: "support_discovery", message: "career guidance" });
    expect((await bob.req("GET", `/api/alsos/agent-runs/${run.data.runId}`)).status).toBe(404);
    const bobAct = await bob.json<{ items: Array<{ action: string }> }>("GET", "/api/activity");
    expect(bobAct.data.items.some((a) => a.action === "approval_requested")).toBe(false);
  });

  it("export contains only the requesting user's data", async () => {
    const res = await bob.req("GET", "/api/export");
    const doc = (await res.json()) as { data: Record<string, Array<{ user_id?: string }>> & { user: { id: string } } };
    const bobId = doc.data.user.id;
    for (const [k, v] of Object.entries(doc.data)) {
      if (Array.isArray(v)) for (const row of v) expect(row.user_id, k).toBe(bobId);
    }
  });
});
