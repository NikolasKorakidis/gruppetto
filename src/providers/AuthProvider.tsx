import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { listenForNotificationTaps, registerForPush, unregisterPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type AuthState = {
  session: Session | null;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  /** True until the stored session has been read. */
  initializing: boolean;
  profileLoading: boolean;
  refreshProfile: () => Promise<unknown>;
  signOut: () => Promise<void>;
  /** While true the app only shows the "choose a new password" screen. */
  recovering: boolean;
  setRecovering: (v: boolean) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const pushToken = useRef<string | null>(null);
  const qc = useQueryClient();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') {
        setRecovering(false);
        qc.clear();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  // Push registration + notification tap routing for signed-in users.
  useEffect(() => {
    if (!userId) return;
    registerForPush(userId).then((t) => (pushToken.current = t));
    return listenForNotificationTaps();
  }, [userId]);

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const value: AuthState = {
    session,
    userId,
    email: session?.user.email ?? null,
    profile: profileQuery.data ?? null,
    initializing,
    profileLoading: !!userId && profileQuery.isPending,
    refreshProfile: () => profileQuery.refetch(),
    recovering: !!session && recovering,
    setRecovering,
    signOut: async () => {
      await unregisterPush(pushToken.current);
      pushToken.current = null;
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
