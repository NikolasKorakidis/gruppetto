import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import type { Club, ClubRole, Membership } from '@/lib/types';

import { useAuth } from './AuthProvider';

const STORAGE_KEY = 'gruppetto.activeClub';

function readStored(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

type ClubState = {
  memberships: Membership[];
  activeMemberships: Membership[];
  pendingMemberships: Membership[];
  club: Club | null;
  role: ClubRole | null;
  isAdmin: boolean;
  canLead: boolean;
  loading: boolean;
  setActiveClub: (id: string) => void;
  refetch: () => Promise<unknown>;
};

const ClubContext = createContext<ClubState | null>(null);

export function ClubProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [selected, setSelected] = useState<string | null>(readStored);

  const q = useQuery({
    queryKey: ['memberships', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('club_members')
        .select('club_id, user_id, role, status, requested_at, club:clubs(*)')
        .eq('user_id', userId!)
        .order('requested_at');
      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
  });

  const value = useMemo<ClubState>(() => {
    const memberships = (q.data ?? []).filter((m) => m.club);
    const active = memberships.filter((m) => m.status === 'active');
    const current = active.find((m) => m.club_id === selected) ?? active[0] ?? null;
    const role = current?.role ?? null;
    return {
      memberships,
      activeMemberships: active,
      pendingMemberships: memberships.filter((m) => m.status === 'pending'),
      club: current?.club ?? null,
      role,
      isAdmin: role === 'owner' || role === 'admin',
      canLead: role === 'owner' || role === 'admin' || role === 'leader',
      loading: !!userId && q.isPending,
      setActiveClub: (id) => {
        setSelected(id);
        try {
          localStorage.setItem(STORAGE_KEY, id);
        } catch {
          // storage unavailable: selection lasts for this session only
        }
      },
      refetch: () => q.refetch(),
    };
  }, [q, selected, userId]);

  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

export function useClub() {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error('useClub must be used inside ClubProvider');
  return ctx;
}
