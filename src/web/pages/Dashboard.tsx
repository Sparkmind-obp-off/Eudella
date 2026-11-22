import { Link } from "react-router-dom";
import { api, type Activity } from "../lib/api";
import { useSession } from "../lib/session";
import { useI18n } from "../i18n";
import { ErrorState, Loading, PageHead, Empty, areaLabel, fmtDate, useLoad } from "../components/ui";
import { describeActivity } from "./Activity";

interface Dash {
  needs: Array<{ id: string; title: string; area: string; urgency: string; status: string }>;
  tasks: Array<{ id: string; title: string; status: string; due_date: string | null; plan_id: string | null }>;
  pendingApprovals: number; unreadNotifications: number;
  recentActivity: Activity[];
  plans: Array<{ id: string; title: string; total: number; done: number }>;
}

export function Dashboard() {
  const { t } = useI18n();
  const { session } = useSession();
  const { data, error, loading, reload } = useLoad(() => api.get<Dash>("/dashboard"));
  return (
    <div className="page">
      <PageHead title={t("dashboard_title", { name: session?.user?.displayName ?? "" })} lede={t("dashboard_lede")} actions={<Link to="/app/needs" className="btn btn-primary">Add a need</Link>} />
      {loading && !data && <Loading lines={5} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          {data.pendingApprovals > 0 && (
            <div className="notice" style={{ marginBottom: "var(--s-5)" }}>
              <p><strong>{data.pendingApprovals} action{data.pendingApprovals > 1 ? "s" : ""} waiting for your review.</strong> Nothing happens until you decide. <Link to="/app/approvals">Review now</Link></p>
            </div>
          )}
          <div className="grid-2">
            <section className="panel" aria-labelledby="d-needs">
              <div className="row between"><h2 id="d-needs" style={{ fontSize: "var(--step-1)" }}>Open needs</h2><Link to="/app/needs" className="small">All needs</Link></div>
              {data.needs.length === 0 ? (
                <Empty title="Nothing here yet">Start with what's on your mind. It can be as small or as big as you like.</Empty>
              ) : (
                <ul className="list">{data.needs.map((n) => (
                  <li key={n.id}><div className="row between"><span className="list-title">{n.title}</span><span className="badge">{areaLabel(n.area)}</span></div></li>
                ))}</ul>
              )}
            </section>
            <section className="panel" aria-labelledby="d-tasks">
              <div className="row between"><h2 id="d-tasks" style={{ fontSize: "var(--step-1)" }}>Next steps</h2><Link to="/app/tasks" className="small">All tasks</Link></div>
              {data.tasks.length === 0 ? <p className="muted">No open tasks. Plans you create will show their steps here.</p> : (
                <ul className="list">{data.tasks.map((x) => (
                  <li key={x.id}><span className="list-title" style={{ fontWeight: 500 }}>{x.title}</span>{x.due_date && <span className="small muted"> — due {fmtDate(x.due_date)}</span>}</li>
                ))}</ul>
              )}
            </section>
          </div>
          <section className="section" aria-labelledby="d-plans">
            <div className="row between"><h2 id="d-plans">Plans in progress</h2><Link to="/app/plans" className="small">All plans</Link></div>
            {data.plans.length === 0 ? <p className="muted">No active plans. Turn a need into a plan from the Plans page.</p> : (
              <div className="grid-auto">{data.plans.map((p) => {
                const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
                return (
                  <Link key={p.id} to={`/app/plans/${p.id}`} className="panel list-link">
                    <div className="list-title">{p.title}</div>
                    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.title} progress`} style={{ margin: "var(--s-3) 0 var(--s-2)" }}><span style={{ width: `${pct}%` }} /></div>
                    <span className="small muted">{p.done} of {p.total} steps done</span>
                  </Link>
                );
              })}</div>
            )}
          </section>
          <section className="section" aria-labelledby="d-act">
            <div className="row between"><h2 id="d-act">Recent activity</h2><Link to="/app/activity" className="small">Full history</Link></div>
            <ul className="list">{data.recentActivity.map((a, i) => (
              <li key={i} className="row between"><span>{describeActivity(a)}</span><span className="small muted">{fmtDate(a.created_at, true)}</span></li>
            ))}</ul>
          </section>
        </>
      )}
    </div>
  );
}
