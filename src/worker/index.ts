import type { Env } from "./env";
import { createApp } from "./app";

const app = createApp();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname === "/api") return app.fetch(request, env, ctx);
    // Static SPA assets (also served directly by the assets layer before reaching the Worker).
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      const headers = new Headers(res.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      headers.set("X-Frame-Options", "DENY");
      return new Response(res.body, { status: res.status, headers });
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
