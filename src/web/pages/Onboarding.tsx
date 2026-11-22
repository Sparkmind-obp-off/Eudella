import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { AREAS, Mark, useToast } from "../components/ui";

export function Onboarding() {
  const { session, refresh } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [areas, setAreas] = useState<string[]>([]);
  const [need, setNeed] = useState("");
  const [region, setRegion] = useState("");
  const [consents, setConsents] = useState({ personal_context_use: false, external_actions: false });

  async function finish() {
    setBusy(true);
    try {
      if (region.trim()) await api.patch("/profile", { region: region.trim() });
      for (const [scope, granted] of Object.entries(consents)) if (granted) await api.post("/consents", { scope, granted: true });
      if (need.trim()) await api.post("/needs", { title: need.trim().slice(0, 160), area: areas[0] ?? "other" });
      for (const a of areas.slice(0, 3)) await api.post("/context", { category: "other", label: "Area I want support with", value: AREAS.find((x) => x.value === a)?.label ?? a });
      await api.post("/onboarding/complete");
      await refresh();
      nav("/app", { replace: true });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    <section key="0" aria-labelledby="s0">
      <h1 id="s0">Welcome, {session?.user?.displayName}.</h1>
      <p className="muted">A few optional questions to set up your space. Skip anything — you can change it all later.</p>
      <h2 style={{ fontSize: "var(--step-1)", marginTop: "var(--s-6)" }}>Which parts of life would you like support with?</h2>
      <div className="chips" role="group" aria-label="Life areas">
        {AREAS.map((a) => (
          <button key={a.value} type="button" className="chip" aria-pressed={areas.includes(a.value)} onClick={() => setAreas((x) => (x.includes(a.value) ? x.filter((y) => y !== a.value) : [...x, a.value]))}>{a.label}</button>
        ))}
      </div>
    </section>,
    <section key="1" aria-labelledby="s1">
      <h1 id="s1">What's on your mind?</h1>
      <p className="muted">One sentence is plenty. This becomes your first need — only you can see it.</p>
      <div className="field">
        <label htmlFor="need">Something you'd like help with (optional)</label>
        <textarea id="need" value={need} maxLength={160} onChange={(e) => setNeed(e.target.value)} placeholder="For example: I want to find steadier work near home." />
      </div>
      <div className="field">
        <label htmlFor="region">Where are you based? (optional)</label>
        <input id="region" type="text" value={region} maxLength={80} onChange={(e) => setRegion(e.target.value)} placeholder="City or region" />
        <span className="hint">Used only to show location information on listings. Never shared.</span>
      </div>
    </section>,
    <section key="2" aria-labelledby="s2">
      <h1 id="s2">You decide what EUDELLA may do.</h1>
      <p className="muted">Everything starts switched off. Turn on only what you're comfortable with — you can change this any time in Privacy & consent.</p>
      <div className="panel">
        <label className="switch">
          <span><strong>Use what I tell EUDELLA to tailor suggestions</strong><br /><span className="small muted">Planning and the Life Navigator may read your "About me" items (not those marked sensitive).</span></span>
          <input type="checkbox" role="switch" checked={consents.personal_context_use} onChange={(e) => setConsents({ ...consents, personal_context_use: e.target.checked })} />
        </label>
        <label className="switch">
          <span><strong>Allow external actions — each one still needs my approval</strong><br /><span className="small muted">Like sending a message. In this preview, actions are simulated and nothing is actually sent.</span></span>
          <input type="checkbox" role="switch" checked={consents.external_actions} onChange={(e) => setConsents({ ...consents, external_actions: e.target.checked })} />
        </label>
        <div className="switch">
          <span><strong>AI assistance</strong><br /><span className="small muted">Not available yet. No personal data is sent to AI providers.</span></span>
          <input type="checkbox" role="switch" disabled checked={false} aria-label="AI assistance (not available)" readOnly />
        </div>
      </div>
    </section>,
  ];

  return (
    <main className="onb" id="main">
      <div className="row" style={{ marginBottom: "var(--s-6)" }}><Mark size={34} color="var(--forest)" /><span className="brand-word" style={{ color: "var(--deep-forest)" }}>EUDELLA</span></div>
      <div className="onb-steps" aria-hidden="true">{steps.map((_, i) => <span key={i} data-on={i <= step} />)}</div>
      <p className="small muted">Step {step + 1} of {steps.length}</p>
      {steps[step]}
      <div className="row between" style={{ marginTop: "var(--s-6)" }}>
        <button className="btn" onClick={() => (step === 0 ? void finish() : setStep(step - 1))} disabled={busy}>{step === 0 ? "Skip setup" : "Back"}</button>
        {step < steps.length - 1
          ? <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Continue</button>
          : <button className="btn btn-primary" onClick={() => void finish()} disabled={busy}>{busy ? "Setting up…" : "Open my space"}</button>}
      </div>
    </main>
  );
}
