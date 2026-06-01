import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { getCurrentUser, initDefaultSuperAdmin, logout as doLogout, syncSessionFromSupabase, type User } from '@/lib/auth';
import { flushPendingSyncOps, pullAllFromSupabase } from '@/lib/sync';
import { getSupabase, isSupabaseConfigured, TABLES } from '@/lib/firebase';
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
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef<Promise<void> | null>(null);

  const refresh = () => {
    setUser(getCurrentUser());
  };

  const doSync = useCallback(async () => {
    if (syncInFlightRef.current) {
      await syncInFlightRef.current;
      return;
    }

    const run = (async () => {
    if (!isSupabaseConfigured()) return;
    try {
      await flushPendingSyncOps();
      const result = await pullAllFromSupabase();
      if (result.success) console.log("[Sync] Auto-sync OK");
      else console.warn("[Sync] Auto-sync échouée:", result.error);
      await syncSessionFromSupabase();
      refresh();
    } catch (err) {
      console.error("[Sync] Erreur auto-sync:", err);
    }
    })();

    syncInFlightRef.current = run;
    try {
      await run;
    } finally {
      syncInFlightRef.current = null;
    }
  }, []);

  const scheduleSync = useCallback(() => {
    if (!isSupabaseConfigured()) return;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      void doSync();
    }, 250);
  }, [doSync]);

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
          await syncSessionFromSupabase();
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
      const onStorage = () => scheduleSync();
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') scheduleSync();
      };
      const onOnline = () => scheduleSync();
      const supabase = getSupabase();
      const channel = supabase
        ? supabase
            .channel('guims-shared-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.paymentPlans }, scheduleSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.formationsCatalog }, scheduleSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.enrollments }, scheduleSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.transactions }, scheduleSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.stockItems }, scheduleSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.stockMovements }, scheduleSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.stockKits }, scheduleSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.users }, scheduleSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.employees }, scheduleSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.auditLog }, scheduleSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.superAudit }, scheduleSync)
            .subscribe()
        : null;
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('online', onOnline);
      window.addEventListener('storage', onStorage);
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('storage', onStorage);
        if (channel) {
          void channel.unsubscribe();
        }
        if (syncTimerRef.current) {
          clearTimeout(syncTimerRef.current);
          syncTimerRef.current = null;
        }
      };
    }
  }, [doSync, scheduleSync]);

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
