import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, type Page, type Task } from "../lib/api";
import { useI18n } from "../i18n";
import { Empty, ErrorState, Loading, PageHead, fieldErr, fmtDate, useLoad, useToast } from "../components/ui";

export function TasksPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<"open" | "done" | "all">("open");
  const { data, error, loading, reload, setData } = useLoad(() => api.get<Page<Task>>("/tasks?limit=100"));
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [err, setErr] = useState<unknown>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try { await api.post("/tasks", { title, dueDate: due || null }); setTitle(""); setDue(""); toast("Task added."); reload(); }
    catch (e2) { setErr(e2); }
  }
  async function setTaskStatus(task: Task, s: Task["status"]) {
    if (data) setData({ ...data, items: data.items.map((x) => (x.id === task.id ? { ...x, status: s } : x)) });
    await api.patch(`/tasks/${task.id}`, { status: s }).then(reload).catch((e) => toast(e.message, "error"));
  }
  const items = (data?.items ?? []).filter((x) => status === "all" || (status === "open" ? x.status === "todo" || x.status === "doing" : x.status === "done" || x.status === "skipped"));
  return (
    <div className="page">
      <PageHead title={t("tasks_title")} lede={t("tasks_lede")} />
      <form onSubmit={add} className="panel" style={{ marginBottom: "var(--s-5)" }} noValidate>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="field grow" style={{ flex: "2 1 260px", marginBottom: 0 }}><label htmlFor="t-title">New task</label>
            <input id="t-title" type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!fieldErr(err, "title")} /></div>
          <div className="field" style={{ flex: "1 1 160px", marginBottom: 0 }}><label htmlFor="t-due">Due (optional)</label>
            <input id="t-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <button className="btn btn-primary" type="submit">Add task</button>
        </div>
        {fieldErr(err, "title") && <span className="err">{fieldErr(err, "title")}</span>}
      </form>
      <div className="chips" role="group" aria-label="Filter" style={{ marginBottom: "var(--s-4)" }}>
        {(["open", "done", "all"] as const).map((s) => <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>{s === "open" ? "To do" : s === "done" ? "Done" : "All"}</button>)}
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && items.length === 0 && <Empty title={status === "done" ? "Nothing finished yet" : "No open tasks"}>Tasks come from your plans, or you can add one above.</Empty>}
      <div className="panel" hidden={!items.length}>
        {items.map((task) => (
          <div key={task.id} className={`task ${task.status === "done" ? "task-done" : ""}`}>
            <input type="checkbox" id={`tk-${task.id}`} checked={task.status === "done"} onChange={() => void setTaskStatus(task, task.status === "done" ? "todo" : "done")} />
            <label htmlFor={`tk-${task.id}`} className="task-title">{task.title}
              {task.due_date && <span className="small muted"> — due {fmtDate(task.due_date)}</span>}
              {task.plan_id && <> <Link className="small" to={`/app/plans/${task.plan_id}`}>(plan)</Link></>}
            </label>
            {task.status === "todo" && <button className="btn btn-quiet btn-sm" onClick={() => void setTaskStatus(task, "doing")}>Start</button>}
            {task.status === "doing" && <span className="badge">In progress</span>}
            {task.status !== "skipped" && task.status !== "done" && <button className="btn btn-quiet btn-sm" onClick={() => void setTaskStatus(task, "skipped")}>Skip</button>}
            <button className="btn btn-quiet btn-sm icon-btn" aria-label={`Delete "${task.title}"`} onClick={async () => { await api.del(`/tasks/${task.id}`).catch((e) => toast(e.message, "error")); reload(); }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
