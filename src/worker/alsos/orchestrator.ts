// ALSOS orchestrator: Safety Guardian → policy engine → agent → output validation → execution log.
import type { AuthContext, Env } from "../env";
import { AGENTS, type AgentId, type AgentOutput } from "./agents";
import { evaluate, type PolicyDecision } from "./policy";
import { assessInput, redact } from "./safety";
import { getConsents, getPreferences, logActivity } from "../services/core";
import { newId, nowIso } from "../lib/util";
import { forbidden, notFound } from "../lib/errors";
import type { NeedArea } from "../../shared/contracts";

export interface RunRequest {
  agent: AgentId;
  message: string;
  needId?: string | null;
  goalId?: string | null;
}

export interface RunResult {
  runId: string;
  agent: AgentId;
  status: "completed" | "blocked" | "failed";
  output?: AgentOutput;
  notice?: string;
  safetyFlags: string[];
  policy: PolicyDecision;
  usedPersonalContext: boolean;
  aiUsed: false;
  error?: string;
}

class RunLogger {
  private seq = 0;
  constructor(private db: D1Database, private runId: string, private tenantId: string) {}
  async event(type: string, detail: string) {
    this.seq++;
    await this.db
      .prepare("INSERT INTO agent_events (id, run_id, tenant_id, seq, type, detail, created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(newId("evt"), this.runId, this.tenantId, this.seq, type, redact(detail).slice(0, 1000), nowIso())
      .run();
  }
}

function validateOutput(o: AgentOutput): AgentOutput {
  // Output contract: bounded sizes, strings only, no personal identifiers leak back into logs.
  return {
    summary: String(o.summary).slice(0, 1000),
    areas: o.areas?.slice(0, 5),
    suggestedAgents: o.suggestedAgents?.slice(0, 5),
    suggestedNeed: o.suggestedNeed ? { title: String(o.suggestedNeed.title).slice(0, 160), area: o.suggestedNeed.area } : undefined,
    steps: o.steps?.slice(0, 20).map((s) => String(s).slice(0, 300)),
    items: o.items?.slice(0, 10),
    tips: o.tips?.slice(0, 10),
    limitations: (o.limitations ?? []).slice(0, 5),
  };
}

export async function runAgent(env: Env, auth: AuthContext, req: RunRequest): Promise<RunResult> {
  const db = env.DB;
  const contract = AGENTS[req.agent];
  if (!contract || !contract.userInvocable || !contract.run) throw forbidden("That agent cannot be run directly.", "agent_not_invocable");

  const runId = newId("run");
  const startedAt = nowIso();
  const safety = assessInput(req.message);
  await db
    .prepare("INSERT INTO agent_runs (id, tenant_id, user_id, agent, intent, permission_level, status, input_redacted, started_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(runId, auth.tenantId, auth.userId, contract.id, "user_request", contract.maxLevel, "running", redact(req.message).slice(0, 2000), startedAt)
    .run();
  const log = new RunLogger(db, runId, auth.tenantId);
  await log.event("safety_check", `flags=${safety.flags.join(",") || "none"}`);

  const finish = async (status: RunResult["status"], decision: PolicyDecision, output?: AgentOutput, error?: string) => {
    await db
      .prepare("UPDATE agent_runs SET status = ?, output_json = ?, policy_decision = ?, adapter = ?, error = ?, finished_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(status, output ? JSON.stringify(output) : null, JSON.stringify(decision), "local.catalog_search", error ?? null, nowIso(), runId, auth.tenantId)
      .run();
    await logActivity(db, auth, contract.id, `agent_run_${status}`, "agent_run", runId, error ?? decision.rule);
  };

  const consents = await getConsents(db, auth);
  const prefs = await getPreferences(db, auth);
  const subject = { actor: contract.id, agentMaxLevel: contract.maxLevel, agentAllowedActions: contract.allowedActions };
  const baseCtx = { accountStatus: auth.status, consents, memoryEnabled: prefs.memoryEnabled, aiEnabledEnv: env.AI_ENABLED === "true", aiPreference: prefs.aiAssistanceEnabled };

  const primaryAction = contract.allowedActions.includes("draft_plan") ? "draft_plan" : contract.allowedActions.includes("read_catalog") ? "read_catalog" : "explain";
  const decision = evaluate(primaryAction, subject, baseCtx);
  await log.event("policy_check", `${primaryAction}: ${decision.allowed ? "allow" : "deny"} (${decision.rule})`);

  if (safety.blocked) {
    const blockedDecision: PolicyDecision = { allowed: false, level: contract.maxLevel, rule: "safety_guardian_block", reason: safety.reason ?? "Blocked by Safety Guardian" };
    await log.event("safety_flag", `blocked: ${safety.flags.join(",")}`);
    await finish("blocked", blockedDecision, undefined, "safety_block");
    return { runId, agent: contract.id, status: "blocked", notice: safety.reason, safetyFlags: safety.flags, policy: blockedDecision, usedPersonalContext: false, aiUsed: false };
  }
  if (!decision.allowed) {
    await finish("blocked", decision, undefined, decision.rule);
    return { runId, agent: contract.id, status: "blocked", notice: decision.reason, safetyFlags: safety.flags, policy: decision, usedPersonalContext: false, aiUsed: false };
  }

  // Personal context is included only when the policy engine allows it for this agent.
  let context: Array<{ label: string; value: string; category: string }> = [];
  let usedPersonalContext = false;
  if (contract.usesPersonalContext) {
    const ctxDecision = evaluate("read_personal_context", subject, baseCtx);
    await log.event("policy_check", `read_personal_context: ${ctxDecision.allowed ? "allow" : "deny"} (${ctxDecision.rule})`);
    if (ctxDecision.allowed) {
      const { results } = await db
        .prepare("SELECT label, value, category FROM personal_context WHERE tenant_id = ? AND user_id = ? AND sensitivity = 'normal' ORDER BY updated_at DESC LIMIT 20")
        .bind(auth.tenantId, auth.userId)
        .all<{ label: string; value: string; category: string }>();
      context = results ?? [];
      usedPersonalContext = context.length > 0;
    }
  }

  // AI provider path: evaluated and logged, but the MVP never calls an external model.
  const aiDecision = evaluate("use_ai_provider", { actor: "user" }, baseCtx);
  await log.event("policy_check", `use_ai_provider: ${aiDecision.allowed ? "allow" : "deny"} (${aiDecision.rule}); deterministic adapter used`);

  let needTitle: string | undefined;
  let goalTitle: string | undefined;
  let successDefinition: string | undefined;
  let area: NeedArea | undefined;
  if (req.needId) {
    const n = await db.prepare("SELECT title, area FROM needs WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(req.needId, auth.tenantId, auth.userId).first<{ title: string; area: NeedArea }>();
    if (!n) throw notFound("Need not found.");
    needTitle = n.title;
    area = n.area;
  }
  if (req.goalId) {
    const g = await db.prepare("SELECT title, success_definition FROM goals WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(req.goalId, auth.tenantId, auth.userId).first<{ title: string; success_definition: string | null }>();
    if (!g) throw notFound("Goal not found.");
    goalTitle = g.title;
    successDefinition = g.success_definition ?? undefined;
  }

  try {
    const raw = await Promise.race([
      contract.run({ message: req.message, area, context, needTitle, goalTitle, successDefinition }, { db, onEvent: (t, d) => log.event(t, d) }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("agent_timeout")), contract.timeoutMs)),
    ]);
    const output = validateOutput(raw);
    await log.event("output", `items=${output.items?.length ?? 0} steps=${output.steps?.length ?? 0}`);
    await finish("completed", decision, output);
    return { runId, agent: contract.id, status: "completed", output, notice: safety.notice, safetyFlags: safety.flags, policy: decision, usedPersonalContext, aiUsed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    await log.event("error", message);
    await finish("failed", decision, undefined, message);
    return {
      runId, agent: contract.id, status: "failed", safetyFlags: safety.flags, policy: decision, usedPersonalContext, aiUsed: false,
      error: "This step could not be completed right now. Nothing was changed. Please try again shortly.",
    };
  }
}
