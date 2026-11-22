export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  APP_ENV: string;
  AI_ENABLED: string;
  SESSION_TTL_HOURS: string;
  ALLOWED_ORIGINS: string;
  /** Server-only secret used to salt deletion-audit hashes. Set with `wrangler secret put AUDIT_SALT`. */
  AUDIT_SALT?: string;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  sessionId: string;
  csrfToken: string;
  status: "active" | "paused" | "closed";
}

export type AppBindings = { Bindings: Env; Variables: { auth?: AuthContext; requestId: string } };
