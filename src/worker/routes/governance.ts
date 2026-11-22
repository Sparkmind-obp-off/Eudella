// Approvals (Action Coordinator), consent, activity, notifications, data export, pause, deletion.
import { Hono, type Context } from "hono";
import { deleteCookie } from "hono/cookie";
import type { AppBindings, AuthContext } from "../env";
import { ActionRequestInput, ApprovalDecision, ConsentUpdate, DeleteAccountInput, PauseAccountInput, PageQuery, CONSENT_SCOPES } from "../../shared/contracts";
import { body, query } from "../lib/validate";
import { conflict, forbidden, notFound, HttpError, unauthorized } from "../lib/errors";
import { newId, nowIso, sha256Hex, stableStringify, encodeCursor, decodeCursor, bool } from "../lib/util";
import { getConsents, logActivity, notify, POLICY_VERSION } from "../services/core";
import { evaluate } from "../alsos/policy";
import { AGENTS } from "../alsos/agents";
import { assessInput, redact } from "../alsos/safety";
import { getProvider, invokeWithPolicy, type ProviderAdapter } from "../alsos/providers/registry";
import type { MessageInput, MessageOutput } from "../alsos/providers/adapters";
import { verifyPassword } from "../lib/password";
import { idempotent, rateLimit, SESSION_COOKIE } from "../lib/middleware";

export const governanceRoutes = new Hono<AppBindings>();
/** Routes a paused account may still use (privacy, export, resume, delete). */
export const accountControlRoutes = new Hono<AppBindings>();
const A = (c: Context<AppBindings>): AuthContext => c.get("auth")!;

const ACTION_LABELS: Record<string, { title: string; cost: string; reversible: boolean }> = {
  send_message: { title: "Send a message", cost: "No cost (simulated delivery)", reversible: false },
  share_data: { title: "Share selected information", cost: "No cost", reversible: false },
  contact_third_party: { title: "Contact a third party", cost: "No cost (simulated)", reversible: false },
  book_service: { title: "Request a booking", cost: "Unknown — confirm with the provider before any commitment", reversible: false },
  make_purchase: { title: "Make a purchase", cost: "Not supported", reversible: false },
  initiate_payment: { title: "Initiate a payment", cost: "Not supported", reversible: false },
  change_external_account: { title: "Change an external account", cost: "Not supported", reversible: false },
  publish_content: { title: "Publish content", cost: "Not supported", reversible: false },
};
// Financial and account-changing actions are L4 in this MVP: never executable, even with approval.
const L4_ACTIONS = new Set(["make_purchase", "initiate_payment", "change_external_account"]);
const APPROVAL_TTL_MS = 24 * 3600 * 1000;

