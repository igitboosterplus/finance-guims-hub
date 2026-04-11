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
                    <Route path="/super-audit" element={<SuperAuditPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/gaba/stock" element={<GabaStockPage key="gaba" />} />
                    <Route path="/guims-academy/stock" element={<GabaStockPage key="guims-academy" departmentId="guims-academy" />} />
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
