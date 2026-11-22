import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { Icon, Mark } from "./ui";

export function AppShell() {
  const { t, locale, setLocale } = useI18n();
  const { session, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({ approvals: 0, notifications: 0 });
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    api.get<{ pendingApprovals: number; unreadNotifications: number }>("/dashboard")
      .then((d) => setCounts({ approvals: d.pendingApprovals, notifications: d.unreadNotifications }))
      .catch(() => undefined);
  }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const link = (to: string, label: string, count?: number) => (
    <NavLink to={to} end={to === "/app"} className="nav-link">
      <span>{label}</span>
      {count ? <span className="nav-count" aria-label={`${count} waiting`}>{count}</span> : null}
    </NavLink>
  );

  const paused = session?.user?.status === "paused";

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="topbar">
        <Link to="/app" className="brand" aria-label="EUDELLA home"><Mark size={30} color="var(--ivory)" /><span className="brand-word">EUDELLA</span></Link>
        <button className="btn btn-sm" aria-expanded={open} aria-controls="rail" onClick={() => setOpen(true)}><Icon name="menu" /> {t("menu")}</button>
      </div>
      {open && <button className="scrim" aria-label={t("close")} onClick={() => setOpen(false)} />}
      <nav id="rail" className="rail" data-open={open} aria-label="Main">
        <div className="row between">
          <Link to="/app" className="brand" aria-label="EUDELLA home"><Mark size={34} color="var(--ivory)" /><span className="brand-word">EUDELLA</span></Link>
          {open && <button className="btn btn-quiet icon-btn" style={{ color: "var(--ivory)" }} aria-label={t("close")} onClick={() => setOpen(false)}><Icon name="x" /></button>}
        </div>
        <div className="nav-group">
          {link("/app", t("nav_home"))}
          <div className="nav-label">{t("nav_group_life")}</div>
          {link("/app/needs", t("nav_needs"))}
          {link("/app/plans", t("nav_plans"))}
          {link("/app/tasks", t("nav_tasks"))}
          {link("/app/context", t("nav_context"))}
          <div className="nav-label">{t("nav_group_discover")}</div>
          {link("/app/support", t("nav_support"))}
          {link("/app/opportunities", t("nav_opportunities"))}
          <div className="nav-label">{t("nav_group_control")}</div>
          {link("/app/approvals", t("nav_approvals"), counts.approvals)}
          {link("/app/notifications", t("nav_notifications"), counts.notifications)}
          {link("/app/activity", t("nav_activity"))}
          {link("/app/privacy", t("nav_privacy"))}
          {link("/app/data", t("nav_data"))}
          {link("/app/profile", t("nav_profile"))}
          {link("/app/help", t("nav_help"))}
        </div>
        <div className="rail-foot">
          <label className="sr-only" htmlFor="lang">Interface language</label>
          <select id="lang" value={locale} onChange={(e) => setLocale(e.target.value as "en" | "id")} style={{ background: "transparent", color: "var(--ivory)", borderColor: "rgba(244,240,231,0.35)", minHeight: 40 }}>
            <option value="en" style={{ color: "#252A28" }}>English</option>
            <option value="id" style={{ color: "#252A28" }}>Bahasa Indonesia</option>
          </select>
          <span>{session?.user?.email}</span>
          <button className="btn btn-sm" style={{ "--bg": "transparent", "--fg": "var(--ivory)", "--bd": "rgba(244,240,231,0.35)" } as React.CSSProperties} onClick={async () => { await signOut(); nav("/"); }}>{t("sign_out")}</button>
        </div>
      </nav>
      <main id="main" className="main" tabIndex={-1}>
        {paused && (
          <div className="notice" role="status" style={{ marginBottom: "var(--s-5)" }}>
            <p><strong>Your account is paused.</strong> You can look around, export your data or change privacy settings. Agents and changes are stopped until you <Link to="/app/data">resume your account</Link>.</p>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