// ---------- approvals ----------
governanceRoutes.post("/actions", idempotent, rateLimit("actions", 20, 3600), async (c) => {
  const auth = A(c);
  const input = await body(c, ActionRequestInput);
  const db = c.env.DB;
  if (L4_ACTIONS.has(input.actionType)) {
    await logActivity(db, auth, "safety_guardian", "action_refused_l4", null, null, input.actionType);
    throw forbidden("EUDELLA does not make purchases, payments or external account changes on your behalf.", "l4_prohibited");
  }
  const safety = assessInput(`${input.subject}\n${input.body}`);
  if (safety.blocked) throw new HttpError(422, "safety_block", safety.reason ?? "Blocked by Safety Guardian.");

  const coordinator = AGENTS.action_coordinator;
  const consents = await getConsents(db, auth);
  const prep = evaluate("prepare_external_action", { actor: coordinator.id, agentMaxLevel: coordinator.maxLevel, agentAllowedActions: coordinator.allowedActions }, { accountStatus: auth.status, consents, userInitiated: true });
  if (!prep.allowed) throw forbidden(prep.reason, prep.rule);

  // Only the user's own context items can be attached; anything else is rejected.
  let shared: Array<{ label: string; value: string }> = [];
  if (input.shareContextIds.length) {
    const { results } = await db.prepare(`SELECT id, label, value FROM personal_context WHERE tenant_id = ? AND user_id = ? AND id IN (${input.shareContextIds.map(() => "?").join(",")})`).bind(auth.tenantId, auth.userId, ...input.shareContextIds).all<{ id: string; label: string; value: string }>();
    if ((results ?? []).length !== input.shareContextIds.length) throw notFound("One or more selected items were not found.");
    shared = (results ?? []).map((r) => ({ label: r.label, value: r.value }));
  }
  const payload = { actionType: input.actionType, destination: input.destination, subject: input.subject, body: input.body, shared };
  const payloadHash = await sha256Hex(stableStringify(payload));
  const meta = ACTION_LABELS[input.actionType]!;
  const id = newId("apr");
  const now = new Date();
  const dataShared = shared.length ? `Message text plus: ${shared.map((s) => s.label).join(", ")}` : "Message text only";
  await db.prepare(
    `INSERT INTO approvals (id, tenant_id, user_id, action_type, title, destination, data_shared, cost_text, reversible, payload_json, payload_hash, status, requested_by, expires_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?, ?)`,
  ).bind(id, auth.tenantId, auth.userId, input.actionType, `${meta.title}: ${input.subject}`, input.destination, dataShared, meta.cost, meta.reversible ? 1 : 0, JSON.stringify(payload), payloadHash, "user", nowIso(new Date(now.getTime() + APPROVAL_TTL_MS)), nowIso(now)).run();
  await logActivity(db, auth, "action_coordinator", "approval_requested", "approval", id, input.actionType);
  await notify(db, auth, "approval_pending", "An action is waiting for your review", `${meta.title} to ${input.destination}. Nothing happens until you approve it.`, "/app/approvals");
  return c.json({ id, payloadHash, status: "pending" }, 201);
});

function shapeApproval(a: Record<string, unknown>) {
  const payload = JSON.parse(String(a.payload_json)) as Record<string, unknown>;
  return {
    id: a.id, actionType: a.action_type, title: a.title, destination: a.destination, dataShared: a.data_shared, cost: a.cost_text,
    reversible: bool(a.reversible), payload, payloadHash: a.payload_hash, status: a.status, requestedBy: a.requested_by,
    decidedAt: a.decided_at, executedAt: a.executed_at, result: a.result_json ? JSON.parse(String(a.result_json)) : null,
    expiresAt: a.expires_at, createdAt: a.created_at,
  };
}

