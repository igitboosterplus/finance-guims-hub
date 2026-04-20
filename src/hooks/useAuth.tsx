import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getCurrentUser, initDefaultSuperAdmin, logout as doLogout, type User } from '@/lib/auth';
import { pullAllFromSupabase } from '@/lib/sync';
import { isSupabaseConfigured } from '@/lib/firebase';
import { migrateInscriptionInstallments, cleanupOrphanedInstallments } from '@/lib/stock';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  syncing: boolean;
  refresh: () => void;
  logout: () => void;
  forceSync: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  syncing: false,
  refresh: () => {},
  logout: () => {},
  forceSync: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refresh = () => {
    setUser(getCurrentUser());
  };

  const doSync = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const result = await pullAllFromSupabase();
      if (result.success) console.log("[Sync] Auto-sync OK");
      else console.warn("[Sync] Auto-sync échouée:", result.error);
    } catch (err) {
      console.error("[Sync] Erreur auto-sync:", err);
    }
  };

  const forceSync = async () => {
    setSyncing(true);
    try {
      await doSync();
      refresh();
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    (async () => {
      // 1. Pull from Supabase (get accounts/data created on other devices)
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

    // 5. Periodic sync every 30 seconds + sync when tab becomes visible
    if (isSupabaseConfigured()) {
      const interval = setInterval(doSync, 30_000);
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') doSync();
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    }
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
    <AuthContext.Provider value={{ user, loading, syncing, refresh, logout, forceSync }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
