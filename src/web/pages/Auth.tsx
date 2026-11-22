import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, setCsrf } from "../lib/api";
import { useSession } from "../lib/session";
import { useI18n } from "../i18n";
import { Mark, fieldErr } from "../components/ui";

export function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const { t, locale } = useI18n();
  const { refresh } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [form, setForm] = useState({ email: "", password: "", displayName: "", acceptTerms: false });
  const up = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = mode === "signup"
        ? await api.post<{ csrfToken: string }>("/auth/signup", { ...form, locale })
        : await api.post<{ csrfToken: string }>("/auth/login", { email: form.email, password: form.password });
      setCsrf(r.csrfToken);
      const s = await refresh();
      const from = (loc.state as { from?: string } | null)?.from;
      nav(s.user?.onboardingCompleted ? from ?? "/app" : "/onboarding", { replace: true });
    } catch (e2) {
      setErr(e2);
    } finally {
      setBusy(false);
    }
  }
  const general = err instanceof ApiError && !err.fields ? err.message : err instanceof ApiError ? "Please check the highlighted fields." : null;

  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <Link to="/" className="brand" aria-label="EUDELLA home" style={{ color: "var(--ivory)" }}><Mark size={36} color="var(--ivory)" /><span className="brand-word">EUDELLA</span></Link>
        <div>
          <h2>{t("tagline")}</h2>
          <p>{t("promise")}</p>
        </div>
        <p className="small">AI is off by default. Your data stays yours: export or delete it any time.</p>
      </aside>
      <main className="auth-main" id="main">
        <div className="auth-card">
          <Link to="/" className="brand" style={{ color: "var(--forest)", marginBottom: "var(--s-6)" }} aria-label="EUDELLA home"><Mark size={30} color="var(--forest)" /><span className="brand-word">EUDELLA</span></Link>
          <h1 style={{ fontSize: "var(--step-2)" }}>{mode === "signup" ? t("sign_up") : t("sign_in")}</h1>
          <p className="muted">{mode === "signup" ? "A private space for your needs, plans and next steps." : "Welcome back."}</p>
          {general && <div className="notice notice-safety" role="alert" style={{ marginBottom: "var(--s-4)" }}><p>{general}</p></div>}
          <form onSubmit={submit} noValidate>
            {mode === "signup" && (
              <div className="field">
                <label htmlFor="displayName">What should we call you?</label>
                <input id="displayName" type="text" autoComplete="nickname" required value={form.displayName} onChange={up("displayName")} aria-invalid={!!fieldErr(err, "displayName")} aria-describedby="dn-err" />
                {fieldErr(err, "displayName") && <span id="dn-err" className="err">{fieldErr(err, "displayName")}</span>}
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" required value={form.email} onChange={up("email")} aria-invalid={!!fieldErr(err, "email")} aria-describedby="em-err" />
              {fieldErr(err, "email") && <span id="em-err" className="err">{fieldErr(err, "email")}</span>}
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 10 : 1} value={form.password} onChange={up("password")} aria-invalid={!!fieldErr(err, "password")} aria-describedby="pw-hint pw-err" />
              {mode === "signup" && <span id="pw-hint" className="hint">At least 10 characters. A short phrase works well.</span>}
              {fieldErr(err, "password") && <span id="pw-err" className="err">{fieldErr(err, "password")}</span>}
            </div>
            {mode === "signup" && (
              <div className="field">
                <label className="check" htmlFor="terms" style={{ fontWeight: 400 }}>
                  <input id="terms" type="checkbox" checked={form.acceptTerms} onChange={up("acceptTerms")} aria-invalid={!!fieldErr(err, "acceptTerms")} />
                  <span>I understand EUDELLA is an early preview, is not an emergency, clinical, legal or financial service, and that I can export or delete my data at any time.</span>
                </label>
                {fieldErr(err, "acceptTerms") && <span className="err">{fieldErr(err, "acceptTerms")}</span>}
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "Please wait…" : mode === "signup" ? t("sign_up") : t("sign_in")}</button>
          </form>
          <p className="small" style={{ marginTop: "var(--s-5)" }}>
            {mode === "signup" ? <>Already have a space? <Link to="/signin">{t("sign_in")}</Link></> : <>New here? <Link to="/signup">{t("sign_up")}</Link></>}
          </p>
        </div>
      </main>
    </div>
  );
}