governanceRoutes.get("/approvals", async (c) => {
  const auth = A(c);
  const status = c.req.query("status");
  const { limit, cursor } = query(c, PageQuery);
  const cur = decodeCursor(cursor);
  // Expire stale pending approvals before listing (fail closed).
  await c.env.DB.prepare("UPDATE approvals SET status = 'expired' WHERE tenant_id = ? AND user_id = ? AND status IN ('pending','approved') AND expires_at <= ?").bind(auth.tenantId, auth.userId, nowIso()).run();
  const where = ["tenant_id = ?", "user_id = ?"];
  const binds: unknown[] = [auth.tenantId, auth.userId];
  if (status) { where.push("status = ?"); binds.push(status); }
  if (cur) { where.push("(created_at < ? OR (created_at = ? AND id < ?))"); binds.push(cur.createdAt, cur.createdAt, cur.id); }
  const { results } = await c.env.DB.prepare(`SELECT * FROM approvals WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...binds, limit + 1).all<Record<string, unknown>>();
  const rows = results ?? [];
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return c.json({ items: items.map(shapeApproval), nextCursor: rows.length > limit && last ? encodeCursor(String(last.created_at), String(last.id)) : null });
});

governanceRoutes.post("/approvals/:id/decision", idempotent, async (c) => {
  const auth = A(c);
  const input = await body(c, ApprovalDecision);
  const db = c.env.DB;
  const a = await db.prepare("SELECT * FROM approvals WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(c.req.param("id"), auth.tenantId, auth.userId).first<Record<string, unknown>>();
  if (!a) throw notFound("Approval not found.");
  if (a.status !== "pending") throw conflict(`This request is already ${a.status}.`, "approval_not_pending");
  if (Date.parse(String(a.expires_at)) <= Date.now()) {
    await db.prepare("UPDATE approvals SET status = 'expired' WHERE id = ?").bind(a.id).run();
    throw conflict("This request expired. Create it again if you still want it.", "approval_expired");
  }
  if (input.payloadHash !== a.payload_hash) throw conflict("The action changed since you reviewed it. Please review it again.", "approval_payload_mismatch");

  if (input.decision === "reject") {
    await db.prepare("UPDATE approvals SET status = 'rejected', decided_at = ? WHERE id = ? AND status = 'pending'").bind(nowIso(), a.id).run();
    await logActivity(db, auth, "user", "approval_rejected", "approval", String(a.id));
    return c.json({ status: "rejected" });
  }

  // Approve, then execute through the policy engine. The policy engine re-checks consent,
  // ownership, expiry and payload hash; it is the only path to the adapter.
  const upd = await db.prepare("UPDATE approvals SET status = 'approved', decided_at = ? WHERE id = ? AND status = 'pending'").bind(nowIso(), a.id).run();
  if ((upd.meta.changes ?? 0) === 0) throw conflict("This request was already decided.", "approval_not_pending");
  await logActivity(db, auth, "user", "approval_granted", "approval", String(a.id));
  const result = await executeApproval(c, auth, String(a.id));
  return c.json(result);
});

async function executeApproval(c: Context<AppBindings>, auth: AuthContext, approvalId: string) {
  const db = c.env.DB;
  const a = await db.prepare("SELECT * FROM approvals WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(approvalId, auth.tenantId, auth.userId).first<Record<string, unknown>>();
  if (!a) throw notFound();
  const payload = JSON.parse(String(a.payload_json)) as { destination: string; subject: string; body: string };
  const recomputed = await sha256Hex(stableStringify(JSON.parse(String(a.payload_json))));
  const consents = await getConsents(db, auth);
  const coordinator = AGENTS.action_coordinator;
  const decision = evaluate(
    L4_ACTIONS.has(String(a.action_type)) ? "autonomous_high_impact" : "execute_external_action",
    { actor: coordinator.id, agentMaxLevel: coordinator.maxLevel, agentAllowedActions: coordinator.allowedActions },
    {
      accountStatus: auth.status, consents, requestUserId: auth.userId, expectedPayloadHash: recomputed,
      approval: { status: String(a.status), expiresAt: String(a.expires_at), payloadHash: String(a.payload_hash), userId: String(a.user_id) },
    },
  );
  const runId = newId("run");
  await db.prepare("INSERT INTO agent_runs (id, tenant_id, user_id, agent, intent, permission_level, status, input_redacted, policy_decision, started_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(runId, auth.tenantId, auth.userId, coordinator.id, `execute:${a.action_type}`, decision.level, decision.allowed ? "running" : "blocked", redact(`${payload.destination} | ${payload.subject}`), JSON.stringify(decision), nowIso()).run();
  if (!decision.allowed) {
    // Approval stays 'approved' but not executed; user can grant consent and retry or cancel.
    await db.prepare("UPDATE agent_runs SET finished_at = ?, error = ? WHERE id = ?").bind(nowIso(), decision.rule, runId).run();
    await logActivity(db, auth, "safety_guardian", "execution_blocked", "approval", approvalId, decision.rule);
    return { status: "approved", executed: false, blockedReason: decision.reason, rule: decision.rule };
  }
  let seq = 0;
  const onEvent = async (type: string, detail: string) => {
    seq++;
    await db.prepare("INSERT INTO agent_events (id, run_id, tenant_id, seq, type, detail, created_at) VALUES (?,?,?,?,?,?,?)").bind(newId("evt"), runId, auth.tenantId, seq, type, detail, nowIso()).run();
  };
  try {
    const adapter = getProvider<MessageInput, MessageOutput>("mock.messaging") as ProviderAdapter<MessageInput, MessageOutput>;
    const r = await invokeWithPolicy(adapter, payload, { timeoutMs: coordinator.timeoutMs, maxRetries: coordinator.maxRetries, onEvent });
    const resultJson = JSON.stringify({ ...r.data, provenance: r.provenance });
    await db.batch([
      db.prepare("UPDATE approvals SET status = 'executed', executed_at = ?, result_json = ? WHERE id = ?").bind(nowIso(), resultJson, approvalId),
      db.prepare("UPDATE agent_runs SET status = 'completed', adapter = ?, output_json = ?, finished_at = ? WHERE id = ?").bind(r.provenance.provider, resultJson, nowIso(), runId),
    ]);
    await logActivity(db, auth, "action_coordinator", "action_executed", "approval", approvalId, `${r.provenance.provider} ${r.data.reference} (simulated)`);
    await notify(db, auth, "approval_executed", "Approved action recorded", `Simulated only — reference ${r.data.reference}. No real message left EUDELLA.`, "/app/activity");
    return { status: "executed", executed: true, result: JSON.parse(resultJson) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    await db.batch([
      db.prepare("UPDATE approvals SET status = 'failed', result_json = ? WHERE id = ?").bind(JSON.stringify({ error: "Provider unavailable" }), approvalId),
      db.prepare("UPDATE agent_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").bind(msg, nowIso(), runId),
    ]);
    await logActivity(db, auth, "action_coordinator", "action_failed", "approval", approvalId, msg);
    return { status: "failed", executed: false, error: "The provider could not complete this action. Nothing was sent." };
  }
}

/** Retry execution of an approved-but-blocked action (e.g. after granting consent). */
governanceRoutes.post("/approvals/:id/execute", idempotent, async (c) => {
  const auth = A(c);
  const a = await c.env.DB.prepare("SELECT status FROM approvals WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(c.req.param("id"), auth.tenantId, auth.userId).first<{ status: string }>();
  if (!a) throw notFound("Approval not found.");
  if (a.status !== "approved") throw conflict(`Only approved requests can be executed (this one is ${a.status}).`, "approval_not_approved");
  return c.json(await executeApproval(c, auth, c.req.param("id")));
});

governanceRoutes.post("/approvals/:id/cancel", async (c) => {
  const auth = A(c);
  const r = await c.env.DB.prepare("UPDATE approvals SET status = 'cancelled', decided_at = ? WHERE id = ? AND tenant_id = ? AND user_id = ? AND status IN ('pending','approved')").bind(nowIso(), c.req.param("id"), auth.tenantId, auth.userId).run();
  if ((r.meta.changes ?? 0) === 0) throw notFound("No cancellable request found.");
  await logActivity(c.env.DB, auth, "user", "approval_cancelled", "approval", c.req.param("id"));
  return c.json({ status: "cancelled" });
});

// ---------- activity ----------
governanceRoutes.get("/activity", async (c) => {
  const auth = A(c);
  const { limit, cursor } = query(c, PageQuery);
  const cur = decodeCursor(cursor);
  const { results } = await c.env.DB
    .prepare(`SELECT id, actor, action, entity_type, entity_id, detail, created_at FROM activity_logs WHERE tenant_id = ? AND user_id = ? ${cur ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : ""} ORDER BY created_at DESC, id DESC LIMIT ?`)
    .bind(auth.tenantId, auth.userId, ...(cur ? [cur.createdAt, cur.createdAt, cur.id] : []), limit + 1)
    .all<Record<string, unknown>>();
  const rows = results ?? [];
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return c.json({ items, nextCursor: rows.length > limit && last ? encodeCursor(String(last.created_at), String(last.id)) : null });
});

// ---------- notifications ----------
governanceRoutes.get("/notifications", async (c) => {
  const auth = A(c);
  const { results } = await c.env.DB.prepare("SELECT * FROM notifications WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100").bind(auth.tenantId, auth.userId).all();
  return c.json({ items: results ?? [] });
});
governanceRoutes.post("/notifications/read-all", async (c) => {
  const auth = A(c);
  await c.env.DB.prepare("UPDATE notifications SET read_at = ? WHERE tenant_id = ? AND user_id = ? AND read_at IS NULL").bind(nowIso(), auth.tenantId, auth.userId).run();
  return c.json({ ok: true });
});
governanceRoutes.post("/notifications/:id/read", async (c) => {
  const auth = A(c);
  const r = await c.env.DB.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(nowIso(), c.req.param("id"), auth.tenantId, auth.userId).run();
  if ((r.meta.changes ?? 0) === 0) throw notFound();
  return c.json({ ok: true });
});

// ---------- consent (allowed while paused) ----------
accountControlRoutes.get("/consents", async (c) => {
  const auth = A(c);
  const current = await getConsents(c.env.DB, auth);
  const { results } = await c.env.DB.prepare("SELECT scope, granted, purpose, policy_version, created_at FROM consent_records WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100").bind(auth.tenantId, auth.userId).all();
  return c.json({ current, history: results ?? [], policyVersion: POLICY_VERSION });
});

accountControlRoutes.post("/consents", async (c) => {
  const auth = A(c);
  const input = await body(c, ConsentUpdate);
  const db = c.env.DB;
  if (input.scope === "ai_assistance" && input.granted && c.env.AI_ENABLED !== "true") {
    throw forbidden("AI assistance is not available on this deployment yet. No data is sent to AI providers.", "ai_unavailable");
  }
  const now = nowIso();
  const stmts = [db.prepare("INSERT INTO consent_records (id, tenant_id, user_id, scope, granted, purpose, policy_version, created_at) VALUES (?,?,?,?,?,?,?,?)").bind(newId("cns"), auth.tenantId, auth.userId, input.scope, input.granted ? 1 : 0, input.granted ? "user_granted" : "user_revoked", POLICY_VERSION, now)];
  if (input.scope === "ai_assistance") stmts.push(db.prepare("UPDATE user_preferences SET ai_assistance_enabled = ?, updated_at = ? WHERE user_id = ? AND tenant_id = ?").bind(input.granted ? 1 : 0, now, auth.userId, auth.tenantId));
  // Revoking external-action consent cancels anything still waiting.
  if (input.scope === "external_actions" && !input.granted) stmts.push(db.prepare("UPDATE approvals SET status = 'cancelled', decided_at = ? WHERE tenant_id = ? AND user_id = ? AND status IN ('pending','approved')").bind(now, auth.tenantId, auth.userId));
  await db.batch(stmts);
  await logActivity(db, auth, "user", input.granted ? "consent_granted" : "consent_revoked", "consent", input.scope);
  return c.json({ ok: true, current: await getConsents(db, auth) });
});

// ---------- export (allowed while paused) ----------
const EXPORT_TABLES = ["personal_context", "needs", "goals", "plans", "plan_tasks", "saved_items", "approvals", "consent_records", "integrations", "activity_logs", "notifications", "agent_runs", "data_export_requests"] as const;

accountControlRoutes.get("/export", rateLimit("export", 5, 3600), async (c) => {
  const auth = A(c);
  const db = c.env.DB;
  const user = await db.prepare("SELECT id, email, status, onboarding_completed, created_at, updated_at FROM users WHERE id = ? AND tenant_id = ?").bind(auth.userId, auth.tenantId).first();
  const profile = await db.prepare("SELECT display_name, locale, region, pronouns, bio, created_at, updated_at FROM profiles WHERE user_id = ? AND tenant_id = ?").bind(auth.userId, auth.tenantId).first();
  const prefs = await db.prepare("SELECT * FROM user_preferences WHERE user_id = ? AND tenant_id = ?").bind(auth.userId, auth.tenantId).first();
  const nprefs = await db.prepare("SELECT * FROM notification_preferences WHERE user_id = ? AND tenant_id = ?").bind(auth.userId, auth.tenantId).first();
  const data: Record<string, unknown> = { user, profile, preferences: prefs, notificationPreferences: nprefs };
  for (const t of EXPORT_TABLES) {
    const { results } = await db.prepare(`SELECT * FROM ${t} WHERE tenant_id = ? AND user_id = ?`).bind(auth.tenantId, auth.userId).all();
    data[t] = results ?? [];
  }
  const doc = { format: "eudella-export-v1", exportedAt: nowIso(), note: "This file contains all personal data EUDELLA stores about you. Password hashes and session tokens are excluded.", data };
  const json = JSON.stringify(doc, null, 2);
  await db.prepare("INSERT INTO data_export_requests (id, tenant_id, user_id, status, byte_size, created_at, completed_at) VALUES (?,?,?,?,?,?,?)").bind(newId("exp"), auth.tenantId, auth.userId, "completed", json.length, nowIso(), nowIso()).run();
  await logActivity(db, auth, "user", "data_exported");
  return c.body(json, 200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="eudella-export-${new Date().toISOString().slice(0, 10)}.json"` });
});

