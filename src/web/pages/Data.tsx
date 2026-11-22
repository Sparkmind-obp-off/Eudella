import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";
import { useI18n } from "../i18n";
import { ConfirmDialog, Icon, PageHead, useToast } from "../components/ui";

export function DataPage() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const { session, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [delErr, setDelErr] = useState("");
  const paused = session?.user?.status === "paused";

  async function exportData() {
    setBusy(true);
    try {
      const res = await fetch("/api/export", { credentials: "same-origin" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message ?? "Export failed.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eudella-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Your data has been downloaded.");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  }
  async function togglePause() {
    try { await api.post("/account/pause", { paused: !paused }); await refresh(); toast(paused ? "Account resumed." : "Account paused."); }
    catch (e) { toast((e as Error).message, "error"); }
  }
  async function deleteAccount() {
    setBusy(true);
    setDelErr("");
    try {
      await api.post("/account/delete", { password: pw, confirm, reason: reason || null });
      await refresh();
      nav("/", { replace: true });
    } catch (e) { setDelErr(e instanceof ApiError ? (e.fields ? "Type DELETE exactly and enter your password." : e.message) : "Something went wrong."); }
    finally { setBusy(false); }
  }
  return (
    <div className="page">
      <PageHead title={t("data_title")} lede={t("data_lede")} />
      <section className="panel" aria-labelledby="exp-h">
        <h2 id="exp-h" style={{ fontSize: "var(--step-1)" }}>Download your data</h2>
        <p>A single file with everything EUDELLA stores about you: profile, needs, plans, tasks, "About me" items, approvals, consent history, activity and agent runs. Passwords and session secrets are excluded.</p>
        <button className="btn btn-primary" onClick={() => void exportData()} disabled={busy}><Icon name="download" /> Download (JSON)</button>
      </section>
      <section className="panel section" aria-labelledby="pause-h">
        <h2 id="pause-h" style={{ fontSize: "var(--step-1)" }}>{paused ? "Resume your account" : "Pause your account"}</h2>
        <p>{paused ? "Your account is paused. Resuming lets you make changes and use agents again." : "Pausing stops all agents and cancels anything waiting for approval. You can still sign in, look around, export or delete."}</p>
        <button className="btn" onClick={() => void togglePause()}>{paused ? "Resume account" : "Pause account"}</button>
      </section>
      <section className="panel section" aria-labelledby="del-h" style={{ borderColor: "var(--danger)" }}>
        <h2 id="del-h" style={{ fontSize: "var(--step-1)", color: "var(--danger)" }}>Delete your account</h2>
        <p>This permanently erases your account and everything in it. It cannot be undone. Consider downloading your data first.</p>
        <button className="btn btn-danger" onClick={() => setDel(true)}><Icon name="trash" /> Delete account…</button>
      </section>
      <ConfirmDialog open={del} danger title="Permanently delete your account?" confirmLabel="Delete everything" busy={busy} confirmDisabled={confirm !== "DELETE" || !pw} onClose={() => { setDel(false); setDelErr(""); }} onConfirm={() => void deleteAccount()}>
        <p>All your needs, plans, tasks, "About me" items, approvals, consent records, activity and agent runs will be erased. Only an anonymous record that a deletion happened is kept.</p>
        <div className="field"><label htmlFor="del-pw">Your password</label><input id="del-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div className="field"><label htmlFor="del-c">Type DELETE to confirm</label><input id="del-c" type="text" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        <div className="field"><label htmlFor="del-r">Anything you'd like to tell us? (optional)</label><input id="del-r" type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        {delErr && <p className="err" role="alert">{delErr}</p>}
      </ConfirmDialog>
    </div>
  );
}
