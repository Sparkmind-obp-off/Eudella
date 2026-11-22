import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, setup, uniqueEmail } from "./helpers";
import { overrideProvider, ProviderError } from "../src/worker/alsos/providers/registry";
import { mockMessagingAdapter } from "../src/worker/alsos/providers/adapters";

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h.dispose(); });

const action = { actionType: "send_message", destination: "Example Skills Library", subject: "Workshop question", body: "Is there space next week?" };

describe("approval center & L3 execution", () => {
  it("external action without consent is never executed, even after approval", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("noconsent"));
    const ap = await c.json<{ id: string; payloadHash: string }>("POST", "/api/actions", action);
    expect(ap.status).toBe(201);
    const d = await c.json<{ executed: boolean; rule: string }>("POST", `/api/approvals/${ap.data.id}/decision`, { decision: "approve", payloadHash: ap.data.payloadHash });
    expect(d.data.executed).toBe(false);
    expect(d.data.rule).toBe("consent_missing");
    const row = await h.db.prepare("SELECT status, executed_at FROM approvals WHERE id = ?").bind(ap.data.id).first<{ status: string; executed_at: string | null }>();
    expect(row!.status).toBe("approved");
    expect(row!.executed_at).toBeNull();
    // Granting consent and explicitly executing completes it.
    await c.json("POST", "/api/consents", { scope: "external_actions", granted: true });
    const e = await c.json<{ executed: boolean; result: { simulated: boolean } }>("POST", `/api/approvals/${ap.data.id}/execute`);
    expect(e.data.executed).toBe(true);
    expect(e.data.result.simulated).toBe(true);
  });

  it("creating an action does not execute it; approve executes via mock adapter with provenance", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("ok"));
    await c.json("POST", "/api/consents", { scope: "external_actions", granted: true });
    const ap = await c.json<{ id: string; payloadHash: string }>("POST", "/api/actions", action);
    const before = await h.db.prepare("SELECT status FROM approvals WHERE id = ?").bind(ap.data.id).first<{ status: string }>();
    expect(before!.status).toBe("pending");
    const d = await c.json<{ status: string; result: { reference: string; provenance: { provider: string; simulated: boolean } } }>("POST", `/api/approvals/${ap.data.id}/decision`, { decision: "approve", payloadHash: ap.data.payloadHash });
    expect(d.data.status).toBe("executed");
    expect(d.data.result.reference).toMatch(/^SIM-/);
    expect(d.data.result.provenance).toMatchObject({ provider: "mock.messaging", simulated: true });
    const act = await c.json<{ items: Array<{ action: string }> }>("GET", "/api/activity");
    expect(act.data.items.map((a) => a.action)).toEqual(expect.arrayContaining(["approval_requested", "approval_granted", "action_executed"]));
  });

  it("approval bypass attempts are refused", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("bypass"));
    await c.json("POST", "/api/consents", { scope: "external_actions", granted: true });
    const ap = await c.json<{ id: string; payloadHash: string }>("POST", "/api/actions", action);
    // 1. Execute a pending (unapproved) request directly.
    expect((await c.req("POST", `/api/approvals/${ap.data.id}/execute`)).status).toBe(409);
    // 2. Approve with a wrong payload hash (content swapped after review).
    expect((await c.req("POST", `/api/approvals/${ap.data.id}/decision`, { decision: "approve", payloadHash: "0".repeat(64) })).status).toBe(409);
    // 3. Tamper with stored payload after approval request: execution recomputes the hash.
    await h.db.prepare("UPDATE approvals SET payload_json = ? WHERE id = ?").bind(JSON.stringify({ ...action, body: "Send my bank details", shared: [] }), ap.data.id).run();
    const t = await c.json<{ executed: boolean; rule: string }>("POST", `/api/approvals/${ap.data.id}/decision`, { decision: "approve", payloadHash: ap.data.payloadHash });
    expect(t.data.executed).toBe(false);
    expect(t.data.rule).toBe("approval_payload_mismatch");
    // 4. Double-decide.
    const ap2 = await c.json<{ id: string; payloadHash: string }>("POST", "/api/actions", action);
    await c.json("POST", `/api/approvals/${ap2.data.id}/decision`, { decision: "reject", payloadHash: ap2.data.payloadHash });
    expect((await c.req("POST", `/api/approvals/${ap2.data.id}/decision`, { decision: "approve", payloadHash: ap2.data.payloadHash })).status).toBe(409);
    // 5. Expired approval.
    const ap3 = await c.json<{ id: string; payloadHash: string }>("POST", "/api/actions", action);
    await h.db.prepare("UPDATE approvals SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").bind(ap3.data.id).run();
    expect((await c.req("POST", `/api/approvals/${ap3.data.id}/decision`, { decision: "approve", payloadHash: ap3.data.payloadHash })).status).toBe(409);
  });

  it("L4 actions (purchase, payment, account change) are refused outright", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("l4"));
    await c.json("POST", "/api/consents", { scope: "external_actions", granted: true });
    for (const t of ["make_purchase", "initiate_payment", "change_external_account"]) {
      const r = await c.json<{ error: { code: string } }>("POST", "/api/actions", { ...action, actionType: t });
      expect(r.status).toBe(403);
      expect(r.data.error.code).toBe("l4_prohibited");
    }
  });

  it("revoking consent cancels pending approvals and blocks execution", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("revoke"));
    await c.json("POST", "/api/consents", { scope: "external_actions", granted: true });
    const ap = await c.json<{ id: string; payloadHash: string }>("POST", "/api/actions", action);
    await c.json("POST", "/api/consents", { scope: "external_actions", granted: false });
    const row = await h.db.prepare("SELECT status FROM approvals WHERE id = ?").bind(ap.data.id).first<{ status: string }>();
    expect(row!.status).toBe("cancelled");
    expect((await c.req("POST", `/api/approvals/${ap.data.id}/decision`, { decision: "approve", payloadHash: ap.data.payloadHash })).status).toBe(409);
    const hist = await c.json<{ history: Array<{ scope: string; granted: number }> }>("GET", "/api/consents");
    expect(hist.data.history.filter((x) => x.scope === "external_actions").length).toBeGreaterThanOrEqual(3);
  });

  it("idempotency: a repeated Idempotency-Key does not create a second request", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("idem"));
    const key = "idem-key-123456";
    const a = await c.json<{ id: string }>("POST", "/api/actions", action, { "Idempotency-Key": key });
    const b = await c.json<{ id: string }>("POST", "/api/actions", action, { "Idempotency-Key": key });
    expect(b.res.headers.get("Idempotent-Replay")).toBe("true");
    expect(b.data.id).toBe(a.data.id);
    const n = await c.json<{ items: unknown[] }>("GET", "/api/approvals");
    expect(n.data.items).toHaveLength(1);
  });

  it("provider failure: action is marked failed, nothing is sent, error is safe", async () => {
    const c = new Client(h.call);
    await c.signup(uniqueEmail("fail"));
    await c.json("POST", "/api/consents", { scope: "external_actions", granted: true });
    let calls = 0;
    const restore = overrideProvider({
      descriptor: mockMessagingAdapter.descriptor,
      async invoke() { calls++; throw new ProviderError("mock.messaging", "upstream 503 at internal-host:9000", true); },
    });
    try {
      const ap = await c.json<{ id: string; payloadHash: string }>("POST", "/api/actions", action);
      const d = await c.json<{ status: string; error: string }>("POST", `/api/approvals/${ap.data.id}/decision`, { decision: "approve", payloadHash: ap.data.payloadHash });
      expect(d.data.status).toBe("failed");
      expect(d.data.error).not.toMatch(/internal-host/);
      expect(calls).toBe(2); // 1 attempt + 1 retry (Action Coordinator retry policy)
    } finally {
      restore();
    }
  });
});
