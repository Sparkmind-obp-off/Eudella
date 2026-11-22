// ALSOS agent registry. Agents are deterministic services with explicit contracts.
// None of them can write user records, contact anyone, or raise their own permission level:
// outputs are proposals the user can accept (L2 saves happen only through user-initiated API calls).
import type { NeedArea, PermissionLevel } from "../../shared/contracts";
import type { PolicyAction } from "./policy";
import { sanitizeRetrieved } from "./safety";
import { catalogSearchAdapter, type CatalogRow } from "./providers/adapters";
import { invokeWithPolicy } from "./providers/registry";

export type AgentId =
  | "life_navigator" | "support_discovery" | "planning" | "opportunity_discovery"
  | "wellbeing_guide" | "safety_guardian" | "action_coordinator";

export interface AgentInput {
  message: string;
  area?: NeedArea;
  context: Array<{ label: string; value: string; category: string }>; // empty unless policy allowed it
  needTitle?: string;
  goalTitle?: string;
  successDefinition?: string;
}

export interface AgentOutput {
  summary: string;
  areas?: NeedArea[];
  suggestedAgents?: AgentId[];
  suggestedNeed?: { title: string; area: NeedArea };
  steps?: string[];
  items?: Array<{ id: string; type: "resource" | "opportunity"; title: string; summary: string; verification: string; reason: string }>;
  tips?: string[];
  limitations: string[];
}

export interface AgentDeps {
  db: D1Database;
  onEvent: (type: string, detail: string) => Promise<void>;
}

export interface AgentContract {
  id: AgentId;
  name: string;
  responsibility: string;
  inputContract: string;
  outputContract: string;
  maxLevel: PermissionLevel;
  allowedActions: readonly PolicyAction[];
  usesPersonalContext: boolean;
  timeoutMs: number;
  maxRetries: number;
  userInvocable: boolean;
  run?: (input: AgentInput, deps: AgentDeps) => Promise<AgentOutput>;
}

const AREA_KEYWORDS: Record<NeedArea, string[]> = {
  work: ["job", "work", "career", "employ", "cv", "resume", "interview", "kerja", "pekerjaan", "karier", "lamaran"],
  learning: ["learn", "course", "study", "skill", "school", "degree", "belajar", "kursus", "sekolah", "kuliah", "language"],
  money: ["money", "budget", "debt", "bill", "save", "saving", "income", "uang", "hutang", "utang", "tagihan", "anggaran"],
  housing: ["house", "housing", "rent", "home", "landlord", "tenancy", "rumah", "sewa", "kos", "kontrakan"],
  health: ["health", "doctor", "clinic", "counsel", "therapy", "medical", "kesehatan", "dokter", "klinik"],
  wellbeing: ["stress", "lonely", "tired", "anxious", "overwhelmed", "wellbeing", "sleep", "burnout", "lelah", "cemas", "kesepian"],
  family: ["family", "child", "kids", "parent", "childcare", "care", "keluarga", "anak", "orang tua"],
  community: ["community", "volunteer", "friends", "neighbour", "neighbor", "komunitas", "relawan"],
  business: ["business", "startup", "shop", "enterprise", "grant", "usaha", "bisnis", "umkm", "modal"],
  other: [],
};

