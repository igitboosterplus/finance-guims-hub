import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getCurrentUser, initDefaultSuperAdmin, logout as doLogout, type User } from '@/lib/auth';
import { pullAllFromSupabase } from '@/lib/sync';
import { isSupabaseConfigured } from '@/lib/firebase';
import { migrateInscriptionInstallments, cleanupOrphanedInstallments } from '@/lib/stock';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  refresh: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setUser(getCurrentUser());
  };

  useEffect(() => {
    (async () => {
      // 1. Pull from Supabase (get accounts/data created on other devices)
      // Pull is always safe: if Supabase has data → use it; if empty → local data preserved + pushed
      if (isSupabaseConfigured()) {
        try {
          const result = await pullAllFromSupabase();
          if (result.success) console.log("[Auth] Sync Supabase OK");
          else console.warn("[Auth] Sync échouée:", result.error);
        } catch (err) {
          console.error("[Auth] Erreur sync:", err);
        }
      }

      // 2. Init superadmin AFTER pull (only creates if no users exist locally or on Supabase)
      await initDefaultSuperAdmin();

      // 3. Migrations
      migrateInscriptionInstallments();
      cleanupOrphanedInstallments();

      // 4. Load current session
      refresh();
      setLoading(false);
    })();
  }, []);

  const logout = () => {
    doLogout();
    setUser(null);
  };

  // Session timeout: auto-logout after 2h of inactivity
  useEffect(() => {
    if (!user) return;
    const SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours
    let timer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        console.log("[Auth] Session expirée par inactivité");
        logout();
      }, SESSION_TIMEOUT);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
