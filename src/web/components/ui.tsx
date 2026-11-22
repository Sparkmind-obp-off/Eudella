import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../lib/api";
import { useI18n } from "../i18n";

// ---------- brand mark (preliminary concept, not a final trademark asset) ----------
export function Mark({ size = 32, color = "currentColor", stroke = 13 }: { size?: number; color?: string; stroke?: number }) {
  return (
    <svg width={size} height={size * (240 / 330)} viewBox="20 0 290 240" aria-hidden="true" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d="M38 220V92C38 48 73 13 117 13H213C257 13 292 48 292 92V220" />
      <path d="M79 220H251" />
      <path d="M83 183C115 183 134 163 153 143C174 121 192 106 226 106" />
      <path d="M202 88L226 106L205 127" />
    </svg>
  );
}

export function Icon({ name, size = 20 }: { name: "check" | "menu" | "x" | "arrow" | "shield" | "bell" | "plus" | "trash" | "download" | "info"; size?: number }) {
  const p: Record<string, ReactNode> = {
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    x: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
    arrow: <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
    shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
    bell: <><path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16z" /><path d="M10 20a2 2 0 004 0" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
    download: <><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7.5v.5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[name]}</svg>;
}

// ---------- toasts ----------
type Toast = { id: number; text: string; kind: "ok" | "error" };
const ToastCtx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind === "error" ? "toast-error" : ""}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- data loading ----------
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fnRef.current()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (alive) setError(e instanceof ApiError ? e : new ApiError(0, "error", "Something went wrong.")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}

export function Loading({ lines = 3 }: { lines?: number }) {
  const { t } = useI18n();
  return (
    <div aria-busy="true" aria-live="polite" className="stack">
      <span className="sr-only">{t("loading")}</span>
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 15}%`, height: "1.2em" }} />)}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="notice notice-safety" role="alert">
      <p><strong>That didn't load.</strong> {error.message}</p>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>{t("retry")}</button>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Mark size={56} color="var(--bronze)" stroke={14} />
      <h3 style={{ margin: 0 }}>{title}</h3>
      {children && <p className="muted" style={{ margin: 0 }}>{children}</p>}
      {action}
    </div>
  );
}

export function PageHead({ title, lede, actions }: { title: string; lede?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="grow"><h1>{title}</h1>{lede && <p>{lede}</p>}</div>
        {actions}
      </div>
    </header>
  );
}

// ---------- confirmation dialog ----------
export function ConfirmDialog({ open, title, children, confirmLabel, danger, busy, onConfirm, onClose, confirmDisabled }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; confirmDisabled?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="dlg-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="dialog-body">
        <h2 id="dlg-title" style={{ fontSize: "var(--step-1)" }}>{title}</h2>
        <div>{children}</div>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose} disabled={busy}>{t("cancel")}</button>
          <button className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`} onClick={onConfirm} disabled={busy || confirmDisabled}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}

export function VerificationBadge({ status }: { status: string }) {
  const { t } = useI18n();
  if (status === "verified") return <span className="badge badge-verified">{t("verified_badge")}</span>;
  if (status === "example") return <span className="badge badge-example">{t("example_badge")}</span>;
  return <span className="badge badge-outline">{t("unverified_badge")}</span>;
}

export function fieldErr(err: unknown, name: string): string | undefined {
  return err instanceof ApiError ? err.fields?.[name] : undefined;
}

export const AREAS: Array<{ value: string; label: string }> = [
  { value: "work", label: "Work" }, { value: "learning", label: "Learning" }, { value: "money", label: "Money" },
  { value: "housing", label: "Housing" }, { value: "health", label: "Health" }, { value: "wellbeing", label: "Wellbeing" },
  { value: "family", label: "Family" }, { value: "community", label: "Community" }, { value: "business", label: "Business" }, { value: "other", label: "Something else" },
];
export const areaLabel = (v: string) => AREAS.find((a) => a.value === v)?.label ?? v;

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  return withTime ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}
