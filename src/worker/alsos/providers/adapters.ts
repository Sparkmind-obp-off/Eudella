// Deterministic MVP adapters.
import { registerProvider, ProviderError, type ProviderAdapter } from "./registry";

export interface CatalogSearchInput {
  db: D1Database;
  table: "resources" | "opportunities";
  terms: string[];
  area?: string;
  kind?: string;
  limit: number;
}
export type CatalogRow = Record<string, unknown> & { id: string; title: string };

export const catalogSearchAdapter: ProviderAdapter<CatalogSearchInput, CatalogRow[]> = {
  descriptor: {
    id: "local.catalog_search",
    name: "EUDELLA catalog search (local D1)",
    category: "search",
    kind: "local",
    capabilities: ["search_resources", "search_opportunities"],
    scopes: ["catalog:read"],
    requiredLevel: "L0",
    auth: "none",
    rateLimitPerMinute: 120,
    costModel: "free_local",
    dataLeavesPlatform: false,
    status: "active",
    description: "Keyword search over the EUDELLA catalog stored in D1. No personal data is sent anywhere.",
  },
  async invoke(input) {
    const clauses: string[] = [];
    const binds: unknown[] = [];
    if (input.table === "resources" && input.area) {
      clauses.push("area = ?");
      binds.push(input.area);
    }
    if (input.table === "opportunities" && input.kind) {
      clauses.push("kind = ?");
      binds.push(input.kind);
    }
    const terms = input.terms.filter((t) => t.length >= 3).slice(0, 6);
    if (terms.length) {
      clauses.push(`(${terms.map(() => "(lower(title) LIKE ? OR lower(summary) LIKE ? OR lower(tags) LIKE ?)").join(" OR ")})`);
      for (const t of terms) binds.push(`%${t}%`, `%${t}%`, `%${t}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const { results } = await input.db
      .prepare(`SELECT * FROM ${input.table} ${where} ORDER BY title LIMIT ?`)
      .bind(...binds, input.limit)
      .all<CatalogRow>();
    return { data: results ?? [], provenance: { provider: "local.catalog_search", kind: "local", simulated: false, at: new Date().toISOString() }, costUnits: 0 };
  },
};

export interface MessageInput {
  destination: string;
  subject: string;
  body: string;
}
export interface MessageOutput {
  simulated: true;
  reference: string;
  note: string;
}

/** Mock messaging adapter: records a simulated delivery. NOTHING is sent outside EUDELLA. */
export const mockMessagingAdapter: ProviderAdapter<MessageInput, MessageOutput> = {
  descriptor: {
    id: "mock.messaging",
    name: "Simulated messaging (no real delivery)",
    category: "messaging",
    kind: "mock",
    capabilities: ["send_message", "contact_third_party", "share_data", "book_service"],
    scopes: ["messaging:send"],
    requiredLevel: "L3",
    auth: "none",
    rateLimitPerMinute: 10,
    costModel: "simulated",
    dataLeavesPlatform: false,
    status: "active",
    description: "Demonstrates the approval → execution path. It produces a deterministic simulated receipt and never contacts anyone.",
  },
  async invoke(input) {
    if (!input.destination.trim()) throw new ProviderError("mock.messaging", "destination required", false);
    const enc = new TextEncoder().encode(`${input.destination}|${input.subject}|${input.body}`);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc));
    const reference = `SIM-${Array.from(digest.slice(0, 6), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    return {
      data: { simulated: true, reference, note: "Simulated only: no message was delivered. A real provider has not been connected." },
      provenance: { provider: "mock.messaging", kind: "mock", simulated: true, at: new Date().toISOString() },
      costUnits: 0,
    };
  },
};

/** Placeholder LLM adapter. Disabled: no provider, data handling, cost or consent has been approved. */
export const disabledLlmAdapter: ProviderAdapter<{ prompt: string }, string> = {
  descriptor: {
    id: "llm.none",
    name: "Language model (not configured)",
    category: "llm",
    kind: "external",
    capabilities: ["generate_text"],
    scopes: ["llm:generate"],
    requiredLevel: "L1",
    auth: "api_key",
    secretBinding: "LLM_API_KEY",
    rateLimitPerMinute: 0,
    costModel: "metered",
    dataLeavesPlatform: true,
    status: "disabled",
    disabledReason: "AI is off by default. No provider, data-handling terms, cost or user consent has been approved.",
    description: "Reserved slot for an optional, user-consented language model provider.",
  },
  async invoke() {
    throw new ProviderError("llm.none", "LLM provider disabled", false);
  },
};

const DISABLED_CATEGORIES: Array<[string, string, import("./registry").ProviderCategory]> = [
  ["maps.none", "Maps (not configured)", "maps"],
  ["calendar.none", "Calendar (not configured)", "calendar"],
  ["email.none", "Email delivery (not configured)", "email"],
  ["payments.none", "Payments (not configured — L4 autonomous payments prohibited)", "payments"],
  ["storage.none", "File storage (R2 not approved)", "file_storage"],
  ["speech.none", "Speech (not configured)", "speech"],
];

let registered = false;
export function registerDefaultProviders(): void {
  if (registered) return;
  registered = true;
  registerProvider(catalogSearchAdapter);
  registerProvider(mockMessagingAdapter);
  registerProvider(disabledLlmAdapter);
  for (const [id, name, category] of DISABLED_CATEGORIES) {
    registerProvider({
      descriptor: {
        id, name, category, kind: "external", capabilities: [], scopes: [], requiredLevel: "L3", auth: "oauth",
        rateLimitPerMinute: 0, costModel: "metered", dataLeavesPlatform: true, status: "disabled",
        disabledReason: "Not connected. Requires explicit approval of provider, cost and data handling.",
        description: "Future provider slot.",
      },
      async invoke() {
        throw new ProviderError(id, "disabled", false);
      },
    });
  }
}
