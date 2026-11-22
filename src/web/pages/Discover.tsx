import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, type CatalogItem, type Page } from "../lib/api";
import { useI18n } from "../i18n";
import { AREAS, Empty, ErrorState, Loading, PageHead, VerificationBadge, areaLabel, fmtDate, useLoad, useToast } from "../components/ui";
import { AgentResult, useAgent } from "../components/AgentPanel";

const KINDS = [["education", "Learning"], ["work", "Work"], ["business", "Business"], ["program", "Programs"], ["community", "Community"]] as const;

export function DiscoverPage({ kind }: { kind: "resources" | "opportunities" }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const facet = params.get(kind === "resources" ? "area" : "kind") ?? "";
  const online = params.get("online") ?? "";
  const [text, setText] = useState(q);
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (facet) qs.set(kind === "resources" ? "area" : "kind", facet);
  if (online) qs.set("online", online);
  qs.set("limit", "50");
  const { data, error, loading, reload } = useLoad(() => api.get<Page<CatalogItem>>(`/catalog/${kind}?${qs}`), [qs.toString(), kind]);
  const agent = useAgent();
  const base = kind === "resources" ? "support" : "opportunities";

  function set(k: string, v: string) {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  }
  function search(e: FormEvent) { e.preventDefault(); set("q", text.trim()); }

  const facets = kind === "resources" ? AREAS.filter((a) => a.value !== "other").map((a) => [a.value, a.label] as const) : KINDS;
  return (
    <div className="page">
      <PageHead title={kind === "resources" ? t("support_title") : t("opps_title")} lede={kind === "resources" ? t("support_lede") : t("opps_lede")} />
      <div className="notice" style={{ marginBottom: "var(--s-5)" }}>
        <p><strong>Preview catalog.</strong> Every listing here is example data to show how EUDELLA works. None of it is a confirmed service — check cost, eligibility and availability with the provider before relying on anything.</p>
      </div>
      <form onSubmit={search} className="row" role="search" style={{ marginBottom: "var(--s-4)" }}>
        <label htmlFor="q" className="sr-only">Search</label>
        <input id="q" type="search" className="grow" style={{ flex: "1 1 240px" }} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "resources" ? "Search, e.g. budgeting, CV, childcare" : "Search, e.g. data, mentoring, grant"} />
        <button className="btn btn-primary" type="submit">Search</button>
        <button className="btn" type="button" disabled={agent.busy || !text.trim()} onClick={() => void agent.run(kind === "resources" ? "support_discovery" : "opportunity_discovery", text.trim())}>{agent.busy ? "Looking…" : "Ask the discovery agent"}</button>
      </form>
      <div className="chips" role="group" aria-label="Filter" style={{ marginBottom: "var(--s-5)" }}>
        <button className="chip" aria-pressed={!facet} onClick={() => set(kind === "resources" ? "area" : "kind", "")}>All</button>
        {facets.map(([v, l]) => <button key={v} className="chip" aria-pressed={facet === v} onClick={() => set(kind === "resources" ? "area" : "kind", facet === v ? "" : v)}>{l}</button>)}
        <button className="chip" aria-pressed={online === "true"} onClick={() => set("online", online === "true" ? "" : "true")}>Online only</button>
      </div>
      {agent.result && <div style={{ marginBottom: "var(--s-5)" }}><AgentResult r={agent.result} /></div>}
      {loading && !data && <Loading lines={4} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <Empty title="No matches">Try fewer words, or clear the filters.</Empty>}
      <ul className="list">
        {data?.items.map((r) => (
          <li key={r.id}>
            <Link to={`/app/${base}/${r.id}`} className="list-link">
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <span className="list-title">{r.title}</span>
                <VerificationBadge status={r.verificationStatus} />
              </div>
              <p className="small" style={{ margin: "4px 0" }}>{r.summary}</p>
              <span className="small muted">{r.providerName ?? r.organization} · {r.isOnline ? "Online" : r.location ?? "Location not confirmed"} · {r.area ? areaLabel(r.area) : KINDS.find(([v]) => v === r.kind)?.[1]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CatalogDetail({ kind }: { kind: "resources" | "opportunities" }) {
  const { id = "" } = useParams();
  const toast = useToast();
  const nav = useNavigate();
  const { data, error, loading, reload, setData } = useLoad(() => api.get<CatalogItem>(`/catalog/${kind}/${id}`), [id]);
  const base = kind === "resources" ? "support" : "opportunities";
  const type = kind === "resources" ? "resource" : "opportunity";

  async function toggleSave() {
    if (!data) return;
    try {
      if (data.saved) await api.del(`/catalog/saved/${type}/${id}`); else await api.post(`/catalog/saved/${type}/${id}`);
      setData({ ...data, saved: !data.saved });
      toast(data.saved ? "Removed from saved." : "Saved for later.");
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function addTask() {
    if (!data) return;
    try {
      await api.post("/tasks", { title: `Look into: ${data.title}`.slice(0, 200), resourceId: kind === "resources" ? id : null, notes: "Confirm details directly with the provider." });
      toast("Task added.");
    } catch (e) { toast((e as Error).message, "error"); }
  }
  const unknown = <span className="muted">Not confirmed</span>;
  return (
    <div className="page">
      <p><Link to={`/app/${base}`}>Back to {kind === "resources" ? "support" : "opportunities"}</Link></p>
      {loading && !data && <Loading lines={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <article>
          <header className="page-head">
            <div className="row" style={{ marginBottom: "var(--s-3)" }}><VerificationBadge status={data.verificationStatus} />{data.area && <span className="badge">{areaLabel(data.area)}</span>}</div>
            <h1>{data.title}</h1>
            <p>{data.summary}</p>
          </header>
          {data.verificationStatus !== "verified" && (
            <div className="notice" style={{ marginBottom: "var(--s-5)" }}><p>This listing has not been verified. It is shown to illustrate the catalog; do not rely on it.</p></div>
          )}
          <div className="grid-2">
            <section className="panel">
              <h2 style={{ fontSize: "var(--step-1)" }}>Details</h2>
              <p>{data.description}</p>
              <dl className="kv">
                <dt>{kind === "resources" ? "Provider" : "Organisation"}</dt><dd>{data.providerName ?? data.organization}</dd>
                <dt>Who it's for</dt><dd>{data.eligibility ?? unknown}</dd>
                <dt>Cost</dt><dd>{data.cost ? <>{data.cost} {!data.costVerified && <span className="badge badge-outline">estimate</span>}</> : unknown}</dd>
                <dt>Where</dt><dd>{data.isOnline ? "Online" : data.location ?? unknown}</dd>
                {kind === "resources" && <><dt>Accessibility</dt><dd>{data.accessibility ?? unknown}</dd></>}
                {kind === "opportunities" && <><dt>Deadline</dt><dd>{data.deadline ?? unknown}</dd><dt>Limitations</dt><dd>{data.limitations ?? unknown}</dd></>}
              </dl>
            </section>
            <section className="panel-quiet">
              <h2 style={{ fontSize: "var(--step-1)" }}>Source</h2>
              <dl className="kv">
                <dt>Source</dt><dd>{data.source.url ? <a href={data.source.url} rel="noopener noreferrer" target="_blank">{data.source.name}</a> : data.source.name}</dd>
                <dt>Verified</dt><dd>{data.verifiedAt ? fmtDate(data.verifiedAt) : "Never"}</dd>
              </dl>
              <div className="stack" style={{ marginTop: "var(--s-5)" }}>
                <button className="btn btn-primary" onClick={() => void toggleSave()}>{data.saved ? "Saved — remove" : "Save for later"}</button>
                <button className="btn" onClick={() => void addTask()}>Add a task to look into this</button>
                <button className="btn" onClick={() => nav(`/app/approvals?compose=1&destination=${encodeURIComponent(data.providerName ?? data.organization ?? "")}&related=${data.id}`)}>Draft a message to the provider</button>
                <p className="small muted">Drafting creates a request in your Approval center. Nothing is sent unless you approve it, and in this preview delivery is simulated.</p>
              </div>
            </section>
          </div>
        </article>
      )}
    </div>
  );
}