// ---------- pause / resume (allowed while paused) ----------
accountControlRoutes.post("/account/pause", async (c) => {
  const auth = A(c);
  const input = await body(c, PauseAccountInput);
  const db = c.env.DB;
  const now = nowIso();
  const stmts = [db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND status != 'closed'").bind(input.paused ? "paused" : "active", now, auth.userId, auth.tenantId)];
  if (input.paused) stmts.push(db.prepare("UPDATE approvals SET status = 'cancelled', decided_at = ? WHERE tenant_id = ? AND user_id = ? AND status IN ('pending','approved')").bind(now, auth.tenantId, auth.userId));
  await db.batch(stmts);
  await logActivity(db, auth, "user", input.paused ? "account_paused" : "account_resumed");
  return c.json({ status: input.paused ? "paused" : "active" });
});

// ---------- delete (allowed while paused) ----------
accountControlRoutes.post("/account/delete", rateLimit("delete", 5, 3600), async (c) => {
  const auth = A(c);
  const input = await body(c, DeleteAccountInput);
  const db = c.env.DB;
  const u = await db.prepare("SELECT password_hash FROM users WHERE id = ? AND tenant_id = ?").bind(auth.userId, auth.tenantId).first<{ password_hash: string }>();
  if (!u) throw unauthorized();
  if (!(await verifyPassword(input.password, u.password_hash))) throw new HttpError(403, "invalid_credentials", "Password is incorrect.");
  const subjectHash = await sha256Hex(`${c.env.AUDIT_SALT ?? "eudella-dev-salt"}:${auth.userId}`);
  const now = nowIso();
  // Deleting the personal tenant cascades to every user-owned table (FKs ON DELETE CASCADE).
  // Explicit deletes first make the erasure independent of FK enforcement settings.
  const owned = ["agent_events", "agent_runs", "approvals", "consent_records", "integrations", "activity_logs", "notifications", "notification_preferences", "data_export_requests", "saved_items", "plan_tasks", "plans", "goals", "needs", "personal_context", "user_preferences", "sessions", "profiles"];
  await db.batch([
    ...owned.map((t) => db.prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).bind(auth.tenantId)),
    db.prepare("DELETE FROM idempotency_keys WHERE user_id = ?").bind(auth.userId),
    db.prepare("DELETE FROM users WHERE id = ? AND tenant_id = ?").bind(auth.userId, auth.tenantId),
    db.prepare("DELETE FROM tenants WHERE id = ? AND kind = 'personal'").bind(auth.tenantId),
    db.prepare("INSERT INTO account_deletion_requests (id, subject_hash, status, reason, requested_at, completed_at) VALUES (?,?,?,?,?,?)").bind(newId("del"), subjectHash, "completed", input.reason ? input.reason.slice(0, 500) : null, now, now),
  ]);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ deleted: true });
});

export { CONSENT_SCOPES };
