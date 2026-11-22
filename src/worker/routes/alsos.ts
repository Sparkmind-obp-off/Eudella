import { Hono } from "hono";
import type { AppBindings } from "../env";
import { AgentRunInput, PageQuery } from "../../shared/contracts";
import { body, query } from "../lib/validate";
import { runAgent } from "../alsos/orchestrator";
import { publicAgentList } from "../alsos/agents";
import { listProviders } from "../alsos/providers/registry";
import { ACTION_LEVELS } from "../alsos/policy";
import { rateLimit } from "../lib/middleware";
import { notFound } from "../lib/errors";
import { decodeCursor, encodeCursor } from "../lib/util";

export const alsosRoutes = new Hono<AppBindings>();

alsosRoutes.get("/agents", (c) => c.json({ agents: publicAgentList(), aiEnabled: c.env.AI_ENABLED === "true", policyLevels: ACTION_LEVELS }));
alsosRoutes.get("/providers", (c) => c.json({ providers: listProviders().map(({ secretBinding: _s, ...p }) => p) }));

alsosRoutes.post("/agents/run", rateLimit("agent_run", 30, 60), async (c) => {
  const input = await body(c, AgentRunInput);
  const result = await runAgent(c.env, c.get("auth")!, input);
  return c.json(result, result.status === "blocked" ? 422 : 200);
});

alsosRoutes.get("/agent-runs", async (c) => {
  const auth = c.get("auth")!;
  const { limit, cursor } = query(c, PageQuery);
  const cur = decodeCursor(cursor);
  const { results } = await c.env.DB
    .prepare(`SELECT id, agent, intent, permission_level, status, policy_decision, error, started_at AS created_at, finished_at FROM agent_runs WHERE tenant_id = ? AND user_id = ? ${cur ? "AND (started_at < ? OR (started_at = ? AND id < ?))" : ""} ORDER BY started_at DESC, id DESC LIMIT ?`)
    .bind(auth.tenantId, auth.userId, ...(cur ? [cur.createdAt, cur.createdAt, cur.id] : []), limit + 1)
    .all<Record<string, unknown>>();
  const rows = results ?? [];
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return c.json({ items, nextCursor: rows.length > limit && last ? encodeCursor(String(last.created_at), String(last.id)) : null });
});

alsosRoutes.get("/agent-runs/:id", async (c) => {
  const auth = c.get("auth")!;
  const run = await c.env.DB.prepare("SELECT * FROM agent_runs WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(c.req.param("id"), auth.tenantId, auth.userId).first();
  if (!run) throw notFound("Run not found.");
  const { results } = await c.env.DB.prepare("SELECT seq, type, detail, created_at FROM agent_events WHERE run_id = ? AND tenant_id = ? ORDER BY seq").bind(c.req.param("id"), auth.tenantId).all();
  return c.json({ ...run, events: results ?? [] });
});
