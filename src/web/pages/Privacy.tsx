import { api } from "../lib/api";
import { useI18n } from "../i18n";
import { ErrorState, Loading, PageHead, fmtDate, useLoad, useToast } from "../components/ui";

const SCOPES: Array<{ scope: string; title: string; body: string }> = [
  { scope: "personal_context_use", title: "Use my \"About me\" items to tailor suggestions", body: "Planning and the Life Navigator may read items you marked as normal. Sensitive items are never used." },
  { scope: "external_actions", title: "Allow external actions after my approval", body: "Without this, no action is carried out even if you approve it. Turning it off cancels anything still waiting." },
  { scope: "resource_personalization", title: "Personalise the order of listings", body: "Reserved for a later version; currently has no effect. Recorded so your choice is ready." },
  { scope: "product_updates", title: "Tell me about EUDELLA product updates", body: "In-app only. Off by default." },
];

interface Prefs { aiAssistanceEnabled: boolean; aiAvailableOnPlatform: boolean; memoryEnabled: boolean; reducedMotion: boolean; notifications: { inApp: boolean; approvals: boolean; taskReminders: boolean; productUpdates: boolean } }

export function PrivacyPage() {
  const { t } = useI18n();
  const toast = useToast();
  const c = useLoad(() => api.get<{ current: Record<string, boolean>; history: Array<{ scope: string; granted: number; purpose: string; created_at: string }>; policyVersion: string }>("/consents"));
  const p = useLoad(() => api.get<Prefs>("/preferences"));

  async function setConsent(scope: string, granted: boolean) {
    if (c.data) c.setData({ ...c.data, current: { ...c.data.current, [scope]: granted } });
    try { await api.post("/consents", { scope, granted }); toast(granted ? "Consent granted and recorded." : "Consent revoked and recorded."); c.reload(); }
    catch (e) { toast((e as Error).message, "error"); }
  }
  async function setPref(body: Record<string, boolean>, path = "/preferences") {
    if (p.data) p.setData(path === "/preferences" ? { ...p.data, ...body } : { ...p.data, notifications: { ...p.data.notifications, ...body } });
    try { await api.patch(path, body); toast("Saved."); p.reload(); }
    catch (e) { toast((e as Error).message, "error"); }
  }
  const scopeTitle = (s: string) => SCOPES.find((x) => x.scope === s)?.title ?? (s === "ai_assistance" ? "AI assistance" : s);

  return (
    <div className="page">
      <PageHead title={t("privacy_title")} lede={t("privacy_lede")} />
      {(c.loading && !c.data) || (p.loading && !p.data) ? <Loading lines={6} /> : null}
      {c.error && <ErrorState error={c.error} onRetry={c.reload} />}
      {c.data && p.data && (
        <>
          <section className="panel" aria-labelledby="consent-h">
            <h2 id="consent-h" style={{ fontSize: "var(--step-1)" }}>What EUDELLA may do</h2>
            {SCOPES.map((s) => (
              <label key={s.scope} className="switch">
                <span><strong>{s.title}</strong><br /><span className="small muted">{s.body}</span></span>
                <input type="checkbox" role="switch" checked={!!c.data!.current[s.scope]} onChange={(e) => void setConsent(s.scope, e.target.checked)} />
              </label>
            ))}
            <div className="switch">
              <span><strong>AI assistance</strong><br /><span className="small muted">{p.data.aiAvailableOnPlatform ? "Send requests to an approved AI provider." : "Not available on this version. No personal data is sent to any AI provider; all agents run deterministic rules."}</span></span>
              <input type="checkbox" role="switch" aria-label="AI assistance" checked={!!c.data.current.ai_assistance} disabled={!p.data.aiAvailableOnPlatform} onChange={(e) => void setConsent("ai_assistance", e.target.checked)} />
            </div>
          </section>
          <section className="panel section" aria-labelledby="mem-h">
            <h2 id="mem-h" style={{ fontSize: "var(--step-1)" }}>Memory & display</h2>
            <label className="switch">
              <span><strong>Memory on</strong><br /><span className="small muted">Turn off to stop agents using any stored context, even with consent. Your items stay stored until you delete them.</span></span>
              <input type="checkbox" role="switch" checked={p.data.memoryEnabled} onChange={(e) => void setPref({ memoryEnabled: e.target.checked })} />
            </label>
            <label className="switch">
              <span><strong>Reduce motion</strong><br /><span className="small muted">Turns off animations in EUDELLA.</span></span>
              <input type="checkbox" role="switch" checked={p.data.reducedMotion} onChange={(e) => { document.documentElement.dataset.reducedMotion = String(e.target.checked); void setPref({ reducedMotion: e.target.checked }); }} />
            </label>
          </section>
          <section className="panel section" aria-labelledby="notif-h">
            <h2 id="notif-h" style={{ fontSize: "var(--step-1)" }}>Notifications</h2>
            {([["inApp", "In-app notifications"], ["approvals", "Actions waiting for approval"], ["taskReminders", "Task reminders"], ["productUpdates", "Product updates"]] as const).map(([k, l]) => (
              <label key={k} className="switch"><span><strong>{l}</strong></span>
                <input type="checkbox" role="switch" checked={p.data!.notifications[k]} onChange={(e) => void setPref({ [k]: e.target.checked }, "/preferences/notifications")} /></label>
            ))}
            <p className="small muted" style={{ margin: 0 }}>Email notifications are not available: no email provider is connected.</p>
          </section>
          <section className="section" aria-labelledby="hist-h">
            <h2 id="hist-h">Consent history</h2>
            <p className="small muted">Every grant and revocation, newest first. Policy version {c.data.policyVersion}.</p>
            <ul className="list">{c.data.history.slice(0, 30).map((h, i) => (
              <li key={i} className="row between"><span>{h.granted ? "Granted" : h.purpose === "default_off_at_signup" ? "Off by default" : "Revoked"}: {scopeTitle(h.scope)}</span><span className="small muted">{fmtDate(h.created_at, true)}</span></li>
            ))}</ul>
          </section>
        </>
      )}
    </div>
  );
}
