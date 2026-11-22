import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setCsrf, type SessionInfo } from "./api";

interface SessionCtx { session: SessionInfo | null; refresh: () => Promise<SessionInfo>; signOut: () => Promise<void> }
const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const refresh = useCallback(async () => {
    const s = await api.get<SessionInfo>("/auth/session").catch(() => ({ authenticated: false }) as SessionInfo);
    if (s.csrfToken) setCsrf(s.csrfToken);
    setSession(s);
    return s;
  }, []);
  const signOut = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setCsrf("");
    setSession({ authenticated: false });
  }, []);
  useEffect(() => {
    void refresh();
    const onUnauth = () => setSession({ authenticated: false });
    window.addEventListener("eudella:unauthenticated", onUnauth);
    return () => window.removeEventListener("eudella:unauthenticated", onUnauth);
  }, [refresh]);
  return <Ctx.Provider value={{ session, refresh, signOut }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider missing");
  return v;
}
