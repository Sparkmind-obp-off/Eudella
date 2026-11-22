// Safety Guardian — deterministic checks applied before and after every agent run.
// It never sees more than the current request, and its findings are logged (redacted).

export type SafetyFlag = "prompt_injection" | "crisis" | "high_impact_request" | "sensitive_data";

export interface SafetyAssessment {
  flags: SafetyFlag[];
  blocked: boolean;
  reason?: string;
  /** Safe, non-clinical routing information to show the user (e.g. emergency numbers notice). */
  notice?: string;
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any )?(previous|prior|above|earlier) (instructions|rules|prompts?)/i,
  /disregard (the |all |your )?(system|previous|safety) (prompt|instructions|rules)/i,
  /\b(you are now|act as|pretend to be) (an? )?(admin|administrator|root|developer mode|dan)\b/i,
  /\b(system prompt|developer message|hidden instructions)\b/i,
  /\bbypass (the )?(policy|policies|approval|safety|guardrails?)\b/i,
  /\b(grant|give|escalate) (me |yourself )?(admin|l3|l4|full) (access|permission|rights)\b/i,
  /\b(approve|execute|send) (it|this|the action) without (asking|approval|confirmation)\b/i,
  /\b(tenant_id|user_id)\s*[:=]/i,
  /<\s*\/?\s*(system|assistant|tool)\s*>/i,
];

const CRISIS_PATTERNS: RegExp[] = [
  /\b(kill|hurt|harm) (myself|me)\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend (my|it all) life\b/i,
  /\bwant to die\b/i,
  /\b(bunuh diri|ingin mati|menyakiti diri)\b/i,
  /\b(emergency|darurat)\b/i,
  /\b(being abused|in danger|unsafe at home)\b/i,
];

const HIGH_IMPACT_PATTERNS: RegExp[] = [
  /\b(invest|transfer|wire|pay|send money|buy (stocks?|crypto)|take (out )?a loan)\b/i,
  /\b(diagnos(e|is)|prescri(be|ption)|what (medication|dose))\b/i,
  /\b(file (a )?(lawsuit|claim)|sign (the )?contract|legal filing)\b/i,
  /\b(quit my job|resign for me|accept the (job )?offer for me|reject the (job )?offer for me)\b/i,
];

export const CRISIS_NOTICE =
  "EUDELLA is not an emergency service. If you or someone else may be in immediate danger, contact local emergency services now (for example 112 in Indonesia and across the EU). You can also reach a trusted person or a qualified professional.";

export const HIGH_IMPACT_NOTICE =
  "EUDELLA does not make financial, medical, legal or employment decisions for you. It can help you organise questions and find qualified professionals; the decision stays with you.";

export function assessInput(text: string): SafetyAssessment {
  const flags: SafetyFlag[] = [];
  if (INJECTION_PATTERNS.some((p) => p.test(text))) flags.push("prompt_injection");
  if (CRISIS_PATTERNS.some((p) => p.test(text))) flags.push("crisis");
  if (HIGH_IMPACT_PATTERNS.some((p) => p.test(text))) flags.push("high_impact_request");
  if (containsSensitiveData(text)) flags.push("sensitive_data");

  if (flags.includes("prompt_injection")) {
    return {
      flags,
      blocked: true,
      reason: "The request contained instructions that try to change how EUDELLA's safety rules work, so it was not run.",
    };
  }
  if (flags.includes("crisis")) return { flags, blocked: false, notice: CRISIS_NOTICE };
  if (flags.includes("high_impact_request")) return { flags, blocked: false, notice: HIGH_IMPACT_NOTICE };
  return { flags, blocked: false };
}

/** Treat any retrieved/catalog text as data: strip instruction-like content before it reaches output. */
export function sanitizeRetrieved(text: string): string {
  let out = text;
  for (const p of INJECTION_PATTERNS) out = out.replace(new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g"), "[removed]");
  return out;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
const NIK = /\b\d{16}\b/g; // Indonesian national ID number shape

export function containsSensitiveData(text: string): boolean {
  return [EMAIL, PHONE, CARD, NIK].some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/** Redact personal identifiers before anything is written to logs or agent_runs. */
export function redact(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(NIK, "[id-number]")
    .replace(CARD, "[number]")
    .replace(PHONE, "[phone]");
}
