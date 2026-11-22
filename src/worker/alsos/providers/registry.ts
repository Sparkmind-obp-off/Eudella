// Provider registry with standardized adapters. The MVP ships only deterministic local/mock
// adapters. No external network calls, no paid APIs, no secrets required.
import type { PermissionLevel } from "../../../shared/contracts";

export type ProviderCategory =
  | "search" | "maps" | "calendar" | "email" | "messaging" | "identity" | "payments"
  | "file_storage" | "llm" | "speech" | "media_generation" | "external_tools";

export interface ProviderDescriptor {
  id: string;
  name: string;
  category: ProviderCategory;
  kind: "local" | "mock" | "external";
  capabilities: string[];
  scopes: string[];
  requiredLevel: PermissionLevel;
  auth: "none" | "api_key" | "oauth";
  /** Name of the server-only secret binding; never exposed to clients. */
  secretBinding?: string;
  rateLimitPerMinute: number;
  costModel: "free_local" | "simulated" | "metered";
  dataLeavesPlatform: boolean;
  status: "active" | "disabled";
  disabledReason?: string;
  description: string;
}

export interface AdapterResult<T> {
  data: T;
  provenance: { provider: string; kind: ProviderDescriptor["kind"]; simulated: boolean; at: string };
  costUnits: number;
}

export interface ProviderAdapter<I = unknown, O = unknown> {
  descriptor: ProviderDescriptor;
  invoke(input: I): Promise<AdapterResult<O>>;
}

export class ProviderError extends Error {
  constructor(public provider: string, message: string, public retryable = true) {
    super(message);
  }
}

const registry = new Map<string, ProviderAdapter<unknown, unknown>>();

export function registerProvider<I, O>(adapter: ProviderAdapter<I, O>): void {
  registry.set(adapter.descriptor.id, adapter as ProviderAdapter<unknown, unknown>);
}

export function getProvider<I, O>(id: string): ProviderAdapter<I, O> {
  const p = registry.get(id);
  if (!p) throw new ProviderError(id, `Provider ${id} is not registered`, false);
  if (p.descriptor.status !== "active") throw new ProviderError(id, `Provider ${id} is disabled: ${p.descriptor.disabledReason ?? "not configured"}`, false);
  return p as ProviderAdapter<I, O>;
}

export function listProviders(): ProviderDescriptor[] {
  return [...registry.values()].map((p) => p.descriptor);
}

/** Test hook: replace an adapter (used to simulate provider failures). */
export function overrideProvider<I, O>(adapter: ProviderAdapter<I, O>): () => void {
  const prev = registry.get(adapter.descriptor.id);
  registry.set(adapter.descriptor.id, adapter as ProviderAdapter<unknown, unknown>);
  return () => {
    if (prev) registry.set(prev.descriptor.id, prev);
    else registry.delete(adapter.descriptor.id);
  };
}

/** Invoke with a timeout and bounded retries (exponential backoff). Logs via callback. */
export async function invokeWithPolicy<I, O>(
  adapter: ProviderAdapter<I, O>,
  input: I,
  opts: { timeoutMs: number; maxRetries: number; onEvent?: (type: string, detail: string) => Promise<void> | void },
): Promise<AdapterResult<O>> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= opts.maxRetries) {
    try {
      const result = await Promise.race([
        adapter.invoke(input),
        new Promise<never>((_, reject) => setTimeout(() => reject(new ProviderError(adapter.descriptor.id, "timeout")), opts.timeoutMs)),
      ]);
      await opts.onEvent?.("adapter_call", `${adapter.descriptor.id} ok (attempt ${attempt + 1})`);
      return result;
    } catch (err) {
      lastErr = err;
      const retryable = !(err instanceof ProviderError) || err.retryable;
      await opts.onEvent?.("adapter_error", `${adapter.descriptor.id} failed (attempt ${attempt + 1}): ${err instanceof Error ? err.message : "error"}`);
      if (!retryable || attempt === opts.maxRetries) break;
      await new Promise((r) => setTimeout(r, Math.min(50 * 2 ** attempt, 400)));
      await opts.onEvent?.("retry", `${adapter.descriptor.id} retry ${attempt + 1}`);
      attempt++;
    }
  }
  throw lastErr instanceof Error ? lastErr : new ProviderError(adapter.descriptor.id, "failed");
}