export function classifyAreas(text: string): NeedArea[] {
  const t = text.toLowerCase();
  const scored = (Object.keys(AREA_KEYWORDS) as NeedArea[])
    .map((area) => ({ area, score: AREA_KEYWORDS[area].filter((k) => t.includes(k)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.length ? scored.map((s) => s.area).slice(0, 3) : ["other"];
}

export function extractTerms(text: string): string[] {
  const stop = new Set(["the", "and", "for", "with", "that", "this", "have", "want", "need", "help", "how", "what", "can", "yang", "dan", "untuk", "saya", "ingin", "mau", "butuh", "bantuan", "about", "from", "into", "some", "more", "find", "get"]);
  return [...new Set(text.toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/).filter((w) => w.length >= 3 && !stop.has(w)))].slice(0, 8);
}

const PLAN_TEMPLATES: Record<NeedArea, string[]> = {
  work: ["Write down the kinds of work you want and what matters most to you (hours, location, pay range you need)", "Update your CV with recent experience", "Pick two or three roles or organisations to look into this week", "Prepare and review one application before sending it yourself", "Note what you learned and adjust your next step"],
  learning: ["Describe what you want to be able to do after learning", "Shortlist two or three options and check cost, time and language with each provider", "Choose one option and block regular time for it", "Review progress after two weeks"],
  money: ["List monthly income and essential costs", "Identify one cost you could reduce or one question for a qualified adviser", "Look up free, independent money guidance (check it is genuinely independent)", "Set a date to review your budget"],
  housing: ["Write down the housing problem and any key dates (notice, payment, contract end)", "Gather your documents (agreement, receipts, messages)", "Find an information or advice service for your area and check it applies to you", "Decide your next step after getting advice"],
  health: ["Write down what you want to ask a qualified professional", "Find a licensed provider or service you can access", "Book or ask about an appointment yourself", "Keep notes from the conversation"],
  wellbeing: ["Notice what has been weighing on you this week", "Choose one small thing that usually helps you (a walk, rest, talking to someone)", "Find a peer or community group if connection would help", "If things feel heavy, reach out to a trusted person or qualified professional"],
  family: ["Write down what your family needs right now", "List people or services who could help", "Check options, costs and availability directly with providers", "Agree on next steps with the people involved"],
  community: ["Think about what kind of connection or contribution you want", "Look at two or three local groups or volunteering roles", "Contact one to ask how to get involved", "Reflect after your first visit"],
  business: ["Describe your business idea in two sentences", "Write down who it is for and what they would pay for", "Look for general small-business guidance (not legal or tax advice)", "Choose one small test you can run this month"],
  other: ["Describe the situation in your own words", "Decide what a good outcome would look like for you", "List one small first step", "Review after a week and adjust"],
};

const WELLBEING_TIPS = [
  "Small routines — regular sleep, meals and a little movement — often make difficult weeks easier.",
  "Talking with someone you trust can help you see options more clearly.",
  "It is fine to take one step at a time; you decide the pace.",
  "EUDELLA offers general, non-clinical support. For health concerns, a qualified professional can help.",
];

async function searchCatalog(deps: AgentDeps, table: "resources" | "opportunities", input: AgentInput, extra: { area?: string; kind?: string }): Promise<CatalogRow[]> {
  const terms = extractTerms(input.message);
  const r = await invokeWithPolicy(catalogSearchAdapter, { db: deps.db, table, terms, limit: 6, ...extra }, { timeoutMs: 3000, maxRetries: 2, onEvent: deps.onEvent });
  let rows = r.data;
  if (rows.length === 0 && (extra.area || extra.kind)) {
    const r2 = await invokeWithPolicy(catalogSearchAdapter, { db: deps.db, table, terms: [], limit: 6, ...extra }, { timeoutMs: 3000, maxRetries: 2, onEvent: deps.onEvent });
    rows = r2.data;
  }
  return rows;
}

const VERIFICATION_LIMITATION = "Listings marked 'Example' or 'Unverified' are not confirmed facts. Check cost, eligibility and availability directly with the provider.";

export const AGENTS: Record<AgentId, AgentContract> = {
  life_navigator: {
    id: "life_navigator",
    name: "Life Navigator",
    responsibility: "Understands the user's stated needs and helps organise priorities.",
    inputContract: "Free-text message (≤2000 chars); optional personal context if consented.",
    outputContract: "Detected life areas, a suggested need to save, suggested next agents. No writes.",
    maxLevel: "L1",
    allowedActions: ["explain", "suggest_next_steps", "read_personal_context"],
    usesPersonalContext: true,
    timeoutMs: 3000,
    maxRetries: 0,
    userInvocable: true,
    async run(input) {
      const areas = input.area ? [input.area] : classifyAreas(input.message);
      const primary = areas[0] ?? "other";
      const suggestedAgents: AgentId[] = ["support_discovery", "planning"];
      if (["work", "learning", "business", "community"].includes(primary)) suggestedAgents.splice(1, 0, "opportunity_discovery");
      if (["wellbeing", "health"].includes(primary)) suggestedAgents.unshift("wellbeing_guide");
      const firstSentence = input.message.split(/[.!?\n]/)[0]?.trim().slice(0, 120) || "My need";
      return {
        summary: `It sounds like this is mainly about ${areas.join(", ")}. You can save it as a need, look for support, or turn it into a plan — you decide what comes first.`,
        areas,
        suggestedAgents,
        suggestedNeed: { title: firstSentence, area: primary },
        steps: ["Save this as a need so you can come back to it", "Explore support and opportunities related to it", "Turn it into a small, editable plan"],
        limitations: ["This is a keyword-based summary, not a judgement about your situation. Edit anything that does not fit."],
      };
    },
  },
  support_discovery: {
    id: "support_discovery",
    name: "Support Discovery Agent",
    responsibility: "Finds relevant resources, services and support options in the catalog.",
    inputContract: "Free-text message; optional area.",
    outputContract: "Up to 6 catalog resources with verification status and match reason.",
    maxLevel: "L0",
    allowedActions: ["read_catalog", "explain"],
    usesPersonalContext: false,
    timeoutMs: 5000,
    maxRetries: 0,
    userInvocable: true,
    async run(input, deps) {
      const area = input.area ?? classifyAreas(input.message)[0];
      const rows = await searchCatalog(deps, "resources", input, { area: area === "other" ? undefined : area });
      return {
        summary: rows.length ? `Found ${rows.length} resource${rows.length === 1 ? "" : "s"} that may be relevant.` : "No matching resources in the catalog yet. Try different words or browse by area.",
        items: rows.map((r) => ({ id: r.id, type: "resource" as const, title: sanitizeRetrieved(r.title), summary: sanitizeRetrieved(String(r.summary)), verification: String(r.verification_status), reason: `Matches area "${String(r.area)}"` })),
        limitations: [VERIFICATION_LIMITATION],
      };
    },
  },
  opportunity_discovery: {
    id: "opportunity_discovery",
    name: "Opportunity Discovery Agent",
    responsibility: "Identifies relevant educational, professional and business opportunities.",
    inputContract: "Free-text message; optional area.",
    outputContract: "Up to 6 opportunities with evidence and limitations.",
    maxLevel: "L0",
    allowedActions: ["read_catalog", "explain"],
    usesPersonalContext: false,
    timeoutMs: 5000,
    maxRetries: 0,
    userInvocable: true,
    async run(input, deps) {
      const area = input.area ?? classifyAreas(input.message)[0];
      const kindMap: Partial<Record<NeedArea, string>> = { learning: "education", work: "work", business: "business", community: "community" };
      const rows = await searchCatalog(deps, "opportunities", input, { kind: area ? kindMap[area] : undefined });
      return {
        summary: rows.length ? `Found ${rows.length} opportunit${rows.length === 1 ? "y" : "ies"} worth a look.` : "No matching opportunities yet.",
        items: rows.map((r) => ({ id: r.id, type: "opportunity" as const, title: sanitizeRetrieved(r.title), summary: sanitizeRetrieved(String(r.summary)), verification: String(r.verification_status), reason: String(r.limitations ?? "Check details with the organisation.") })),
        limitations: [VERIFICATION_LIMITATION, "EUDELLA does not apply, enrol or accept offers on your behalf."],
      };
    },
  },
  planning: {
    id: "planning",
    name: "Planning Agent",
    responsibility: "Converts user-approved goals into editable plan drafts.",
    inputContract: "Goal or need title; optional success definition.",
    outputContract: "A draft plan (title + steps). Never saved automatically.",
    maxLevel: "L1",
    allowedActions: ["draft_plan", "suggest_next_steps", "explain", "read_personal_context"],
    usesPersonalContext: true,
    timeoutMs: 3000,
    maxRetries: 0,
    userInvocable: true,
    async run(input) {
      const area = input.area ?? classifyAreas(`${input.goalTitle ?? ""} ${input.needTitle ?? ""} ${input.message}`)[0] ?? "other";
      const steps = [...PLAN_TEMPLATES[area]];
      if (input.successDefinition) steps.push(`Check progress against your own definition of success: "${input.successDefinition.slice(0, 140)}"`);
      const title = input.goalTitle ?? input.needTitle ?? (input.message.split(/[.!?\n]/)[0]?.slice(0, 100) || "My plan");
      return {
        summary: `Here is a draft plan for "${title}". Edit, reorder or remove any step before saving — nothing is saved until you choose to.`,
        areas: [area],
        steps,
        limitations: ["A general template, not professional advice. Your circumstances may need different steps."],
      };
    },
  },
  wellbeing_guide: {
    id: "wellbeing_guide",
    name: "Wellbeing Guide",
    responsibility: "Provides non-clinical, general wellbeing support and routes to qualified help.",
    inputContract: "Free-text message.",
    outputContract: "General tips and wellbeing/community resources. Never diagnoses or advises treatment.",
    maxLevel: "L0",
    allowedActions: ["read_catalog", "explain"],
    usesPersonalContext: false,
    timeoutMs: 5000,
    maxRetries: 0,
    userInvocable: true,
    async run(input, deps) {
      const rows = await searchCatalog(deps, "resources", { ...input, message: "" }, { area: "wellbeing" });
      return {
        summary: "Here are some general ideas and places to find support. This is not clinical advice.",
        tips: WELLBEING_TIPS,
        items: rows.map((r) => ({ id: r.id, type: "resource" as const, title: r.title, summary: String(r.summary), verification: String(r.verification_status), reason: "Wellbeing and community support" })),
        limitations: ["Non-clinical general information only.", VERIFICATION_LIMITATION],
      };
    },
  },
  safety_guardian: {
    id: "safety_guardian",
    name: "Safety Guardian",
    responsibility: "Enforces safety, privacy, permission boundaries and policy restrictions on every run.",
    inputContract: "Every agent input and every external action request.",
    outputContract: "Flags (prompt_injection, crisis, high_impact_request, sensitive_data), block decision, safe notice.",
    maxLevel: "L0",
    allowedActions: ["explain"],
    usesPersonalContext: false,
    timeoutMs: 1000,
    maxRetries: 0,
    userInvocable: false,
  },
  action_coordinator: {
    id: "action_coordinator",
    name: "Action Coordinator",
    responsibility: "Prepares external actions for review and executes them only after specific approval.",
    inputContract: "User-initiated action request; approval id + payload hash for execution.",
    outputContract: "Pending approval record; execution receipt with provenance.",
    maxLevel: "L3",
    allowedActions: ["prepare_external_action", "execute_external_action"],
    usesPersonalContext: false,
    timeoutMs: 5000,
    maxRetries: 1,
    userInvocable: false,
  },
};

export function publicAgentList() {
  return Object.values(AGENTS).map(({ run: _run, ...c }) => c);
}
