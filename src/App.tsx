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
import SuperAuditPage from "@/pages/SuperAuditPage";
import ProfilePage from "@/pages/ProfilePage";
import GabaStockPage from "@/pages/GabaStockPage";
import FormationsPage from "@/pages/FormationsPage";
import PaymentTrackingPage from "@/pages/PaymentTrackingPage";
import NotFound from "./pages/NotFound.tsx";
import { initSupabase, isSupabaseConfigured } from "@/lib/firebase";
import { hasDepartmentAccess, hasPermission } from "@/lib/auth";

// Initialize Supabase on app load — sync is done in AuthProvider
if (isSupabaseConfigured()) {
  initSupabase();
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

function DeptGuard({ departmentId, children }: { departmentId: string; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!hasDepartmentAccess(user, departmentId)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PermGuard({ perm, children }: { perm: 'canManageUsers' | 'canViewAudit' | 'canViewSuperAudit'; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!hasPermission(user, perm)) return <Navigate to="/" replace />;
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
                    <Route path="/users" element={<PermGuard perm="canManageUsers"><UserManagement /></PermGuard>} />
                    <Route path="/audit" element={<PermGuard perm="canViewAudit"><AuditLogPage /></PermGuard>} />
                    <Route path="/super-audit" element={<PermGuard perm="canViewSuperAudit"><SuperAuditPage /></PermGuard>} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/gaba/stock" element={<DeptGuard departmentId="gaba"><GabaStockPage key="gaba" /></DeptGuard>} />
                    <Route path="/guims-academy/stock" element={<DeptGuard departmentId="guims-academy"><GabaStockPage key="guims-academy" departmentId="guims-academy" /></DeptGuard>} />
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
