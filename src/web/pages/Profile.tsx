import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useI18n } from "../i18n";
import { ErrorState, Loading, PageHead, fieldErr, fmtDate, useLoad, useToast } from "../components/ui";

interface Profile { displayName: string; locale: "en" | "id"; region: string | null; pronouns: string | null; bio: string | null; email: string; status: string; createdAt: string }

export function ProfilePage() {
  const { t, setLocale } = useI18n();
  const toast = useToast();
  const { refresh } = useSession();
  const { data, error, loading, reload } = useLoad(() => api.get<Profile>("/profile"));
  const [form, setForm] = useState({ displayName: "", locale: "en" as "en" | "id", region: "", pronouns: "", bio: "" });
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (data) setForm({ displayName: data.displayName, locale: data.locale, region: data.region ?? "", pronouns: data.pronouns ?? "", bio: data.bio ?? "" }); }, [data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api.patch("/profile", { ...form, region: form.region || null, pronouns: form.pronouns || null, bio: form.bio || null });
      setLocale(form.locale);
      await refresh();
      toast("Profile saved.");
      reload();
    } catch (e2) { setErr(e2); }
  }
  return (
    <div className="page">
      <PageHead title={t("profile_title")} lede="How EUDELLA addresses you. Everything here is optional except your name." />
      {loading && !data && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="grid-2">
          <form className="panel" onSubmit={save} noValidate>
            <div className="field"><label htmlFor="pf-name">Name</label>
              <input id="pf-name" type="text" maxLength={80} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} aria-invalid={!!fieldErr(err, "displayName")} />
              {fieldErr(err, "displayName") && <span className="err">{fieldErr(err, "displayName")}</span>}</div>
            <div className="field"><label htmlFor="pf-pro">Pronouns</label>
              <input id="pf-pro" type="text" maxLength={40} value={form.pronouns} onChange={(e) => setForm({ ...form, pronouns: e.target.value })} /></div>
            <div className="field"><label htmlFor="pf-reg">Region</label>
              <input id="pf-reg" type="text" maxLength={80} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></div>
            <div className="field"><label htmlFor="pf-loc">Language</label>
              <select id="pf-loc" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value as "en" | "id" })}><option value="en">English</option><option value="id">Bahasa Indonesia</option></select></div>
            <div className="field"><label htmlFor="pf-bio">A note about you</label>
              <textarea id="pf-bio" maxLength={500} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
            <button className="btn btn-primary" type="submit">{t("save")}</button>
          </form>
          <section className="panel-quiet">
            <dl className="kv">
              <dt>Email</dt><dd>{data.email}</dd>
              <dt>Account</dt><dd>{data.status}</dd>
              <dt>Member since</dt><dd>{fmtDate(data.createdAt)}</dd>
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
