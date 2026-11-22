// Profile, preferences, personal context, needs, goals, plans, tasks.
import { Hono, type Context } from "hono";
import type { AppBindings, AuthContext } from "../env";
import {
  ContextInput, ContextUpdate, GoalInput, GoalUpdate, NeedInput, NeedUpdate, NotificationPrefsUpdate,
  PlanInput, PlanUpdate, PreferencesUpdate, ProfileUpdate, TaskInput, TaskUpdate, PageQuery,
} from "../../shared/contracts";
import { body, query } from "../lib/validate";
import { notFound, badRequest } from "../lib/errors";
import { bool, newId, nowIso, encodeCursor, decodeCursor } from "../lib/util";
import { logActivity, notify, getPreferences } from "../services/core";

export const personalRoutes = new Hono<AppBindings>();
const A = (c: Context<AppBindings>): AuthContext => c.get("auth")!;

// ---------- helpers ----------
async function ensureOwned(db: D1Database, table: string, id: string | null | undefined, auth: AuthContext): Promise<void> {
  if (!id) return;
  const row = await db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND tenant_id = ? AND user_id = ?`).bind(id, auth.tenantId, auth.userId).first();
  if (!row) throw notFound(`Referenced ${table.replace(/s$/, "")} not found.`);
}

/** Build an UPDATE from a column map, always scoped by id + tenant + user. */
async function scopedUpdate(db: D1Database, table: string, id: string, auth: AuthContext, cols: Record<string, unknown>): Promise<boolean> {
  const entries = Object.entries(cols).filter(([, v]) => v !== undefined);
  if (!entries.length) throw badRequest("Nothing to update.");
  const set = entries.map(([k]) => `${k} = ?`).join(", ");
  const r = await db
    .prepare(`UPDATE ${table} SET ${set}, updated_at = ? WHERE id = ? AND tenant_id = ? AND user_id = ?`)
    .bind(...entries.map(([, v]) => v), nowIso(), id, auth.tenantId, auth.userId)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

async function scopedDelete(db: D1Database, table: string, id: string, auth: AuthContext): Promise<boolean> {
  const r = await db.prepare(`DELETE FROM ${table} WHERE id = ? AND tenant_id = ? AND user_id = ?`).bind(id, auth.tenantId, auth.userId).run();
  return (r.meta.changes ?? 0) > 0;
}

async function page(c: Context<AppBindings>, table: string, extraWhere = "", extraBinds: unknown[] = [], order = "created_at DESC, id DESC") {
  const auth = A(c);
  const { limit, cursor } = query(c, PageQuery);
  const cur = decodeCursor(cursor);
  const where = [`tenant_id = ?`, `user_id = ?`];
  const binds: unknown[] = [auth.tenantId, auth.userId];
  if (extraWhere) {
    where.push(extraWhere);
    binds.push(...extraBinds);
  }
  if (cur) {
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    binds.push(cur.createdAt, cur.createdAt, cur.id);
  }
  const { results } = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?`).bind(...binds, limit + 1).all<Record<string, unknown>>();
  const rows = results ?? [];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(String(last.created_at), String(last.id)) : null };
}

// ---------- profile ----------
personalRoutes.get("/profile", async (c) => {
  const auth = A(c);
  const p = await c.env.DB
    .prepare("SELECT p.display_name, p.locale, p.region, p.pronouns, p.bio, u.email, u.status, u.onboarding_completed, u.created_at FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ? AND p.tenant_id = ?")
    .bind(auth.userId, auth.tenantId)
    .first<Record<string, unknown>>();
  if (!p) throw notFound();
  return c.json({
    displayName: p.display_name, locale: p.locale, region: p.region, pronouns: p.pronouns, bio: p.bio,
    email: p.email, status: p.status, onboardingCompleted: bool(p.onboarding_completed), createdAt: p.created_at,
  });
});

