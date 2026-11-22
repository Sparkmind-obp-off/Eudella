// Test harness: real Cloudflare D1 semantics via Miniflare (wrangler getPlatformProxy),
// a fresh in-memory database per test file, migrations + synthetic seed applied.
import { getPlatformProxy } from "wrangler";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/worker/app";
import type { Env } from "../src/worker/env";

export const ORIGIN = "http://127.0.0.1:8787";

function splitSql(sql: string): string[] {
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function setup(overrides: Partial<Env> = {}) {
  const proxy = await getPlatformProxy<Env>({ configPath: "wrangler.jsonc", persist: false });
  const db = proxy.env.DB;
  for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of splitSql(readFileSync(join("migrations", f), "utf8"))) await db.prepare(stmt).run();
  }
  for (const stmt of splitSql(readFileSync("seed/seed.sql", "utf8"))) await db.prepare(stmt).run();
  const env = { ...proxy.env, ASSETS: undefined, ...overrides } as Env;
  const app = createApp();
  const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
  const call = (req: Request) => app.fetch(req, env, ctx) as Promise<Response>;
  return { env, db, call, dispose: () => proxy.dispose() };
}

export type Call = (req: Request) => Promise<Response>;

/** A minimal cookie-jar client acting like a browser on ORIGIN. */
export class Client {
  cookie = "";
  csrf = "";
  ip: string;
  constructor(private call: Call, ip?: string) {
    this.ip = ip ?? `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  }
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
    const h: Record<string, string> = { Origin: ORIGIN, "CF-Connecting-IP": this.ip, ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    if (this.csrf && method !== "GET") h["X-CSRF-Token"] = this.csrf;
    if (body !== undefined) h["Content-Type"] = "application/json";
    const res = await this.call(new Request(`${ORIGIN}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }));
    const set = res.headers.get("Set-Cookie");
    if (set) {
      const m = /eud_session=([^;]*)/.exec(set);
      if (m) this.cookie = m[1] ? `eud_session=${m[1]}` : "";
    }
    return res;
  }
  async json<T = Record<string, unknown>>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; data: T; res: Response }> {
    const res = await this.req(method, path, body, headers);
    const data = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, data, res };
  }
  async signup(email: string, password = "correct-horse-battery", displayName = "Test Person") {
    const r = await this.json<{ csrfToken: string }>("POST", "/api/auth/signup", { email, password, displayName, locale: "en", acceptTerms: true });
    if (r.status !== 201) throw new Error(`signup failed ${r.status} ${JSON.stringify(r.data)}`);
    this.csrf = r.data.csrfToken;
    return r;
  }
  async login(email: string, password = "correct-horse-battery") {
    const r = await this.json<{ csrfToken: string }>("POST", "/api/auth/login", { email, password });
    if (r.status === 200) this.csrf = r.data.csrfToken;
    return r;
  }
}

let n = 0;
export const uniqueEmail = (tag: string) => `${tag}.${Date.now()}.${n++}@example.test`;
