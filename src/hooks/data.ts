import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { demoGpx } from '@/demo/backend';
import { isDemo, supabase } from '@/lib/supabase';
import type {
  AppNotification,
  Comment,
  Member,
  NewsPost,
  RideType,
  RideWithRelations,
  RouteRow,
  RsvpStatus,
  SavedLocation,
} from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

const PROFILE = 'id,display_name,avatar_url';

export const RIDE_SELECT = `*,
  club:clubs(id,name,logo_url,color),
  creator:profiles!rides_creator_id_fkey(${PROFILE}),
  rsvps:ride_rsvps(ride_id,user_id,status,subgroup_id,updated_at,profile:profiles(${PROFILE})),
  leaders:ride_leaders(user_id,profile:profiles(${PROFILE})),
  subgroups:ride_subgroups(*),
  comments:ride_comments(count),
  route:routes(id,title,preview,gpx_path,distance_km,elevation_gain_m,start_lat,start_lng)`;

const RIDE_DETAIL_SELECT = RIDE_SELECT;

function sortGroups(r: RideWithRelations): RideWithRelations {
  return { ...r, subgroups: [...(r.subgroups ?? [])].sort((a, b) => a.sort_order - b.sort_order) };
}

// ---------------------------------------------------------------------------
// Rides
// ---------------------------------------------------------------------------
export type RideRange = 'upcoming' | 'week' | 'month' | 'past';

export function useRides(opts: { clubId: string | null; range: RideRange; includePublic: boolean; type: RideType | null }) {
  const { clubId, range, includePublic, type } = opts;
  return useQuery({
    queryKey: ['rides', clubId, range, includePublic, type],
    enabled: !!clubId,
    queryFn: async () => {
      const now = Date.now();
      let q = supabase.from('rides').select(RIDE_SELECT).neq('status', 'draft');
      if (range === 'past') {
        q = q.lt('starts_at', new Date(now).toISOString()).gte('starts_at', new Date(now - 90 * 864e5).toISOString()).order('starts_at', { ascending: false });
      } else {
        // Include rides that started up to 3 hours ago (still on the road).
        q = q.gte('starts_at', new Date(now - 3 * 3600e3).toISOString()).order('starts_at');
        if (range === 'week') q = q.lte('starts_at', new Date(now + 7 * 864e5).toISOString());
        if (range === 'month') q = q.lte('starts_at', new Date(now + 31 * 864e5).toISOString());
      }
      q = includePublic ? q.or(`club_id.eq.${clubId},visibility.eq.public`) : q.eq('club_id', clubId!);
      if (type) q = q.eq('ride_type', type);
      const { data, error } = await q.limit(150);
      if (error) throw error;
      return (data as unknown as RideWithRelations[]).map(sortGroups);
    },
  });
}

export function useMyRides() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['my-rides', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: rsvps }, { data: created }] = await Promise.all([
        supabase.from('ride_rsvps').select('ride_id').eq('user_id', userId!).in('status', ['going', 'maybe']),
        supabase.from('rides').select('id').eq('creator_id', userId!),
      ]);
      const ids = [...new Set([...(rsvps ?? []).map((r) => r.ride_id), ...(created ?? []).map((r) => r.id)])];
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from('rides')
        .select(RIDE_SELECT)
        .in('id', ids)
        .gte('starts_at', new Date(Date.now() - 3 * 3600e3).toISOString())
        .order('starts_at');
      if (error) throw error;
      return (data as unknown as RideWithRelations[]).map(sortGroups);
    },
  });
}

