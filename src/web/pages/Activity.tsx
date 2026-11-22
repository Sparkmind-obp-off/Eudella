import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Activity, type Notification, type Page } from "../lib/api";
import { useI18n } from "../i18n";
import { Empty, ErrorState, Loading, PageHead, fmtDate, useLoad, useToast } from "../components/ui";

const ACTOR: Record<string, string> = { user: "You", system: "EUDELLA", life_navigator: "Life Navigator", support_discovery: "Support Discovery", planning: "Planning Agent", opportunity_discovery: "Opportunity Discovery", wellbeing_guide: "Wellbeing Guide", safety_guardian: "Safety Guardian", action_coordinator: "Action Coordinator" };
const ACTION: Record<string, string> = {
  account_created: "created your space", signed_in: "signed in", signed_out: "signed out", onboarding_completed: "finished setup",
  profile_updated: "updated your profile", preferences_updated: "changed preferences", context_added: "added an item about you", context_corrected: "corrected an item about you", context_deleted: "deleted an item about you",
  need_created: "added a need", need_updated: "updated a need", need_deleted: "deleted a need", goal_created: "set a goal", plan_created: "created a plan", plan_updated: "updated a plan", plan_deleted: "deleted a plan",
  task_created: "added a task", task_completed: "completed a task", item_saved: "saved a listing",
  approval_requested: "prepared an action for your review", approval_granted: "approved an action", approval_rejected: "declined an action", approval_cancelled: "cancelled an action",
  action_executed: "carried out an approved action (simulated)", action_failed: "could not carry out an action", execution_blocked: "stopped an action that wasn't permitted", action_refused_l4: "refused a prohibited action",
  consent_granted: "granted consent", consent_revoked: "revoked consent", data_exported: "exported your data", account_paused: "paused your account", account_resumed: "resumed your account",
  agent_run_completed: "ran a request", agent_run_blocked: "blocked a request", agent_run_failed: "could not finish a request",
};
export function describeActivity(a: Pick<Activity, "actor" | "action" | "detail">): string {
  const who = ACTOR[a.actor] ?? a.actor;
  const what = ACTION[a.action] ?? a.action.replace(/_/g, " ");
  const detail = a.detail && !a.action.startsWith("agent_run") && !a.detail.includes(",") ? `: ${a.detail}` : a.action.startsWith("consent") && a.detail ? "" : "";
  return `${who} ${what}${detail}`;
}

export function ActivityPage() {
  const { t } = useI18n();
  const [pages, setPages] = useState<Activity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    const r = await api.get<Page<Activity>>("/activity?limit=30");
    setPages(r.items);
    setCursor(r.nextCursor);
    return r;
  });
  const runs = useLoad(() => api.get<Page<{ id: string; agent: string; status: string; permission_level: string; created_at: string; policy_decision: string | null }>>("/alsos/agent-runs?limit=10"));
  async function more() {
    if (!cursor) return;
    const r = await api.get<Page<Activity>>(`/activity?limit=30&cursor=${encodeURIComponent(cursor)}`);
    setPages((p) => [...p, ...r.items]);
    setCursor(r.nextCursor);
  }
  return (
    <div className="page">
      <PageHead title={t("activity_title")} lede={t("activity_lede")} />
      <div className="grid-2">
        <section aria-labelledby="act-h">
          <h2 id="act-h" className="sr-only">Activity</h2>
          {loading && !data && <Loading lines={6} />}
          {error && <ErrorState error={error} onRetry={reload} />}
          <ul className="list">{pages.map((a) => (
            <li key={a.id}><div>{describeActivity(a)}</div><span className="small muted">{fmtDate(a.created_at, true)}</span></li>
          ))}</ul>
          {cursor && <button className="btn" onClick={() => void more()}>Show older</button>}
        </section>
        <section className="panel" aria-labelledby="runs-h">
          <h2 id="runs-h" style={{ fontSize: "var(--step-1)" }}>Agent runs</h2>
          <p className="small muted">Every ALSOS agent run, the permission level it ran under and the policy rule that applied.</p>
          {runs.data?.items.length === 0 && <p className="muted">No agent runs yet.</p>}
          <ul className="list">{runs.data?.items.map((r) => {
            const pd = r.policy_decision ? (JSON.parse(r.policy_decision) as { rule: string }) : null;
            return (
              <li key={r.id}>
                <div className="row between"><strong>{ACTOR[r.agent] ?? r.agent}</strong><span className={`badge ${r.status === "completed" ? "badge-verified" : r.status === "blocked" ? "badge-danger" : "badge-outline"}`}>{r.status}</span></div>
                <span className="small muted">{r.permission_level} · rule: {pd?.rule ?? "—"} · {fmtDate(r.created_at, true)}</span>
              </li>
            );
          })}</ul>
        </section>
      </div>
    </div>
  );
}

export function NotificationsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.get<{ items: Notification[] }>("/notifications"));
  return (
    <div className="page">
      <PageHead title={t("notifications_title")} lede="Only in-app. EUDELLA never sends unsolicited email or messages." actions={<button className="btn" onClick={async () => { await api.post("/notifications/read-all"); toast("All marked as read."); reload(); }}>Mark all read</button>} />
      {loading && !data && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <Empty title="You're all caught up" />}
      <ul className="list">{data?.items.map((n) => (
        <li key={n.id}>
          <div className="row between" style={{ alignItems: "flex-start" }}>
            <div className="grow">
              <div className="list-title">{!n.read_at && <span className="badge" style={{ marginRight: 8 }}>New</span>}{n.title}</div>
              <p className="small" style={{ margin: "4px 0" }}>{n.body}</p>
              <span className="small muted">{fmtDate(n.created_at, true)}</span>
            </div>
            <div className="row" style={{ gap: "var(--s-1)" }}>
              {n.link && <Link className="btn btn-sm" to={n.link}>Open</Link>}
              {!n.read_at && <button className="btn btn-quiet btn-sm" onClick={async () => { await api.post(`/notifications/${n.id}/read`); reload(); }}>Mark read</button>}
            </div>
          </div>
        </li>
      ))}</ul>
      <p className="small muted" style={{ marginTop: "var(--s-5)" }}>Choose which notifications you get in <Link to="/app/privacy">Privacy & consent</Link>.</p>
    </div>
  );
}
