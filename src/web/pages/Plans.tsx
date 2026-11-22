import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, type Need, type Page, type Plan, type Task } from "../lib/api";
import { useI18n } from "../i18n";
import { ConfirmDialog, Empty, ErrorState, Loading, PageHead, fieldErr, useLoad, useToast } from "../components/ui";
import { AgentResult, useAgent } from "../components/AgentPanel";

export function PlansPage() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data, error, loading, reload } = useLoad(() => api.get<Page<Plan>>("/plans?limit=100"));
  const { data: needs } = useLoad(() => api.get<Page<Need>>("/needs?limit=100"));
  const [needId, setNeedId] = useState(params.get("need") ?? "");
  const [goal, setGoal] = useState("");
  const [success, setSuccess] = useState("");
  const [draft, setDraft] = useState<{ title: string; steps: string[] } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const agent = useAgent();

  useEffect(() => {
    const n = needs?.items.find((x) => x.id === needId);
    if (n && !goal) setGoal(n.title);
  }, [needId, needs, goal]);

  async function suggest(e: FormEvent) {
    e.preventDefault();
    if (!goal.trim()) return;
    const r = await agent.run("planning", `${goal}${success ? `. Success for me: ${success}` : ""}`, needId ? { needId } : {});
    if (r?.output?.steps) setDraft({ title: goal.trim().slice(0, 160), steps: r.output.steps });
  }
  async function save() {
    if (!draft) return;
    setErr(null);
    try {
      const steps = draft.steps.map((s) => s.trim()).filter(Boolean);
      const r = await api.post<{ id: string }>("/plans", { title: draft.title, summary: success ? `Success for me: ${success}` : null, needId: needId || null, tasks: steps });
      toast("Plan saved.");
      nav(`/app/plans/${r.id}`);
    } catch (e2) { setErr(e2); }
  }

  return (
    <div className="page">
      <PageHead title={t("plans_title")} lede={t("plans_lede")} />
      <div className="grid-2">
        <section className="panel" aria-labelledby="new-plan">
          <h2 id="new-plan" style={{ fontSize: "var(--step-1)" }}>Start a plan</h2>
          <form onSubmit={suggest}>
            <div className="field"><label htmlFor="p-need">Linked need (optional)</label>
              <select id="p-need" value={needId} onChange={(e) => { setNeedId(e.target.value); setGoal(""); }}>
                <option value="">None</option>
                {needs?.items.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
              </select></div>
            <div className="field"><label htmlFor="p-goal">What do you want to achieve?</label>
              <input id="p-goal" type="text" maxLength={160} value={goal} onChange={(e) => setGoal(e.target.value)} /></div>
            <div className="field"><label htmlFor="p-succ">What would success look like for you? (optional)</label>
              <input id="p-succ" type="text" maxLength={300} value={success} onChange={(e) => setSuccess(e.target.value)} placeholder="Your definition, not ours" /></div>
            <div className="row">
              <button className="btn" type="submit" disabled={agent.busy || !goal.trim()}>{agent.busy ? "Drafting…" : "Suggest steps"}</button>
              <button className="btn btn-quiet" type="button" disabled={!goal.trim()} onClick={() => setDraft({ title: goal.trim(), steps: [""] })}>Write my own steps</button>
            </div>
          </form>
          {agent.result && !draft && <div style={{ marginTop: "var(--s-4)" }}><AgentResult r={agent.result} /></div>}
        </section>
        {draft && (
          <section className="panel" aria-labelledby="draft-h">
            <h2 id="draft-h" style={{ fontSize: "var(--step-1)" }}>Review before saving</h2>
            <p className="small muted">Edit, reorder or remove any step. Nothing is saved until you press Save plan.</p>
            <div className="field"><label htmlFor="d-title">Plan title</label>
              <input id="d-title" type="text" maxLength={160} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-invalid={!!fieldErr(err, "title")} />
              {fieldErr(err, "title") && <span className="err">{fieldErr(err, "title")}</span>}</div>
            <ol className="steps" style={{ paddingLeft: "1.2em" }}>
              {draft.steps.map((s, i) => (
                <li key={i} style={{ marginBottom: "var(--s-2)" }}>
                  <div className="row" style={{ gap: "var(--s-1)", flexWrap: "nowrap" }}>
                    <label className="sr-only" htmlFor={`step-${i}`}>Step {i + 1}</label>
                    <input id={`step-${i}`} type="text" maxLength={200} value={s} onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? e.target.value : x)) })} />
                    <button type="button" className="btn btn-quiet icon-btn btn-sm" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => { const st = [...draft.steps]; [st[i - 1], st[i]] = [st[i]!, st[i - 1]!]; setDraft({ ...draft, steps: st }); }}>↑</button>
                    <button type="button" className="btn btn-quiet icon-btn btn-sm" aria-label={`Remove step ${i + 1}`} onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => setDraft({ ...draft, steps: [...draft.steps, ""] })}>Add a step</button>
              <span className="grow" />
              <button type="button" className="btn btn-quiet" onClick={() => setDraft(null)}>Discard</button>
              <button type="button" className="btn btn-primary" onClick={() => void save()}>Save plan</button>
            </div>
          </section>
        )}
      </div>
      <section className="section" aria-labelledby="plans-list">
        <h2 id="plans-list">Your plans</h2>
        {loading && !data && <Loading />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && data.items.length === 0 && <Empty title="No plans yet">Start one above. A plan is just a list of steps you can change at any time.</Empty>}
        <div className="grid-auto">
          {data?.items.map((p) => {
            const pr = p.progress ?? { total: 0, done: 0 };
            const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
            return (
              <Link key={p.id} to={`/app/plans/${p.id}`} className="panel list-link">
                <div className="list-title">{p.title}</div>
                <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.title} progress`} style={{ margin: "var(--s-3) 0 var(--s-2)" }}><span style={{ width: `${pct}%` }} /></div>
                <span className="small muted">{pr.done} of {pr.total} steps · {p.status}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function PlanDetail() {
  const { id = "" } = useParams();
  const toast = useToast();
  const nav = useNavigate();
  const { data, error, loading, reload, setData } = useLoad(() => api.get<Plan>(`/plans/${id}`), [id]);
  const [newStep, setNewStep] = useState("");
  const [editTitle, setEditTitle] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function toggle(task: Task) {
    const next = task.status === "done" ? "todo" : "done";
    if (data) setData({ ...data, tasks: (data.tasks ?? []).map((x) => (x.id === task.id ? { ...x, status: next } : x)) });
    await api.patch(`/tasks/${task.id}`, { status: task.status === "done" ? "todo" : "done" }).then(reload).catch((e) => toast(e.message, "error"));
  }
  async function move(i: number, d: -1 | 1) {
    const tasks = data?.tasks ?? [];
    const a = tasks[i], b = tasks[i + d];
    if (!a || !b) return;
    await Promise.all([api.patch(`/tasks/${a.id}`, { position: i + d }), api.patch(`/tasks/${b.id}`, { position: i })]).catch((e) => toast(e.message, "error"));
    // normalise positions
    reload();
  }
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!newStep.trim()) return;
    await api.post("/tasks", { title: newStep.trim(), planId: id }).then(() => { setNewStep(""); reload(); }).catch((e2) => toast(e2.message, "error"));
  }
  const tasks = data?.tasks ?? [];
  const done = tasks.filter((x) => x.status === "done").length;
  return (
    <div className="page">
      <p><Link to="/app/plans">Back to plans</Link></p>
      {loading && !data && <Loading lines={5} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          <header className="page-head">
            {editTitle === null ? (
              <div className="row between"><h1>{data.title}</h1><button className="btn btn-sm" onClick={() => setEditTitle(data.title)}>Rename</button></div>
            ) : (
              <form className="row" onSubmit={async (e) => { e.preventDefault(); await api.patch(`/plans/${id}`, { title: editTitle }).catch((er) => toast(er.message, "error")); setEditTitle(null); reload(); }}>
                <label htmlFor="pt" className="sr-only">Plan title</label>
                <input id="pt" type="text" className="grow" style={{ flex: "1 1 240px" }} value={editTitle} maxLength={160} onChange={(e) => setEditTitle(e.target.value)} />
                <button className="btn btn-primary" type="submit">Save</button>
                <button className="btn" type="button" onClick={() => setEditTitle(null)}>Cancel</button>
              </form>
            )}
            {data.summary && <p>{data.summary}</p>}
            <p className="small muted">{done} of {tasks.length} steps done · {data.origin === "planning_agent" ? "Drafted with the Planning Agent" : "Created by you"}</p>
          </header>
          <section className="panel" aria-label="Steps">
            {tasks.length === 0 && <p className="muted">No steps yet. Add the first one below.</p>}
            {tasks.map((task, i) => (
              <div key={task.id} className={`task ${task.status === "done" ? "task-done" : ""}`}>
                <input type="checkbox" id={`t-${task.id}`} checked={task.status === "done"} onChange={() => void toggle(task)} />
                <label htmlFor={`t-${task.id}`} className="task-title">{task.title}</label>
                <button className="btn btn-quiet btn-sm icon-btn" aria-label={`Move "${task.title}" up`} disabled={i === 0} onClick={() => void move(i, -1)}>↑</button>
                <button className="btn btn-quiet btn-sm icon-btn" aria-label={`Move "${task.title}" down`} disabled={i === tasks.length - 1} onClick={() => void move(i, 1)}>↓</button>
                <button className="btn btn-quiet btn-sm icon-btn" aria-label={`Delete "${task.title}"`} onClick={async () => { await api.del(`/tasks/${task.id}`).catch((e) => toast(e.message, "error")); reload(); }}>✕</button>
              </div>
            ))}
            <form onSubmit={add} className="row" style={{ marginTop: "var(--s-4)" }}>
              <label htmlFor="ns" className="sr-only">New step</label>
              <input id="ns" type="text" className="grow" style={{ flex: "1 1 240px" }} maxLength={200} value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Add a step" />
              <button className="btn" type="submit" disabled={!newStep.trim()}>Add step</button>
            </form>
          </section>
          <div className="row" style={{ marginTop: "var(--s-5)" }}>
            {data.status !== "completed" ? <button className="btn" onClick={async () => { await api.patch(`/plans/${id}`, { status: "completed" }); toast("Plan marked complete."); reload(); }}>Mark plan complete</button>
              : <button className="btn" onClick={async () => { await api.patch(`/plans/${id}`, { status: "active" }); reload(); }}>Reopen plan</button>}
            <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>Delete plan</button>
          </div>
          <ConfirmDialog open={confirmDel} title="Delete this plan?" danger confirmLabel="Delete plan" onClose={() => setConfirmDel(false)}
            onConfirm={async () => { await api.del(`/plans/${id}`).catch((e) => toast(e.message, "error")); toast("Plan deleted."); nav("/app/plans"); }}>
            <p>"{data.title}" and its {tasks.length} steps will be permanently removed.</p>
          </ConfirmDialog>
        </>
      )}
    </div>
  );
}
