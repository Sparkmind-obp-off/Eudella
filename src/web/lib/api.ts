// Typed API client. Cookies carry the session (HttpOnly); the CSRF token is kept in memory only.
let csrfToken = "";
export const setCsrf = (t: string) => { csrfToken = t; };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

type Opts = { idempotencyKey?: string; signal?: AbortSignal };

async function request<T>(method: string, path: string, body?: unknown, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin", signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network", "We could not reach EUDELLA. Check your connection and try again.");
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
  if (!res.ok && !(res.status === 422 && data && "runId" in data)) {
    const err = data?.error ?? {};
    if (res.status === 401) window.dispatchEvent(new CustomEvent("eudella:unauthenticated"));
    throw new ApiError(res.status, err.code ?? "error", err.message ?? "Something went wrong. Please try again.", err.fields);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string, o?: Opts) => request<T>("GET", p, undefined, o),
  post: <T>(p: string, b?: unknown, o?: Opts) => request<T>("POST", p, b ?? {}, o),
  patch: <T>(p: string, b: unknown) => request<T>("PATCH", p, b),
  del: <T>(p: string) => request<T>("DELETE", p),
};

export const newIdempotencyKey = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

// ---------- shared response types ----------
export interface SessionInfo { authenticated: boolean; csrfToken?: string; user?: { email: string; status: "active" | "paused" | "closed"; onboardingCompleted: boolean; displayName: string; locale: "en" | "id" } }
export interface Page<T> { items: T[]; nextCursor: string | null }
export interface Need { id: string; title: string; description: string | null; area: string; urgency: string; status: string; priority: number; created_at: string }
export interface ContextItem { id: string; category: string; label: string; value: string; sensitivity: "normal" | "sensitive"; updated_at: string }
export interface Task { id: string; title: string; notes: string | null; status: "todo" | "doing" | "done" | "skipped"; plan_id: string | null; due_date: string | null; position: number; created_at: string }
export interface Plan { id: string; title: string; summary: string | null; status: string; origin: string; need_id: string | null; goal_id: string | null; created_at: string; updated_at: string; progress?: { total: number; done: number }; tasks?: Task[] }
export interface Goal { id: string; title: string; description: string | null; success_definition: string | null; target_date: string | null; status: string; need_id: string | null; created_at: string }
export interface CatalogItem {
  id: string; title: string; summary: string; description: string; verificationStatus: "verified" | "unverified" | "example"; verifiedAt: string | null;
  eligibility: string | null; cost: string | null; costVerified: boolean; location: string | null; isOnline: boolean; url: string | null;
  source: { name: string; url: string | null }; tags: string[]; saved?: boolean;
  area?: string; category?: string; providerName?: string; accessibility?: string | null; region?: string | null;
  kind?: string; organization?: string; deadline?: string | null; limitations?: string | null;
}
export interface Approval { id: string; actionType: string; title: string; destination: string; dataShared: string; cost: string; reversible: boolean; payload: { subject: string; body: string; shared: Array<{ label: string; value: string }> }; payloadHash: string; status: string; requestedBy: string; createdAt: string; expiresAt: string; decidedAt: string | null; executedAt: string | null; result: { reference?: string; note?: string; error?: string } | null }
export interface Activity { id: string; actor: string; action: string; entity_type: string | null; entity_id: string | null; detail: string | null; created_at: string }
export interface Notification { id: string; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string }
export interface AgentRunResult {
  runId: string; agent: string; status: "completed" | "blocked" | "failed"; notice?: string; error?: string; safetyFlags: string[]; usedPersonalContext: boolean; aiUsed: boolean;
  policy: { allowed: boolean; level: string; rule: string; reason: string };
  output?: { summary: string; areas?: string[]; suggestedNeed?: { title: string; area: string }; steps?: string[]; items?: Array<{ id: string; type: "resource" | "opportunity"; title: string; summary: string; verification: string; reason: string }>; tips?: string[]; limitations: string[] };
}
