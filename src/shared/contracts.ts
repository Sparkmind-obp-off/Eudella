// Typed, validated API contracts shared by the Worker and the web client.
import { z } from "zod";

export const PERMISSION_LEVELS = ["L0", "L1", "L2", "L3", "L4"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const NEED_AREAS = ["work", "learning", "money", "housing", "health", "wellbeing", "family", "community", "business", "other"] as const;
export type NeedArea = (typeof NEED_AREAS)[number];

export const CONTEXT_CATEGORIES = ["situation", "household", "work", "education", "health_general", "finance_general", "location", "other"] as const;

export const CONSENT_SCOPES = ["personal_context_use", "ai_assistance", "resource_personalization", "external_actions", "product_updates"] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).optional().nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional().nullable();

export const SignupInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(10, "At least 10 characters").max(200),
  displayName: text(80),
  locale: z.enum(["en", "id"]).default("en"),
  acceptTerms: z.literal(true, { error: "You must accept the terms to continue" }),
});
export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1).max(200),
});

export const ProfileUpdate = z.object({
  displayName: text(80).optional(),
  locale: z.enum(["en", "id"]).optional(),
  region: optText(80),
  pronouns: optText(40),
  bio: optText(500),
});

export const PreferencesUpdate = z.object({
  memoryEnabled: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
});

export const NotificationPrefsUpdate = z.object({
  inApp: z.boolean().optional(),
  approvals: z.boolean().optional(),
  taskReminders: z.boolean().optional(),
  productUpdates: z.boolean().optional(),
});

export const ContextInput = z.object({
  category: z.enum(CONTEXT_CATEGORIES),
  label: text(80),
  value: text(1000),
  sensitivity: z.enum(["normal", "sensitive"]).default("normal"),
});
export const ContextUpdate = ContextInput.partial();

export const NeedInput = z.object({
  title: text(160),
  description: optText(2000),
  area: z.enum(NEED_AREAS),
  urgency: z.enum(["low", "normal", "high"]).default("normal"),
});
export const NeedUpdate = NeedInput.partial().extend({
  status: z.enum(["open", "in_progress", "resolved", "archived"]).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

export const GoalInput = z.object({
  title: text(160),
  description: optText(2000),
  successDefinition: optText(1000),
  targetDate: isoDate,
  needId: z.string().max(64).optional().nullable(),
});
export const GoalUpdate = GoalInput.partial().extend({
  status: z.enum(["active", "paused", "achieved", "archived"]).optional(),
});

export const PlanInput = z.object({
  title: text(160),
  summary: optText(2000),
  goalId: z.string().max(64).optional().nullable(),
  needId: z.string().max(64).optional().nullable(),
  tasks: z.array(text(200)).max(30).optional(),
});
export const PlanUpdate = z.object({
  title: text(160).optional(),
  summary: optText(2000),
  status: z.enum(["draft", "active", "completed", "archived"]).optional(),
});

export const TaskInput = z.object({
  title: text(200),
  notes: optText(2000),
  planId: z.string().max(64).optional().nullable(),
  dueDate: isoDate,
  resourceId: z.string().max(64).optional().nullable(),
});
export const TaskUpdate = z.object({
  title: text(200).optional(),
  notes: optText(2000),
  status: z.enum(["todo", "doing", "done", "skipped"]).optional(),
  position: z.number().int().min(0).max(10000).optional(),
  dueDate: isoDate,
});

export const ConsentUpdate = z.object({
  scope: z.enum(CONSENT_SCOPES),
  granted: z.boolean(),
});

export const EXTERNAL_ACTION_TYPES = ["send_message", "share_data", "contact_third_party", "book_service", "make_purchase", "initiate_payment", "change_external_account", "publish_content"] as const;
export type ExternalActionType = (typeof EXTERNAL_ACTION_TYPES)[number];

export const ActionRequestInput = z.object({
  actionType: z.enum(EXTERNAL_ACTION_TYPES),
  destination: text(200),
  subject: text(200),
  body: text(4000),
  shareContextIds: z.array(z.string().max(64)).max(20).default([]),
  relatedResourceId: z.string().max(64).optional().nullable(),
});

export const ApprovalDecision = z.object({
  decision: z.enum(["approve", "reject"]),
  // The client must echo the payload hash it showed the user: approval binds to exactly that content.
  payloadHash: z.string().length(64),
});

export const AgentRunInput = z.object({
  agent: z.enum(["life_navigator", "support_discovery", "planning", "opportunity_discovery", "wellbeing_guide"]),
  message: text(2000),
  needId: z.string().max(64).optional().nullable(),
  goalId: z.string().max(64).optional().nullable(),
});

export const DeleteAccountInput = z.object({
  password: z.string().min(1).max(200),
  confirm: z.literal("DELETE"),
  reason: optText(500),
});
export const PauseAccountInput = z.object({ paused: z.boolean() });

export const SearchQuery = z.object({
  q: z.string().trim().max(120).optional(),
  area: z.enum(NEED_AREAS).optional(),
  kind: z.enum(["education", "work", "business", "program", "community"]).optional(),
  online: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});

export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
});

export type ApiError = { error: { code: string; message: string; fields?: Record<string, string> } };
