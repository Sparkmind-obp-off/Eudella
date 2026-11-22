import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type AgentRunResult } from "../lib/api";
import { VerificationBadge, useToast } from "./ui";

const AGENT_NAMES: Record<string, string> = {
  life_navigator: "Life Navigator", support_discovery: "Support Discovery", planning: "Planning Agent",
  opportunity_discovery: "Opportunity Discovery", wellbeing_guide: "Wellbeing Guide",
};

/** Shows one ALSOS agent run: what it did, under which permission level, and its limits. */
export function AgentResult({ r, onSaveNeed, onSavePlan }: { r: AgentRunResult; onSaveNeed?: (title: string, area: string) => void; onSavePlan?: (steps: string[]) => void }) {
  return (
    <div className="agent-card" aria-live="polite">
      <div className="agent-meta">
        <span className="badge">{AGENT_NAMES[r.agent] ?? r.agent}</span>
        <span className="badge badge-outline">Permission {r.policy.level}</span>
        <span className="badge badge-outline">{r.aiUsed ? "AI used" : "Deterministic — no AI"}</span>
        {r.usedPersonalContext && <span className="badge badge-outline">Used your "About me" (with consent)</span>}
      </div>
      {r.notice && <div className={`notice ${r.safetyFlags.includes("crisis") ? "notice-safety" : ""}`} style={{ marginBottom: "var(--s-4)" }}><p>{r.notice}</p></div>}
      {r.status === "blocked" && <p><strong>Not run.</strong> {r.policy.reason}</p>}
      {r.status === "failed" && <p role="alert"><strong>Couldn't finish.</strong> {r.error}</p>}
      {r.output && (
        <>
          <p>{r.output.summary}</p>
          {r.output.steps && r.output.steps.length > 0 && (
            <>
              <ol className="steps">{r.output.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              {onSavePlan && <button className="btn btn-primary btn-sm" onClick={() => onSavePlan(r.output!.steps!)}>Review and save as a plan</button>}
            </>
          )}
          {r.output.suggestedNeed && onSaveNeed && (
            <button className="btn btn-primary btn-sm" onClick={() => onSaveNeed(r.output!.suggestedNeed!.title, r.output!.suggestedNeed!.area)}>Save as a need</button>
          )}
          {r.output.tips && <ul>{r.output.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
          {r.output.items && r.output.items.length > 0 && (
            <ul className="list">{r.output.items.map((it) => (
              <li key={it.id}>
                <Link className="list-link" to={`/app/${it.type === "resource" ? "support" : "opportunities"}/${it.id}`}>
                  <div className="row between"><span className="list-title">{it.title}</span><VerificationBadge status={it.verification} /></div>
                  <span className="small muted">{it.summary}</span>
                </Link>
              </li>
            ))}</ul>
          )}
          {r.output.limitations.length > 0 && <p className="small muted" style={{ marginTop: "var(--s-3)" }}>{r.output.limitations.join(" ")}</p>}
        </>
      )}
      <p className="small muted" style={{ margin: 0 }}>Run recorded in your <Link to="/app/activity">activity history</Link>.</p>
    </div>
  );
}

export function useAgent() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  async function run(agent: string, message: string, extra: Record<string, string | undefined> = {}) {
    setBusy(true);
    try {
      const r = await api.post<AgentRunResult>("/alsos/agents/run", { agent, message, ...extra });
      setResult(r);
      return r;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Something went wrong.", "error");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, result, run, setResult };
}
