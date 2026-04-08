import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import DepartmentPage from "@/pages/DepartmentPage";
import NewTransaction from "@/pages/NewTransaction";
import LoginPage from "@/pages/LoginPage";
import UserManagement from "@/pages/UserManagement";
import AuditLogPage from "@/pages/AuditLogPage";
import ProfilePage from "@/pages/ProfilePage";
import GabaStockPage from "@/pages/GabaStockPage";
import FormationsPage from "@/pages/FormationsPage";
import PaymentTrackingPage from "@/pages/PaymentTrackingPage";
import NotFound from "./pages/NotFound.tsx";
import { initSupabase, isSupabaseConfigured } from "@/lib/firebase";
import { pullAllFromSupabase, purgeAllSupabase, pushAllToSupabase } from "@/lib/sync";
import { purgeAllData } from "@/lib/auth";
import { migrateInscriptionInstallments, cleanupOrphanedInstallments } from "@/lib/stock";

const PURGE_FLAG = 'guims-purge-v3-done';

// Initialize Supabase on app load
if (isSupabaseConfigured()) {
  const sb = initSupabase();
  if (sb) {
    (async () => {
      // One-time purge: clear local + cloud data
      if (localStorage.getItem(PURGE_FLAG) !== '1') {
        purgeAllData();
        await purgeAllSupabase();
        localStorage.setItem(PURGE_FLAG, '1');
        console.log('[App] Purge complète (local + Supabase)');
      }
      // Then sync
      try {
        const result = await pullAllFromSupabase();
        if (result.success) console.log("[App] Sync Supabase OK");
        else console.warn("[App] Sync échouée:", result.error);
      } catch (err) {
        console.error("[App] Erreur sync:", err);
      }
      migrateInscriptionInstallments();
      cleanupOrphanedInstallments();
    })();
  }
} else {
  // No Supabase — purge local only
  if (localStorage.getItem(PURGE_FLAG) !== '1') {
    purgeAllData();
    localStorage.setItem(PURGE_FLAG, '1');
  }
  migrateInscriptionInstallments();
  cleanupOrphanedInstallments();
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="*" element={
              <AuthGuard>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/department/:id" element={<DepartmentPage />} />
                    <Route path="/transaction/new" element={<NewTransaction />} />
                    <Route path="/users" element={<UserManagement />} />
                    <Route path="/audit" element={<AuditLogPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/gaba/stock" element={<GabaStockPage />} />
                    <Route path="/formations" element={<FormationsPage />} />
                    <Route path="/paiements" element={<PaymentTrackingPage />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Layout>
              </AuthGuard>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </ErrorBoundary>
);

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

export default App;
