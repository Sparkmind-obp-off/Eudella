import { Hono, type Context } from "hono";
import type { AppBindings } from "../env";
import { SearchQuery } from "../../shared/contracts";
import { query } from "../lib/validate";
import { notFound, badRequest } from "../lib/errors";
import { newId, nowIso, bool } from "../lib/util";
import { logActivity } from "../services/core";
import { sanitizeRetrieved } from "../alsos/safety";

export const catalogRoutes = new Hono<AppBindings>();

function shapeResource(r: Record<string, unknown>) {
  return {
    id: r.id, title: sanitizeRetrieved(String(r.title)), summary: sanitizeRetrieved(String(r.summary)), description: sanitizeRetrieved(String(r.description)),
    category: r.category, area: r.area, providerName: r.provider_name,
    eligibility: r.eligibility ?? null, cost: r.cost_text ?? null, costVerified: bool(r.cost_verified),
    location: r.location_text ?? null, region: r.region ?? null, isOnline: bool(r.is_online), accessibility: r.accessibility_text ?? null,
    url: r.url ?? null, source: { name: r.source_name, url: r.source_url ?? null }, verificationStatus: r.verification_status, verifiedAt: r.verified_at ?? null,
    tags: String(r.tags ?? "").split(",").filter(Boolean),
  };
}
function shapeOpportunity(r: Record<string, unknown>) {
  return {
    id: r.id, title: sanitizeRetrieved(String(r.title)), summary: sanitizeRetrieved(String(r.summary)), description: sanitizeRetrieved(String(r.description)),
    kind: r.kind, organization: r.organization, eligibility: r.eligibility ?? null, cost: r.cost_text ?? null, costVerified: bool(r.cost_verified),
    deadline: r.deadline ?? null, location: r.location_text ?? null, isOnline: bool(r.is_online), limitations: r.limitations ?? null,
    url: r.url ?? null, source: { name: r.source_name, url: r.source_url ?? null }, verificationStatus: r.verification_status, verifiedAt: r.verified_at ?? null,
    tags: String(r.tags ?? "").split(",").filter(Boolean),
  };
}

async function search(c: Context<AppBindings>, table: "resources" | "opportunities") {
  const q = query(c, SearchQuery);
  const where: string[] = [];
  const binds: unknown[] = [];
  if (q.q) {
    const like = `%${q.q.toLowerCase().replace(/[%_]/g, "")}%`;
    where.push("(lower(title) LIKE ? OR lower(summary) LIKE ? OR lower(tags) LIKE ?)");
    binds.push(like, like, like);
  }
  if (table === "resources" && q.area) { where.push("area = ?"); binds.push(q.area); }
  if (table === "opportunities" && q.kind) { where.push("kind = ?"); binds.push(q.kind); }
  if (q.online) { where.push("is_online = ?"); binds.push(q.online === "true" ? 1 : 0); }
  if (q.cursor) { where.push("id > ?"); binds.push(q.cursor); }
  const { results } = await c.env.DB.prepare(`SELECT * FROM ${table} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id LIMIT ?`).bind(...binds, q.limit + 1).all<Record<string, unknown>>();
  const rows = results ?? [];
  const items = rows.slice(0, q.limit);
  return { items: table === "resources" ? items.map(shapeResource) : items.map(shapeOpportunity), nextCursor: rows.length > q.limit ? String(items[items.length - 1]?.id) : null };
}

catalogRoutes.get("/resources", async (c) => c.json(await search(c, "resources")));
catalogRoutes.get("/resources/:id", async (c) => {
  const r = await c.env.DB.prepare("SELECT * FROM resources WHERE id = ?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!r) throw notFound("Resource not found.");
  const auth = c.get("auth")!;
  const saved = await c.env.DB.prepare("SELECT 1 FROM saved_items WHERE user_id = ? AND tenant_id = ? AND item_type = 'resource' AND item_id = ?").bind(auth.userId, auth.tenantId, r.id).first();
  return c.json({ ...shapeResource(r), saved: !!saved });
});
catalogRoutes.get("/opportunities", async (c) => c.json(await search(c, "opportunities")));
catalogRoutes.get("/opportunities/:id", async (c) => {
  const r = await c.env.DB.prepare("SELECT * FROM opportunities WHERE id = ?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!r) throw notFound("Opportunity not found.");
  const auth = c.get("auth")!;
  const saved = await c.env.DB.prepare("SELECT 1 FROM saved_items WHERE user_id = ? AND tenant_id = ? AND item_type = 'opportunity' AND item_id = ?").bind(auth.userId, auth.tenantId, r.id).first();
  return c.json({ ...shapeOpportunity(r), saved: !!saved });
});

catalogRoutes.get("/saved", async (c) => {
  const auth = c.get("auth")!;
  const { results } = await c.env.DB
    .prepare(
      `SELECT s.id, s.item_type, s.item_id, s.created_at, COALESCE(r.title, o.title) AS title, COALESCE(r.verification_status, o.verification_status) AS verification_status
       FROM saved_items s LEFT JOIN resources r ON s.item_type = 'resource' AND r.id = s.item_id
       LEFT JOIN opportunities o ON s.item_type = 'opportunity' AND o.id = s.item_id
       WHERE s.user_id = ? AND s.tenant_id = ? ORDER BY s.created_at DESC LIMIT 100`,
    )
    .bind(auth.userId, auth.tenantId)
    .all();
  return c.json({ items: results ?? [] });
});

catalogRoutes.post("/saved/:type/:id", async (c) => {
  const auth = c.get("auth")!;
  const type = c.req.param("type");
  if (type !== "resource" && type !== "opportunity") throw badRequest("Unknown item type.");
  const table = type === "resource" ? "resources" : "opportunities";
  const exists = await c.env.DB.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).bind(c.req.param("id")).first();
  if (!exists) throw notFound();
  await c.env.DB.prepare("INSERT OR IGNORE INTO saved_items (id, tenant_id, user_id, item_type, item_id, created_at) VALUES (?,?,?,?,?,?)").bind(newId("sav"), auth.tenantId, auth.userId, type, c.req.param("id"), nowIso()).run();
  await logActivity(c.env.DB, auth, "user", "item_saved", type, c.req.param("id"));
  return c.json({ ok: true });
});
catalogRoutes.delete("/saved/:type/:id", async (c) => {
  const auth = c.get("auth")!;
  await c.env.DB.prepare("DELETE FROM saved_items WHERE user_id = ? AND tenant_id = ? AND item_type = ? AND item_id = ?").bind(auth.userId, auth.tenantId, c.req.param("type"), c.req.param("id")).run();
  return c.json({ ok: true });
});