personalRoutes.patch("/profile", async (c) => {
  const auth = A(c);
  const input = await body(c, ProfileUpdate);
  const cols = { display_name: input.displayName, locale: input.locale, region: input.region, pronouns: input.pronouns, bio: input.bio };
  const entries = Object.entries(cols).filter(([, v]) => v !== undefined);
  if (!entries.length) throw badRequest("Nothing to update.");
  await c.env.DB
    .prepare(`UPDATE profiles SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE user_id = ? AND tenant_id = ?`)
    .bind(...entries.map(([, v]) => v), nowIso(), auth.userId, auth.tenantId)
    .run();
  await logActivity(c.env.DB, auth, "user", "profile_updated", "profile", auth.userId, entries.map(([k]) => k).join(","));
  return c.json({ ok: true });
});

personalRoutes.post("/onboarding/complete", async (c) => {
  const auth = A(c);
  await c.env.DB.prepare("UPDATE users SET onboarding_completed = 1, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(nowIso(), auth.userId, auth.tenantId).run();
  await logActivity(c.env.DB, auth, "user", "onboarding_completed");
  await notify(c.env.DB, auth, "welcome", "Welcome to EUDELLA", "Your space is ready. Start with a need, a plan or simply look around — you remain in charge.", "/app");
  return c.json({ ok: true });
});

// ---------- preferences ----------
personalRoutes.get("/preferences", async (c) => {
  const auth = A(c);
  const prefs = await getPreferences(c.env.DB, auth);
  const n = await c.env.DB.prepare("SELECT * FROM notification_preferences WHERE user_id = ? AND tenant_id = ?").bind(auth.userId, auth.tenantId).first<Record<string, unknown>>();
  return c.json({
    ...prefs,
    aiAvailableOnPlatform: c.env.AI_ENABLED === "true",
    notifications: { inApp: bool(n?.in_app), email: bool(n?.email), approvals: bool(n?.approvals), taskReminders: bool(n?.task_reminders), productUpdates: bool(n?.product_updates) },
  });
});

personalRoutes.patch("/preferences", async (c) => {
  const auth = A(c);
  const input = await body(c, PreferencesUpdate);
  const cols: Record<string, unknown> = {
    memory_enabled: input.memoryEnabled === undefined ? undefined : input.memoryEnabled ? 1 : 0,
    reduced_motion: input.reducedMotion === undefined ? undefined : input.reducedMotion ? 1 : 0,
    theme: input.theme,
  };
  const entries = Object.entries(cols).filter(([, v]) => v !== undefined);
  if (!entries.length) throw badRequest("Nothing to update.");
  await c.env.DB.prepare(`UPDATE user_preferences SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE user_id = ? AND tenant_id = ?`).bind(...entries.map(([, v]) => v), nowIso(), auth.userId, auth.tenantId).run();
  await logActivity(c.env.DB, auth, "user", "preferences_updated", null, null, entries.map(([k]) => k).join(","));
  return c.json({ ok: true });
});

personalRoutes.patch("/preferences/notifications", async (c) => {
  const auth = A(c);
  const input = await body(c, NotificationPrefsUpdate);
  const map: Record<string, boolean | undefined> = { in_app: input.inApp, approvals: input.approvals, task_reminders: input.taskReminders, product_updates: input.productUpdates };
  const entries = Object.entries(map).filter(([, v]) => v !== undefined);
  if (!entries.length) throw badRequest("Nothing to update.");
  await c.env.DB.prepare(`UPDATE notification_preferences SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE user_id = ? AND tenant_id = ?`).bind(...entries.map(([, v]) => (v ? 1 : 0)), nowIso(), auth.userId, auth.tenantId).run();
  return c.json({ ok: true });
});

// ---------- personal context ----------
personalRoutes.get("/context", async (c) => c.json(await page(c, "personal_context", "", [], "updated_at DESC, id DESC")));
personalRoutes.post("/context", async (c) => {
  const auth = A(c);
  const input = await body(c, ContextInput);
  const id = newId("ctx");
  const now = nowIso();
  await c.env.DB.prepare("INSERT INTO personal_context (id, tenant_id, user_id, category, label, value, sensitivity, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, auth.tenantId, auth.userId, input.category, input.label, input.value, input.sensitivity, "user", now, now).run();
  await logActivity(c.env.DB, auth, "user", "context_added", "personal_context", id, input.label);
  return c.json({ id }, 201);
});
personalRoutes.patch("/context/:id", async (c) => {
  const input = await body(c, ContextUpdate);
  const ok = await scopedUpdate(c.env.DB, "personal_context", c.req.param("id"), A(c), { category: input.category, label: input.label, value: input.value, sensitivity: input.sensitivity });
  if (!ok) throw notFound("Context item not found.");
  await logActivity(c.env.DB, A(c), "user", "context_corrected", "personal_context", c.req.param("id"));
  return c.json({ ok: true });
});
personalRoutes.delete("/context/:id", async (c) => {
  if (!(await scopedDelete(c.env.DB, "personal_context", c.req.param("id"), A(c)))) throw notFound("Context item not found.");
  await logActivity(c.env.DB, A(c), "user", "context_deleted", "personal_context", c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- needs ----------
personalRoutes.get("/needs", async (c) => {
  const status = c.req.query("status");
  if (status && !["open", "in_progress", "resolved", "archived"].includes(status)) throw badRequest("Unknown status filter.");
  return c.json(await page(c, "needs", status ? "status = ?" : "", status ? [status] : [], "priority DESC, created_at DESC, id DESC"));
});
personalRoutes.post("/needs", async (c) => {
  const auth = A(c);
  const input = await body(c, NeedInput);
  const id = newId("need");
  const now = nowIso();
  await c.env.DB.prepare("INSERT INTO needs (id, tenant_id, user_id, title, description, area, urgency, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, auth.tenantId, auth.userId, input.title, input.description ?? null, input.area, input.urgency, now, now).run();
  await logActivity(c.env.DB, auth, "user", "need_created", "need", id, input.title);
  return c.json({ id }, 201);
});
personalRoutes.get("/needs/:id", async (c) => {
  const auth = A(c);
  const n = await c.env.DB.prepare("SELECT * FROM needs WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(c.req.param("id"), auth.tenantId, auth.userId).first();
  if (!n) throw notFound("Need not found.");
  return c.json(n);
});
personalRoutes.patch("/needs/:id", async (c) => {
  const input = await body(c, NeedUpdate);
  const ok = await scopedUpdate(c.env.DB, "needs", c.req.param("id"), A(c), { title: input.title, description: input.description, area: input.area, urgency: input.urgency, status: input.status, priority: input.priority });
  if (!ok) throw notFound("Need not found.");
  await logActivity(c.env.DB, A(c), "user", "need_updated", "need", c.req.param("id"));
  return c.json({ ok: true });
});
personalRoutes.delete("/needs/:id", async (c) => {
  if (!(await scopedDelete(c.env.DB, "needs", c.req.param("id"), A(c)))) throw notFound("Need not found.");
  await logActivity(c.env.DB, A(c), "user", "need_deleted", "need", c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- goals ----------
personalRoutes.get("/goals", async (c) => c.json(await page(c, "goals")));
personalRoutes.post("/goals", async (c) => {
  const auth = A(c);
  const input = await body(c, GoalInput);
  await ensureOwned(c.env.DB, "needs", input.needId, auth);
  const id = newId("goal");
  const now = nowIso();
  await c.env.DB.prepare("INSERT INTO goals (id, tenant_id, user_id, need_id, title, description, success_definition, target_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, auth.tenantId, auth.userId, input.needId ?? null, input.title, input.description ?? null, input.successDefinition ?? null, input.targetDate ?? null, now, now).run();
  await logActivity(c.env.DB, auth, "user", "goal_created", "goal", id, input.title);
  return c.json({ id }, 201);
});
personalRoutes.patch("/goals/:id", async (c) => {
  const auth = A(c);
  const input = await body(c, GoalUpdate);
  await ensureOwned(c.env.DB, "needs", input.needId, auth);
  const ok = await scopedUpdate(c.env.DB, "goals", c.req.param("id"), auth, { title: input.title, description: input.description, success_definition: input.successDefinition, target_date: input.targetDate, need_id: input.needId, status: input.status });
  if (!ok) throw notFound("Goal not found.");
  return c.json({ ok: true });
});
personalRoutes.delete("/goals/:id", async (c) => {
  if (!(await scopedDelete(c.env.DB, "goals", c.req.param("id"), A(c)))) throw notFound("Goal not found.");
  return c.json({ ok: true });
});

// ---------- plans ----------
personalRoutes.get("/plans", async (c) => {
  const auth = A(c);
  const result = await page(c, "plans", "status != 'archived'", [], "updated_at DESC, id DESC");
  const ids = result.items.map((p) => String(p.id));
  const counts: Record<string, { total: number; done: number }> = {};
  if (ids.length) {
    const { results } = await c.env.DB
      .prepare(`SELECT plan_id, COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done FROM plan_tasks WHERE tenant_id = ? AND user_id = ? AND plan_id IN (${ids.map(() => "?").join(",")}) GROUP BY plan_id`)
      .bind(auth.tenantId, auth.userId, ...ids)
      .all<{ plan_id: string; total: number; done: number }>();
    for (const r of results ?? []) counts[r.plan_id] = { total: r.total, done: r.done ?? 0 };
  }
  return c.json({ ...result, items: result.items.map((p) => ({ ...p, progress: counts[String(p.id)] ?? { total: 0, done: 0 } })) });
});
personalRoutes.post("/plans", async (c) => {
  const auth = A(c);
  const input = await body(c, PlanInput);
  await ensureOwned(c.env.DB, "goals", input.goalId, auth);
  await ensureOwned(c.env.DB, "needs", input.needId, auth);
  const id = newId("plan");
  const now = nowIso();
  const stmts = [
    c.env.DB.prepare("INSERT INTO plans (id, tenant_id, user_id, goal_id, need_id, title, summary, origin, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, auth.tenantId, auth.userId, input.goalId ?? null, input.needId ?? null, input.title, input.summary ?? null, "user", now, now),
    ...(input.tasks ?? []).map((t, i) =>
      c.env.DB.prepare("INSERT INTO plan_tasks (id, tenant_id, user_id, plan_id, title, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(newId("task"), auth.tenantId, auth.userId, id, t, i, now, now),
    ),
  ];
  await c.env.DB.batch(stmts);
  await logActivity(c.env.DB, auth, "user", "plan_created", "plan", id, input.title);
  return c.json({ id }, 201);
});
personalRoutes.get("/plans/:id", async (c) => {
  const auth = A(c);
  const plan = await c.env.DB.prepare("SELECT * FROM plans WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(c.req.param("id"), auth.tenantId, auth.userId).first();
  if (!plan) throw notFound("Plan not found.");
  const { results } = await c.env.DB.prepare("SELECT * FROM plan_tasks WHERE plan_id = ? AND tenant_id = ? AND user_id = ? ORDER BY position, created_at").bind(c.req.param("id"), auth.tenantId, auth.userId).all();
  return c.json({ ...plan, tasks: results ?? [] });
});
personalRoutes.patch("/plans/:id", async (c) => {
  const input = await body(c, PlanUpdate);
  const ok = await scopedUpdate(c.env.DB, "plans", c.req.param("id"), A(c), { title: input.title, summary: input.summary, status: input.status });
  if (!ok) throw notFound("Plan not found.");
  await logActivity(c.env.DB, A(c), "user", "plan_updated", "plan", c.req.param("id"));
  return c.json({ ok: true });
});
personalRoutes.delete("/plans/:id", async (c) => {
  if (!(await scopedDelete(c.env.DB, "plans", c.req.param("id"), A(c)))) throw notFound("Plan not found.");
  await logActivity(c.env.DB, A(c), "user", "plan_deleted", "plan", c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- tasks ----------
personalRoutes.get("/tasks", async (c) => {
  const status = c.req.query("status");
  if (status && !["todo", "doing", "done", "skipped"].includes(status)) throw badRequest("Unknown status filter.");
  return c.json(await page(c, "plan_tasks", status ? "status = ?" : "", status ? [status] : []));
});
personalRoutes.post("/tasks", async (c) => {
  const auth = A(c);
  const input = await body(c, TaskInput);
  await ensureOwned(c.env.DB, "plans", input.planId, auth);
  const id = newId("task");
  const now = nowIso();
  const pos = input.planId
    ? ((await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM plan_tasks WHERE plan_id = ? AND tenant_id = ?").bind(input.planId, auth.tenantId).first<{ p: number }>())?.p ?? 0)
    : 0;
  await c.env.DB.prepare("INSERT INTO plan_tasks (id, tenant_id, user_id, plan_id, title, notes, position, due_date, resource_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id, auth.tenantId, auth.userId, input.planId ?? null, input.title, input.notes ?? null, pos, input.dueDate ?? null, input.resourceId ?? null, now, now).run();
  await logActivity(c.env.DB, auth, "user", "task_created", "task", id, input.title);
  return c.json({ id }, 201);
});
personalRoutes.patch("/tasks/:id", async (c) => {
  const auth = A(c);
  const input = await body(c, TaskUpdate);
  const cols: Record<string, unknown> = { title: input.title, notes: input.notes, status: input.status, position: input.position, due_date: input.dueDate };
  if (input.status) cols.completed_at = input.status === "done" ? nowIso() : null;
  const ok = await scopedUpdate(c.env.DB, "plan_tasks", c.req.param("id"), auth, cols);
  if (!ok) throw notFound("Task not found.");
  if (input.status === "done") await logActivity(c.env.DB, auth, "user", "task_completed", "task", c.req.param("id"));
  return c.json({ ok: true });
});
personalRoutes.delete("/tasks/:id", async (c) => {
  if (!(await scopedDelete(c.env.DB, "plan_tasks", c.req.param("id"), A(c)))) throw notFound("Task not found.");
  return c.json({ ok: true });
});

// ---------- dashboard summary ----------
personalRoutes.get("/dashboard", async (c) => {
  const auth = A(c);
  const db = c.env.DB;
  const b = [auth.tenantId, auth.userId];
  const [needs, tasks, approvals, unread, recent, plans] = await db.batch([
    db.prepare("SELECT id, title, area, urgency, status FROM needs WHERE tenant_id = ? AND user_id = ? AND status IN ('open','in_progress') ORDER BY priority DESC, created_at DESC LIMIT 5").bind(...b),
    db.prepare("SELECT id, title, status, due_date, plan_id FROM plan_tasks WHERE tenant_id = ? AND user_id = ? AND status IN ('todo','doing') ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date, created_at LIMIT 6").bind(...b),
    db.prepare("SELECT COUNT(*) AS n FROM approvals WHERE tenant_id = ? AND user_id = ? AND status = 'pending'").bind(...b),
    db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE tenant_id = ? AND user_id = ? AND read_at IS NULL").bind(...b),
    db.prepare("SELECT actor, action, detail, created_at FROM activity_logs WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 5").bind(...b),
    db.prepare("SELECT p.id, p.title, (SELECT COUNT(*) FROM plan_tasks t WHERE t.plan_id = p.id) AS total, (SELECT COUNT(*) FROM plan_tasks t WHERE t.plan_id = p.id AND t.status = 'done') AS done FROM plans p WHERE p.tenant_id = ? AND p.user_id = ? AND p.status = 'active' ORDER BY p.updated_at DESC LIMIT 3").bind(...b),
  ]);
  return c.json({
    needs: needs?.results ?? [],
    tasks: tasks?.results ?? [],
    pendingApprovals: (approvals?.results?.[0] as { n: number } | undefined)?.n ?? 0,
    unreadNotifications: (unread?.results?.[0] as { n: number } | undefined)?.n ?? 0,
    recentActivity: recent?.results ?? [],
    plans: plans?.results ?? [],
  });
});