export function useRide(id: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['ride', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('rides').select(RIDE_DETAIL_SELECT).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data ? sortGroups(data as unknown as RideWithRelations) : null;
    },
  });

  // Live participant updates.
  useEffect(() => {
    if (!id || isDemo) return;
    const channel = supabase
      .channel(`ride-rsvps-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_rsvps', filter: `ride_id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ['ride', id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc]);

  return query;
}

export function useRsvp(rideId: string) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  return useMutation({
    mutationFn: async (input: { status: RsvpStatus | null; subgroupId?: string | null }) => {
      if (input.status === null) {
        const { error } = await supabase.from('ride_rsvps').delete().eq('ride_id', rideId).eq('user_id', userId!);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('ride_rsvps').upsert({
        ride_id: rideId,
        user_id: userId!,
        status: input.status,
        subgroup_id: input.status === 'going' ? (input.subgroupId ?? null) : null,
      });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ride', rideId] });
      qc.invalidateQueries({ queryKey: ['rides'] });
      qc.invalidateQueries({ queryKey: ['my-rides'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Comments (realtime)
// ---------------------------------------------------------------------------
export function useComments(rideId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['comments', rideId],
    enabled: !!rideId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ride_comments')
        .select(`*, author:profiles(${PROFILE})`)
        .eq('ride_id', rideId!)
        .order('created_at');
      if (error) throw error;
      return data as unknown as Comment[];
    },
  });

  useEffect(() => {
    if (!rideId || isDemo) return;
    const channel = supabase
      .channel(`ride-comments-${rideId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_comments', filter: `ride_id=eq.${rideId}` }, () => {
        qc.invalidateQueries({ queryKey: ['comments', rideId] });
        qc.invalidateQueries({ queryKey: ['ride', rideId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rideId, qc]);

  return query;
}

export function usePostComment(rideId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from('ride_comments').insert({ ride_id: rideId, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', rideId] }),
  });
}

export function useDeleteComment(rideId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ride_comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', rideId] }),
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const ROUTE_LIST = 'id,club_id,owner_id,title,description,ride_type,visibility,distance_km,elevation_gain_m,elevation_loss_m,start_lat,start_lng,bbox,preview,gpx_path,created_at';

export function useRoutes(clubId: string | null) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['routes', clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const [{ data, error }, { data: favs }] = await Promise.all([
        supabase.from('routes').select(ROUTE_LIST).eq('club_id', clubId!).order('created_at', { ascending: false }),
        supabase.from('route_favorites').select('route_id').eq('user_id', userId!),
      ]);
      if (error) throw error;
      const favSet = new Set((favs ?? []).map((f) => f.route_id));
      return (data as RouteRow[]).map((r) => ({ ...r, favorite: favSet.has(r.id) }));
    },
  });
}

export function useRoute(id: string | undefined) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['route', id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data, error }, { data: fav }, { count }] = await Promise.all([
        supabase.from('routes').select(`${ROUTE_LIST}, owner:profiles!routes_owner_id_fkey(${PROFILE})`).eq('id', id!).maybeSingle(),
        supabase.from('route_favorites').select('route_id').eq('route_id', id!).eq('user_id', userId!).maybeSingle(),
        supabase.from('rides').select('id', { count: 'exact', head: true }).eq('route_id', id!),
      ]);
      if (error) throw error;
      if (!data) return null;
      return { ...(data as unknown as RouteRow & { owner: { display_name: string } }), favorite: !!fav, usedCount: count ?? 0 };
    },
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  const { userId } = useAuth();
  return useMutation({
    mutationFn: async ({ routeId, favorite }: { routeId: string; favorite: boolean }) => {
      const { error } = favorite
        ? await supabase.from('route_favorites').insert({ route_id: routeId, user_id: userId! })
        : await supabase.from('route_favorites').delete().eq('route_id', routeId).eq('user_id', userId!);
      if (error) throw error;
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ['routes'] });
      qc.invalidateQueries({ queryKey: ['route', v.routeId] });
    },
  });
}

export async function gpxSignedUrl(path: string, fileName: string) {
  if (isDemo) return `data:application/gpx+xml;base64,${btoa(demoGpx(path))}`;
  const { data, error } = await supabase.storage.from('gpx').createSignedUrl(path, 120, { download: fileName });
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------
export function useNews(clubId: string | null) {
  return useQuery({
    queryKey: ['news', clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news_posts')
        .select(`*, author:profiles!news_posts_author_id_fkey(${PROFILE})`)
        .eq('club_id', clubId!)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as NewsPost[];
    },
  });
}

export function useNewsPost(id: string | undefined) {
  return useQuery({
    queryKey: ['news-post', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news_posts')
        .select(`*, author:profiles!news_posts_author_id_fkey(${PROFILE})`)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as NewsPost | null;
    },
  });
}

// ---------------------------------------------------------------------------
// Members & locations
// ---------------------------------------------------------------------------
export function useMembers(clubId: string | null) {
  return useQuery({
    queryKey: ['members', clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('club_members')
        .select(`club_id,user_id,role,status,requested_at, profile:profiles!club_members_user_id_fkey(${PROFILE},city)`)
        .eq('club_id', clubId!)
        .neq('status', 'rejected')
        .order('requested_at');
      if (error) throw error;
      const order = { owner: 0, admin: 1, leader: 2, member: 3 };
      return (data as unknown as Member[]).sort(
        (a, b) => order[a.role] - order[b.role] || a.profile.display_name.localeCompare(b.profile.display_name),
      );
    },
  });
}

export function useSavedLocations(clubId: string | null) {
  return useQuery({
    queryKey: ['locations', clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await supabase.from('saved_locations').select('*').eq('club_id', clubId!).order('name');
      if (error) throw error;
      return data as SavedLocation[];
    },
  });
}

// ---------------------------------------------------------------------------
// Notifications (realtime)
// ---------------------------------------------------------------------------
export function useNotifications() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as AppNotification[];
    },
  });

  useEffect(() => {
    if (!userId || isDemo) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ['notifications', userId] });
        qc.invalidateQueries({ queryKey: ['rides'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return query;
}

export function useMarkNotificationsRead() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      let q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId!).is('read_at', null);
      if (ids) q = q.in('id', ids);
      const { error } = await q;
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications', userId] }),
  });
}
