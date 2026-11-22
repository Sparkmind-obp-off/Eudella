import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, type ContextItem, type Page } from "../lib/api";
import { useI18n } from "../i18n";
import { ConfirmDialog, Empty, ErrorState, Loading, PageHead, fieldErr, fmtDate, useLoad, useToast } from "../components/ui";

const CATS = [["situation", "My situation"], ["household", "Household"], ["work", "Work"], ["education", "Education"], ["health_general", "Health (general)"], ["finance_general", "Money (general)"], ["location", "Location"], ["other", "Other"]] as const;
const catLabel = (c: string) => CATS.find(([v]) => v === c)?.[1] ?? c;

export function ContextPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.get<Page<ContextItem>>("/context?limit=100"));
  const { data: consent } = useLoad(() => api.get<{ current: Record<string, boolean> }>("/consents"));
  const empty = { category: "situation", label: "", value: "", sensitivity: "normal" as "normal" | "sensitive" };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [toDelete, setToDelete] = useState<ContextItem | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      if (editing) await api.patch(`/context/${editing}`, form);
      else await api.post("/context", form);
      toast(editing ? "Corrected." : "Added.");
      setForm(empty);
      setEditing(null);
      reload();
    } catch (e2) { setErr(e2); }
  }

  return (
    <div className="page">
      <PageHead title={t("context_title")} lede={t("context_lede")} />
      <div className="notice" style={{ marginBottom: "var(--s-5)" }}>
        <p>{consent?.current.personal_context_use
          ? <>Agents may use items marked <em>normal</em> to tailor suggestions. Items marked <em>sensitive</em> are never given to agents. <Link to="/app/privacy">Change</Link></>
          : <>Agents currently <strong>cannot</strong> use anything here — it's only stored for you. <Link to="/app/privacy">Change in Privacy & consent</Link></>}</p>
      </div>
      <div className="grid-2">
        <section aria-labelledby="ctx-list">
          <h2 id="ctx-list" className="sr-only">Your items</h2>
          {loading && !data && <Loading />}
          {error && <ErrorState error={error} onRetry={reload} />}
          {data && data.items.length === 0 && <Empty title="Nothing stored">Add only what you're comfortable with. EUDELLA never fills this in by guessing.</Empty>}
          <ul className="list">
            {data?.items.map((c) => (
              <li key={c.id}>
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div className="grow">
                    <div className="small muted">{catLabel(c.category)}{c.sensitivity === "sensitive" && <span className="badge badge-danger" style={{ marginLeft: 8 }}>Sensitive — never shared with agents</span>}</div>
                    <div className="list-title">{c.label}</div>
                    <div>{c.value}</div>
                    <div className="small muted">Updated {fmtDate(c.updated_at)}</div>
                  </div>
                  <div className="row" style={{ gap: "var(--s-1)" }}>
                    <button className="btn btn-sm" onClick={() => { setEditing(c.id); setForm({ category: c.category, label: c.label, value: c.value, sensitivity: c.sensitivity }); document.getElementById("c-label")?.focus(); }}>Correct</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setToDelete(c)}>{t("delete")}</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel" aria-labelledby="ctx-form">
          <h2 id="ctx-form" style={{ fontSize: "var(--step-1)" }}>{editing ? "Correct an item" : "Add something about you"}</h2>
          <form onSubmit={submit} noValidate>
            <div className="field"><label htmlFor="c-cat">Category</label>
              <select id="c-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="c-label">Label</label>
              <input id="c-label" type="text" maxLength={80} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Languages I speak" aria-invalid={!!fieldErr(err, "label")} />
              {fieldErr(err, "label") && <span className="err">{fieldErr(err, "label")}</span>}</div>
            <div className="field"><label htmlFor="c-val">Detail</label>
              <textarea id="c-val" maxLength={1000} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} aria-invalid={!!fieldErr(err, "value")} />
              {fieldErr(err, "value") && <span className="err">{fieldErr(err, "value")}</span>}</div>
            <label className="check" style={{ marginBottom: "var(--s-4)" }}>
              <input type="checkbox" checked={form.sensitivity === "sensitive"} onChange={(e) => setForm({ ...form, sensitivity: e.target.checked ? "sensitive" : "normal" })} />
              <span>This is sensitive — keep it for me only, never pass it to agents.</span>
            </label>
            <div className="row">
              <button className="btn btn-primary" type="submit">{editing ? "Save correction" : "Add"}</button>
              {editing && <button className="btn" type="button" onClick={() => { setEditing(null); setForm(empty); }}>{t("cancel")}</button>}
            </div>
          </form>
        </section>
      </div>
      <ConfirmDialog open={!!toDelete} title="Delete this item?" confirmLabel="Delete" danger onClose={() => setToDelete(null)}
        onConfirm={async () => { if (!toDelete) return; await api.del(`/context/${toDelete.id}`).catch((e) => toast(e.message, "error")); setToDelete(null); toast("Deleted."); reload(); }}>
        <p>"{toDelete?.label}" will be permanently removed from EUDELLA.</p>
      </ConfirmDialog>
    </div>
  );
}
