import type { RideType } from './types';

const LOCALE = 'en-GB';

export const RIDE_TYPES: { value: RideType; label: string; icon: string }[] = [
  { value: 'road', label: 'Road', icon: 'bicycle' },
  { value: 'gravel', label: 'Gravel', icon: 'trail-sign' },
  { value: 'mtb', label: 'MTB', icon: 'leaf' },
  { value: 'cx', label: 'Cyclocross', icon: 'git-branch' },
  { value: 'ebike', label: 'E-bike', icon: 'flash' },
  { value: 'training', label: 'Training', icon: 'stopwatch' },
  { value: 'tour', label: 'Tour', icon: 'map' },
  { value: 'social', label: 'Social', icon: 'cafe' },
];

export const rideTypeLabel = (t: RideType) => RIDE_TYPES.find((r) => r.value === t)?.label ?? t;
export const rideTypeIcon = (t: RideType) => RIDE_TYPES.find((r) => r.value === t)?.icon ?? 'bicycle';

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

export const fmtDateLong = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

export const fmtDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });

export const fmtWeekday = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { weekday: 'short' });
export const fmtDayNum = (iso: string) => new Date(iso).getDate().toString();
export const fmtMonth = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { month: 'short' });

export function fmtDuration(minutes: number | null | undefined) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m.toString().padStart(2, '0')}m` : ''}` : `${m}m`;
}

export const fmtKm = (km: number | null | undefined) =>
  km == null ? null : `${Number(km) % 1 === 0 ? Number(km) : Number(km).toFixed(1)} km`;

export function fmtRelative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

/** Group key used to put section headers in the ride feed. */
export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(d) - start(today)) / 864e5);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days < 7) return d.toLocaleDateString(LOCALE, { weekday: 'long' });
  return fmtDateLong(iso);
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

export const estimateMinutes = (distanceKm: number, speedKmh: number) =>
  distanceKm > 0 && speedKmh > 0 ? Math.round((distanceKm / speedKmh) * 60) : null;

export const ROLE_LABEL: Record<'owner' | 'admin' | 'leader' | 'member', string> = {
  owner: 'Owner',
  admin: 'Admin',
  leader: 'Ride leader',
  member: 'Member',
};
