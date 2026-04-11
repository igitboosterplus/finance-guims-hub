import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getCurrentUser, initDefaultSuperAdmin, logout as doLogout, type User } from '@/lib/auth';
import { pullAllFromSupabase, pushAllToSupabase } from '@/lib/sync';
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
      // 1. One-time force push: local → Supabase to fix corrupted cloud data
      const FORCE_PUSH_FLAG = 'guims-force-push-v3';
      if (isSupabaseConfigured() && localStorage.getItem(FORCE_PUSH_FLAG) !== '1') {
        try {
          await pushAllToSupabase();
          console.log("[Auth] Force push local → Supabase done");
        } catch (err) {
          console.error("[Auth] Force push error:", err);
        }
        localStorage.setItem(FORCE_PUSH_FLAG, '1');
      }

      // 2. Pull from Supabase (get accounts/data created on other devices)
      if (isSupabaseConfigured()) {
        try {
          const result = await pullAllFromSupabase();
          if (result.success) console.log("[Auth] Sync Supabase OK");
          else console.warn("[Auth] Sync échouée:", result.error);
        } catch (err) {
          console.error("[Auth] Erreur sync:", err);
        }
      }

      // 3. Init superadmin AFTER pull (only creates if no users exist locally or on Supabase)
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

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
