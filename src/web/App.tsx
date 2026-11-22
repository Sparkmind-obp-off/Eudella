import type React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useSession } from "./lib/session";
import { Loading } from "./components/ui";
import { AppShell } from "./components/AppShell";
import { Landing } from "./pages/Landing";
import { AuthPage } from "./pages/Auth";
import { Onboarding } from "./pages/Onboarding";
import { Dashboard } from "./pages/Dashboard";
import { NeedsPage } from "./pages/Needs";
import { ContextPage } from "./pages/Context";
import { DiscoverPage, CatalogDetail } from "./pages/Discover";
import { PlansPage, PlanDetail } from "./pages/Plans";
import { TasksPage } from "./pages/Tasks";
import { ApprovalsPage } from "./pages/Approvals";
import { ActivityPage, NotificationsPage } from "./pages/Activity";
import { PrivacyPage } from "./pages/Privacy";
import { ProfilePage } from "./pages/Profile";
import { DataPage } from "./pages/Data";
import { HelpPage } from "./pages/Help";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { session } = useSession();
  const loc = useLocation();
  if (!session) return <main className="main"><Loading /></main>;
  if (!session.authenticated) return <Navigate to="/signin" replace state={{ from: loc.pathname }} />;
  if (!session.user?.onboardingCompleted && loc.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signin" element={<AuthPage mode="signin" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/help" element={<HelpPage standalone />} />
      <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="needs" element={<NeedsPage />} />
        <Route path="context" element={<ContextPage />} />
        <Route path="support" element={<DiscoverPage kind="resources" />} />
        <Route path="support/:id" element={<CatalogDetail kind="resources" />} />
        <Route path="opportunities" element={<DiscoverPage kind="opportunities" />} />
        <Route path="opportunities/:id" element={<CatalogDetail kind="opportunities" />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="plans/:id" element={<PlanDetail />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="data" element={<DataPage />} />
        <Route path="help" element={<HelpPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
