// Shared data-access helpers. Every query that touches user data filters by BOTH tenant_id and
// user_id taken from the server-side AuthContext.
import type { AuthContext } from "../env";
import { newId, nowIso, bool } from "../lib/util";
import { CONSENT_SCOPES } from "../../shared/contracts";

export async function logActivity(
  db: D1Database,
  auth: Pick<AuthContext, "tenantId" | "userId">,
  actor: string,
  action: string,
  entityType?: string | null,
  entityId?: string | null,
  detail?: string | null,
): Promise<void> {
  await db
    .prepare("INSERT INTO activity_logs (id, tenant_id, user_id, actor, action, entity_type, entity_id, detail, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(newId("act"), auth.tenantId, auth.userId, actor, action, entityType ?? null, entityId ?? null, detail ?? null, nowIso())
    .run();
}

export async function notify(
  db: D1Database,
  auth: Pick<AuthContext, "tenantId" | "userId">,
  kind: string,
  title: string,
  body: string,
  link?: string,
): Promise<void> {
  const prefs = await db.prepare("SELECT in_app, approvals, task_reminders FROM notification_preferences WHERE user_id = ? AND tenant_id = ?").bind(auth.userId, auth.tenantId).first<{ in_app: number; approvals: number; task_reminders: number }>();
  if (prefs && !bool(prefs.in_app)) return;
  if (prefs && kind.startsWith("approval") && !bool(prefs.approvals)) return;
  if (prefs && kind.startsWith("task") && !bool(prefs.task_reminders)) return;
  await db
    .prepare("INSERT INTO notifications (id, tenant_id, user_id, kind, title, body, link, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(newId("ntf"), auth.tenantId, auth.userId, kind, title, body, link ?? null, nowIso())
    .run();
}

/** Current consent state: latest record per scope. Missing = not granted (fail closed). */
export async function getConsents(db: D1Database, auth: Pick<AuthContext, "tenantId" | "userId">): Promise<Record<string, boolean>> {
  const { results } = await db
    .prepare(
      `SELECT scope, granted FROM consent_records c
       WHERE user_id = ? AND tenant_id = ? AND created_at = (
         SELECT MAX(created_at) FROM consent_records c2 WHERE c2.user_id = c.user_id AND c2.scope = c.scope)`,
    )
    .bind(auth.userId, auth.tenantId)
    .all<{ scope: string; granted: number }>();
  const out: Record<string, boolean> = {};
  for (const s of CONSENT_SCOPES) out[s] = false;
  for (const r of results ?? []) out[r.scope] = bool(r.granted);
  return out;
}

export async function getPreferences(db: D1Database, auth: Pick<AuthContext, "tenantId" | "userId">) {
  const p = await db.prepare("SELECT * FROM user_preferences WHERE user_id = ? AND tenant_id = ?").bind(auth.userId, auth.tenantId).first<Record<string, unknown>>();
  return {
    aiAssistanceEnabled: p ? bool(p.ai_assistance_enabled) : false,
    memoryEnabled: p ? bool(p.memory_enabled) : false,
    reducedMotion: p ? bool(p.reduced_motion) : false,
    theme: (p?.theme as string) ?? "light",
  };
}

export const POLICY_VERSION = "2026-11-22.1";
