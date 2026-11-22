// ALSOS central policy engine. Every agent action and every external action passes through
// evaluate(). It FAILS CLOSED: anything unknown, missing or ambiguous is denied.
import type { PermissionLevel } from "../../shared/contracts";

export type PolicyAction =
  | "read_catalog"          // L0
  | "read_personal_context" // L0, requires consent personal_context_use + memory_enabled
  | "explain"               // L0
  | "draft_plan"            // L1
  | "suggest_next_steps"    // L1
  | "save_internal"         // L2, user-initiated only
  | "create_task"           // L2, user-initiated only
  | "prepare_external_action" // L2 (creates a pending approval; nothing leaves the system)
  | "execute_external_action" // L3, requires consent + matching, unexpired, approved approval
  | "use_ai_provider"       // L0/L1 data flow to an LLM provider; requires env + preference + consent
  | "autonomous_high_impact"; // L4, always denied

export const ACTION_LEVELS: Record<PolicyAction, PermissionLevel> = {
  read_catalog: "L0",
  read_personal_context: "L0",
  explain: "L0",
  draft_plan: "L1",
  suggest_next_steps: "L1",
  save_internal: "L2",
  create_task: "L2",
  prepare_external_action: "L2",
  execute_external_action: "L3",
  use_ai_provider: "L1",
  autonomous_high_impact: "L4",
};

const LEVEL_RANK: Record<PermissionLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };

export interface PolicySubject {
  actor: string; // agent id or 'user'
  agentMaxLevel?: PermissionLevel; // undefined for the user
  agentAllowedActions?: readonly PolicyAction[];
}

export interface PolicyContext {
  accountStatus: "active" | "paused" | "closed" | undefined;
  consents: Partial<Record<string, boolean>>;
  memoryEnabled?: boolean;
  aiEnabledEnv?: boolean;
  aiPreference?: boolean;
  userInitiated?: boolean;
  approval?: {
    status: string;
    expiresAt: string;
    payloadHash: string;
    userId: string;
  } | null;
  expectedPayloadHash?: string;
  requestUserId?: string;
  now?: Date;
}

export interface PolicyDecision {
  allowed: boolean;
  level: PermissionLevel;
  rule: string;
  reason: string;
}

const deny = (level: PermissionLevel, rule: string, reason: string): PolicyDecision => ({ allowed: false, level, rule, reason });
const allow = (level: PermissionLevel, rule: string, reason: string): PolicyDecision => ({ allowed: true, level, rule, reason });

export function evaluate(action: PolicyAction | string, subject: PolicySubject, ctx: PolicyContext): PolicyDecision {
  const level = (ACTION_LEVELS as Record<string, PermissionLevel | undefined>)[action];
  if (!level) return deny("L4", "unknown_action", "Unknown action — denied by default.");

  if (level === "L4") return deny("L4", "l4_prohibited", "Autonomous financial, medical, legal and employment decisions are prohibited.");

  if (ctx.accountStatus !== "active") {
    return deny(level, "account_not_active", "The account is paused or closed; agents and actions are stopped.");
  }

  // Agents are bounded by their own registry contract. The user is not an agent.
  if (subject.actor !== "user") {
    if (!subject.agentMaxLevel || !subject.agentAllowedActions) return deny(level, "agent_contract_missing", "Agent contract missing — denied.");
    if (!subject.agentAllowedActions.includes(action as PolicyAction)) return deny(level, "agent_action_not_allowed", `${subject.actor} is not permitted to ${action}.`);
    if (LEVEL_RANK[level] > LEVEL_RANK[subject.agentMaxLevel]) return deny(level, "agent_level_exceeded", `${subject.actor} is limited to ${subject.agentMaxLevel}.`);
  }

  switch (action as PolicyAction) {
    case "read_catalog":
    case "explain":
    case "draft_plan":
    case "suggest_next_steps":
      return allow(level, "baseline", "Information and planning have no side effects.");

    case "read_personal_context":
      if (ctx.memoryEnabled !== true) return deny(level, "memory_disabled", "Personal context use is turned off.");
      if (ctx.consents["personal_context_use"] !== true) return deny(level, "consent_missing", "No consent to use personal context.");
      return allow(level, "consented_context", "User consented to personal context use.");

    case "save_internal":
    case "create_task":
    case "prepare_external_action":
      if (ctx.userInitiated !== true) return deny(level, "l2_requires_user", "Saving or creating records requires the user's own action.");
      return allow(level, "user_initiated", "User-initiated internal change.");

    case "use_ai_provider":
      if (ctx.aiEnabledEnv !== true) return deny(level, "ai_disabled_platform", "AI providers are disabled on this deployment.");
      if (ctx.aiPreference !== true) return deny(level, "ai_disabled_user", "AI assistance is turned off in your settings.");
      if (ctx.consents["ai_assistance"] !== true) return deny(level, "consent_missing", "No consent for AI assistance.");
      return allow(level, "ai_consented", "AI assistance enabled and consented.");

    case "execute_external_action": {
      if (ctx.consents["external_actions"] !== true) return deny(level, "consent_missing", "External actions are not permitted in your consent settings.");
      const a = ctx.approval;
      if (!a) return deny(level, "approval_missing", "No approval on record for this action.");
      if (!ctx.requestUserId || a.userId !== ctx.requestUserId) return deny(level, "approval_owner_mismatch", "Approval belongs to someone else.");
      if (a.status !== "approved") return deny(level, "approval_not_approved", `Approval is ${a.status}.`);
      const now = ctx.now ?? new Date();
      if (!(Date.parse(a.expiresAt) > now.getTime())) return deny(level, "approval_expired", "Approval has expired.");
      if (!ctx.expectedPayloadHash || a.payloadHash !== ctx.expectedPayloadHash) return deny(level, "approval_payload_mismatch", "The action changed after it was approved.");
      return allow(level, "approved_action", "Specific, current approval matches this exact action.");
    }
    default:
      return deny("L4", "unhandled_action", "Unhandled action — denied by default.");
  }
}
