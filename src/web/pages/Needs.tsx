import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Need, type Page } from "../lib/api";
import { useI18n } from "../i18n";
import { AREAS, ConfirmDialog, Empty, ErrorState, Loading, PageHead, areaLabel, fieldErr, useLoad, useToast } from "../components/ui";
import { AgentResult, useAgent } from "../components/AgentPanel";

export function NeedsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [filter, setFilter] = useState<"active" | "resolved" | "all">("active");
  const { data, error, loading, reload } = useLoad(() => api.get<Page<Need>>("/needs?limit=100"));
  const [form, setForm] = useState({ title: "", description: "", area: "other", urgency: "normal" });
  const [err, setErr] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Need | null>(null);
  const [explore, setExplore] = useState("");
  const agent = useAgent();

  async function create(e?: FormEvent, override?: { title: string; area: string }) {
    e?.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const payload = override ? { title: override.title, area: override.area, urgency: "normal" } : { ...form, description: form.description || null };
      await api.post("/needs", payload);
      setForm({ title: "", description: "", area: "other", urgency: "normal" });
      toast("Need saved.");
      agent.setResult(null);
      reload();
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  }
  async function setStatus(n: Need, status: string) {
    await api.patch(`/needs/${n.id}`, { status }).then(() => { toast(status === "resolved" ? "Marked as resolved." : "Updated."); reload(); }).catch((e) => toast(e.message, "error"));
  }
  async function bump(n: Need, delta: number) {
    await api.patch(`/needs/${n.id}`, { priority: Math.max(0, n.priority + delta) }).then(reload).catch((e) => toast(e.message, "error"));
  }

  const items = (data?.items ?? []).filter((n) => filter === "all" || (filter === "active" ? ["open", "in_progress"].includes(n.status) : n.status === "resolved"));

  return (
    <div className="page">
      <PageHead title={t("needs_title")} lede={t("needs_lede")} />
      <div className="grid-2">
        <section className="panel" aria-labelledby="explore-h">
          <h2 id="explore-h" style={{ fontSize: "var(--step-1)" }}>Not sure how to put it?</h2>
          <p className="small muted">Describe what's going on. The Life Navigator suggests which areas it touches and a need you could save. Nothing is saved unless you choose to.</p>
          <form onSubmit={(e) => { e.preventDefault(); if (explore.trim()) void agent.run("life_navigator", explore.trim()); }}>
            <div className="field">
              <label htmlFor="explore">In your own words</label>
              <textarea id="explore" value={explore} maxLength={2000} onChange={(e) => setExplore(e.target.value)} placeholder="For example: my contract ends next month and I'm worried about rent." />
            </div>
            <button className="btn" type="submit" disabled={agent.busy || !explore.trim()}>{agent.busy ? "Thinking…" : "Help me sort this out"}</button>
          </form>
          {agent.result && <div style={{ marginTop: "var(--s-4)" }}><AgentResult r={agent.result} onSaveNeed={(title, area) => void create(undefined, { title, area })} /></div>}
        </section>
        <section className="panel" aria-labelledby="add-h">
          <h2 id="add-h" style={{ fontSize: "var(--step-1)" }}>Add a need</h2>
          <form onSubmit={create} noValidate>
            <div className="field">
              <label htmlFor="n-title">What do you need?</label>
              <input id="n-title" type="text" required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-invalid={!!fieldErr(err, "title")} />
              {fieldErr(err, "title") && <span className="err">{fieldErr(err, "title")}</span>}
            </div>
            <div className="field">
              <label htmlFor="n-desc">More detail (optional)</label>
              <textarea id="n-desc" maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="row">
              <div className="field grow"><label htmlFor="n-area">Area</label>
                <select id="n-area" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>{AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
              <div className="field grow"><label htmlFor="n-urg">How pressing?</label>
                <select id="n-urg" value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}><option value="low">Whenever</option><option value="normal">Soon</option><option value="high">Pressing</option></select></div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save need"}</button>
          </form>
        </section>
      </div>

      <section className="section" aria-labelledby="list-h">
        <div className="row between">
          <h2 id="list-h">Your list</h2>
          <div className="chips" role="group" aria-label="Filter">
            {(["active", "resolved", "all"] as const).map((f) => <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "active" ? "Open" : f === "resolved" ? "Resolved" : "All"}</button>)}
          </div>
        </div>
        {loading && !data && <Loading />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && items.length === 0 && <Empty title="No needs here">Add one above, or ask the Life Navigator to help you put it into words.</Empty>}
        <ul className="list">
          {items.map((n) => (
            <li key={n.id}>
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <div className="grow" style={{ minWidth: 220 }}>
                  <div className="list-title">{n.title}</div>
                  {n.description && <p className="small muted" style={{ margin: "4px 0 0" }}>{n.description}</p>}
                  <div className="row" style={{ marginTop: "var(--s-2)", gap: "var(--s-2)" }}>
                    <span className="badge">{areaLabel(n.area)}</span>
                    {n.urgency === "high" && <span className="badge badge-example">Pressing</span>}
                    <span className="badge badge-outline">{n.status.replace("_", " ")}</span>
                  </div>
                </div>
                <div className="row" style={{ gap: "var(--s-1)" }}>
                  <button className="btn btn-quiet btn-sm" onClick={() => void bump(n, 1)} aria-label={`Move ${n.title} up`}>Up</button>
                  <button className="btn btn-quiet btn-sm" onClick={() => void bump(n, -1)} aria-label={`Move ${n.title} down`}>Down</button>
                  <button className="btn btn-sm" onClick={() => nav(`/app/plans?need=${n.id}`)}>Make a plan</button>
                  <button className="btn btn-sm" onClick={() => nav(`/app/support?area=${n.area}`)}>Find support</button>
                  {n.status !== "resolved" ? <button className="btn btn-sm" onClick={() => void setStatus(n, "resolved")}>Resolved</button> : <button className="btn btn-sm" onClick={() => void setStatus(n, "open")}>Reopen</button>}
                  <button className="btn btn-danger btn-sm" onClick={() => setToDelete(n)}>{t("delete")}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <ConfirmDialog open={!!toDelete} title="Delete this need?" confirmLabel="Delete need" danger onClose={() => setToDelete(null)}
        onConfirm={async () => { if (!toDelete) return; await api.del(`/needs/${toDelete.id}`).catch((e) => toast(e.message, "error")); setToDelete(null); toast("Need deleted."); reload(); }}>
        <p>"{toDelete?.title}" will be removed. Plans linked to it stay, but lose the link. This can't be undone.</p>
      </ConfirmDialog>
    </div>
  );
}
