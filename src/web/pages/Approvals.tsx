import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, newIdempotencyKey, type Approval, type ContextItem, type Page } from "../lib/api";
import { useI18n } from "../i18n";
import { ConfirmDialog, Empty, ErrorState, Loading, PageHead, fieldErr, fmtDate, useLoad, useToast } from "../components/ui";

const TYPES = [["send_message", "Send a message"], ["contact_third_party", "Contact a third party"], ["share_data", "Share selected information"], ["book_service", "Request a booking"]] as const;
const STATUS_LABEL: Record<string, string> = { pending: "Waiting for you", approved: "Approved — not yet carried out", rejected: "Declined", cancelled: "Cancelled", executed: "Done (simulated)", failed: "Failed — nothing sent", expired: "Expired" };

export function ApprovalsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useLoad(() => api.get<Page<Approval>>("/approvals?limit=100"));
  const { data: consent, reload: reloadConsent } = useLoad(() => api.get<{ current: Record<string, boolean> }>("/consents"));
  const { data: ctx } = useLoad(() => api.get<Page<ContextItem>>("/context?limit=100"));
  const composing = params.get("compose") === "1";
  const [form, setForm] = useState({ actionType: "send_message", destination: params.get("destination") ?? "", subject: "", body: "", shareContextIds: [] as string[] });
  const [err, setErr] = useState<unknown>(null);
  const [review, setReview] = useState<Approval | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api.post("/actions", { ...form, relatedResourceId: params.get("related") }, { idempotencyKey: newIdempotencyKey() });
      toast("Request created. Review it below — nothing has been sent.");
      setParams({}, { replace: true });
      setForm({ actionType: "send_message", destination: "", subject: "", body: "", shareContextIds: [] });
      reload();
    } catch (e2) { setErr(e2); }
  }
  async function decide(a: Approval, decision: "approve" | "reject") {
    setBusy(true);
    try {
      const r = await api.post<{ status: string; executed?: boolean; blockedReason?: string; error?: string; result?: { reference: string } }>(`/approvals/${a.id}/decision`, { decision, payloadHash: a.payloadHash }, { idempotencyKey: newIdempotencyKey() });
      if (decision === "reject") toast("Declined. Nothing was sent.");
      else if (r.executed) toast(`Approved and recorded (simulated, ref ${r.result?.reference}).`);
      else if (r.blockedReason) toast(`Approved, but not carried out: ${r.blockedReason}`, "error");
      else if (r.error) toast(r.error, "error");
      setReview(null);
      reload();
    } catch (e) { toast(e instanceof ApiError ? e.message : "Something went wrong.", "error"); setReview(null); reload(); }
    finally { setBusy(false); }
  }
  async function cancel(a: Approval) {
    await api.post(`/approvals/${a.id}/cancel`).then(() => { toast("Cancelled."); reload(); }).catch((e) => toast(e.message, "error"));
  }
  async function execute(a: Approval) {
    const r = await api.post<{ executed: boolean; blockedReason?: string }>(`/approvals/${a.id}/execute`, {}, { idempotencyKey: newIdempotencyKey() }).catch((e) => { toast(e.message, "error"); return null; });
    if (r) toast(r.executed ? "Carried out (simulated)." : `Still blocked: ${r.blockedReason}`, r.executed ? "ok" : "error");
    reload();
  }

  const pending = data?.items.filter((a) => a.status === "pending") ?? [];
  const others = data?.items.filter((a) => a.status !== "pending") ?? [];
  const extOk = consent?.current.external_actions;

  return (
    <div className="page">
      <PageHead title={t("approvals_title")} lede={t("approvals_lede")} actions={!composing && <button className="btn btn-primary" onClick={() => setParams({ compose: "1" })}>Draft an action</button>} />
      <div className={`notice ${extOk ? "notice-ok" : ""}`} style={{ marginBottom: "var(--s-5)" }}>
        <p>{extOk
          ? <>External actions are allowed, and each one still needs your approval here. In this preview, delivery is <strong>simulated</strong>: no real message leaves EUDELLA.</>
          : <>External actions are <strong>switched off</strong> in your consent settings. You can still draft and approve requests, but they won't be carried out until you allow external actions in <Link to="/app/privacy">Privacy & consent</Link>.</>}</p>
      </div>
      {composing && (
        <section className="panel" style={{ marginBottom: "var(--s-6)" }} aria-labelledby="compose-h">
          <h2 id="compose-h" style={{ fontSize: "var(--step-1)" }}>Draft an action for review</h2>
          <form onSubmit={create} noValidate>
            <div className="row">
              <div className="field grow"><label htmlFor="a-type">Action</label>
                <select id="a-type" value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div className="field grow"><label htmlFor="a-dest">To</label>
                <input id="a-dest" type="text" maxLength={200} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} aria-invalid={!!fieldErr(err, "destination")} />
                {fieldErr(err, "destination") && <span className="err">{fieldErr(err, "destination")}</span>}</div>
            </div>
            <div className="field"><label htmlFor="a-subj">Subject</label>
              <input id="a-subj" type="text" maxLength={200} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} aria-invalid={!!fieldErr(err, "subject")} />
              {fieldErr(err, "subject") && <span className="err">{fieldErr(err, "subject")}</span>}</div>
            <div className="field"><label htmlFor="a-body">Message</label>
              <textarea id="a-body" maxLength={4000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} aria-invalid={!!fieldErr(err, "body")} />
              {fieldErr(err, "body") && <span className="err">{fieldErr(err, "body")}</span>}</div>
            {(ctx?.items.length ?? 0) > 0 && (
              <fieldset className="field" style={{ border: 0, padding: 0 }}>
                <legend className="label">Include information about you (optional)</legend>
                {ctx!.items.map((c) => (
                  <label key={c.id} className="check"><input type="checkbox" checked={form.shareContextIds.includes(c.id)} onChange={(e) => setForm({ ...form, shareContextIds: e.target.checked ? [...form.shareContextIds, c.id] : form.shareContextIds.filter((x) => x !== c.id) })} /><span>{c.label}: {c.value}</span></label>
                ))}
              </fieldset>
            )}
            {err instanceof ApiError && !err.fields && <p className="err" role="alert">{err.message}</p>}
            <div className="row"><button className="btn btn-primary" type="submit">Create request</button><button className="btn" type="button" onClick={() => setParams({}, { replace: true })}>{t("cancel")}</button></div>
          </form>
        </section>
      )}
      {loading && !data && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      <section aria-labelledby="pend-h">
        <h2 id="pend-h">Waiting for you</h2>
        {data && pending.length === 0 && <Empty title="Nothing waiting">When you or an agent prepares an action, it waits here until you decide.</Empty>}
        <ul className="list">{pending.map((a) => (
          <li key={a.id}>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div className="grow"><div className="list-title">{a.title}</div><span className="small muted">To {a.destination} · expires {fmtDate(a.expiresAt, true)}</span></div>
              <div className="row" style={{ gap: "var(--s-1)" }}>
                <button className="btn btn-primary btn-sm" onClick={() => setReview(a)}>Review</button>
                <button className="btn btn-sm" onClick={() => void decide(a, "reject")}>Decline</button>
              </div>
            </div>
          </li>
        ))}</ul>
      </section>
      <section className="section" aria-labelledby="hist-h">
        <h2 id="hist-h">History</h2>
        {data && others.length === 0 && <p className="muted">No decisions yet.</p>}
        <ul className="list">{others.map((a) => (
          <li key={a.id}>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div className="grow">
                <div className="list-title">{a.title}</div>
                <span className="small muted">To {a.destination} · {fmtDate(a.decidedAt ?? a.createdAt, true)}</span>
                {a.result?.reference && <div className="small">Reference {a.result.reference} — {a.result.note}</div>}
              </div>
              <div className="row" style={{ gap: "var(--s-1)" }}>
                <span className={`badge ${a.status === "executed" ? "badge-verified" : a.status === "failed" ? "badge-danger" : "badge-outline"}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
                {a.status === "approved" && <><button className="btn btn-sm" onClick={() => void execute(a)}>Carry out now</button><button className="btn btn-sm" onClick={() => void cancel(a)}>Cancel</button></>}
              </div>
            </div>
          </li>
        ))}</ul>
      </section>
      <ConfirmDialog open={!!review} title="Approve this action?" confirmLabel="Approve" busy={busy} onClose={() => setReview(null)} onConfirm={() => review && void decide(review, "approve")}>
        {review && (
          <>
            <dl className="kv">
              <dt>Action</dt><dd>{review.title}</dd>
              <dt>Goes to</dt><dd>{review.destination}</dd>
              <dt>Information shared</dt><dd>{review.dataShared}</dd>
              <dt>Cost</dt><dd>{review.cost}</dd>
              <dt>Can it be undone?</dt><dd>{review.reversible ? "Yes" : "No — once sent, it can't be recalled"}</dd>
            </dl>
            <div className="panel-quiet" style={{ marginTop: "var(--s-4)" }}>
              <div className="small muted">Exact content</div>
              <p style={{ margin: "4px 0", fontWeight: 700 }}>{review.payload.subject}</p>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{review.payload.body}</p>
              {review.payload.shared.length > 0 && <ul className="small">{review.payload.shared.map((s) => <li key={s.label}>{s.label}: {s.value}</li>)}</ul>}
            </div>
            <p className="small muted" style={{ marginTop: "var(--s-3)" }}>Your approval applies to exactly this content. In this preview, delivery is simulated — nothing actually leaves EUDELLA. {!extOk && <><br /><strong>External actions are off</strong>, so this will be approved but not carried out. <button className="btn btn-quiet btn-sm" type="button" onClick={async () => { await api.post("/consents", { scope: "external_actions", granted: true }); reloadConsent(); }}>Allow external actions</button></>}</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
