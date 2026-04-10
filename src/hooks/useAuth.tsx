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
      // 1. Init superadmin (creates if needed, deduplicates, cleans up)
      await initDefaultSuperAdmin();

      // 2. Sync with Supabase (sequential — no race condition)
      if (isSupabaseConfigured()) {
        try {
          const result = await pullAllFromSupabase();
          if (result.success) console.log("[Auth] Sync Supabase OK");
          else console.warn("[Auth] Sync échouée:", result.error);
        } catch (err) {
          console.error("[Auth] Erreur sync:", err);
        }
      }

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
