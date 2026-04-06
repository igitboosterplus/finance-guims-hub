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
import NotFound from "./pages/NotFound.tsx";
import { initSupabase, isSupabaseConfigured } from "@/lib/firebase";
import { pullAllFromSupabase } from "@/lib/sync";

// Initialize Supabase on app load
if (isSupabaseConfigured()) {
  const sb = initSupabase();
  if (sb) {
    pullAllFromSupabase().then(result => {
      if (result.success) console.log("[App] Données synchronisées depuis Supabase");
      else console.warn("[App] Sync échouée:", result.error);
    });
  }
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
