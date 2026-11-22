import { Hono } from "hono";
import type { AppBindings } from "./env";
import { HttpError } from "./lib/errors";
import { requestId, securityHeaders, requireAuth, csrf, blockWhenPaused, rateLimit } from "./lib/middleware";
import { authRoutes } from "./routes/auth";
import { personalRoutes } from "./routes/personal";
import { catalogRoutes } from "./routes/catalog";
import { alsosRoutes } from "./routes/alsos";
import { governanceRoutes, accountControlRoutes } from "./routes/governance";
import { registerDefaultProviders } from "./alsos/providers/adapters";

registerDefaultProviders();

export function createApp() {
  const app = new Hono<AppBindings>().basePath("/api");
  app.use("*", requestId, securityHeaders);

  app.get("/health", async (c) => {
    let db: "ok" | "error";
    let migrations: number | null = null;
    try {
      const r = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM resources").first<{ n: number }>();
      db = r ? "ok" : "error";
      const m = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM d1_migrations").first<{ n: number }>().catch(() => null);
      migrations = m?.n ?? null;
    } catch {
      db = "error";
    }
    return c.json({ status: db === "ok" ? "ok" : "degraded", service: "eudella-api", env: c.env.APP_ENV, database: db, migrationsApplied: migrations, aiEnabled: c.env.AI_ENABLED === "true", time: new Date().toISOString() }, db === "ok" ? 200 : 503);
  });

  app.route("/auth", authRoutes);

  // Everything below requires a session; tenant/user come only from the session.
  const authed = new Hono<AppBindings>();
  authed.use("*", requireAuth, csrf, rateLimit("api", 300, 60));
  authed.route("/", accountControlRoutes); // usable while paused
  const active = new Hono<AppBindings>();
  active.use("*", blockWhenPaused);
  active.route("/", personalRoutes);
  active.route("/catalog", catalogRoutes);
  active.route("/alsos", alsosRoutes);
  active.route("/", governanceRoutes);
  authed.route("/", active);
  app.route("/", authed);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found." } }, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } }, err.status as 400);
    }
    // Safe error response: no stack traces or internals leave the server.
    console.error("unhandled", c.get("requestId"), err instanceof Error ? err.message : err);
    return c.json({ error: { code: "internal", message: "Something went wrong on our side. Nothing was changed. Please try again." } }, 500);
  });
  return app;
}
