import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, ShieldCheck, Shield, UserCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b bg-card px-2 sm:px-4 gap-1 sm:gap-3">
            <SidebarTrigger className="mr-1 sm:mr-2" />
            <h1 className="text-base sm:text-lg font-semibold text-foreground flex-1 truncate">Guims Finance</h1>
            {user && (
              <div className="flex items-center gap-1 sm:gap-3">
                <div className="flex items-center gap-1 sm:gap-2">
                  {user.role === 'superadmin' ? (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] sm:text-xs px-1.5 sm:px-2">
                      <ShieldCheck className="h-3 w-3 mr-0.5 sm:mr-1" /> <span className="hidden sm:inline">Super Admin</span><span className="sm:hidden">SA</span>
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2">
                      <Shield className="h-3 w-3 mr-0.5 sm:mr-1" /> <span className="hidden sm:inline">Admin</span>
                    </Badge>
                  )}
                  <span className="text-sm font-medium text-foreground hidden sm:inline">{user.displayName}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground" onClick={() => navigate('/profile')} title="Mon profil">
                  <UserCircle className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground" onClick={logout} title="Déconnexion">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            )}
            <ThemeToggle />
          </header>
          <main className="flex-1 p-3 sm:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
