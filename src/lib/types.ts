export type ClubRole = 'owner' | 'admin' | 'leader' | 'member';
export type MembershipStatus = 'pending' | 'active' | 'rejected';
export type RideType = 'road' | 'gravel' | 'mtb' | 'cx' | 'ebike' | 'social' | 'training' | 'tour';
export type RideVisibility = 'club' | 'public';
export type RideStatus = 'draft' | 'published' | 'cancelled' | 'completed';
export type RsvpStatus = 'going' | 'maybe' | 'not_going';

export type NotifyPrefs = { ride_new: boolean; ride_changed: boolean; comment: boolean; news: boolean };

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  notify_prefs: NotifyPrefs;
  onboarded: boolean;
};

export type ProfileLite = Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;

export type ProfilePrivate = {
  user_id: string;
  phone: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
};

export type Club = {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  logo_url: string | null;
  color: string;
  invite_code: string;
  requires_approval: boolean;
  is_discoverable: boolean;
  timezone: string;
  created_by: string;
};

export type ClubLite = Pick<Club, 'id' | 'name' | 'logo_url' | 'color'>;

export type Membership = {
  club_id: string;
  user_id: string;
  role: ClubRole;
  status: MembershipStatus;
  requested_at: string;
  club: Club;
};

export type Member = {
  club_id: string;
  user_id: string;
  role: ClubRole;
  status: MembershipStatus;
  requested_at: string;
  profile: ProfileLite & { city: string | null };
};

export type Subgroup = {
  id: string;
  ride_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  max_participants: number | null;
};

export type Rsvp = {
  ride_id: string;
  user_id: string;
  status: RsvpStatus;
  subgroup_id: string | null;
  updated_at: string;
  profile: ProfileLite;
};

export type RouteRow = {
  id: string;
  club_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  ride_type: RideType | null;
  visibility: RideVisibility;
  distance_km: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  start_lat: number | null;
  start_lng: number | null;
  bbox: number[] | null;
  preview: [number, number][] | null;
  gpx_path: string | null;
  created_at: string;
};

export type Ride = {
  id: string;
  club_id: string;
  creator_id: string;
  published_as_club: boolean;
  title: string;
  description: string | null;
  ride_type: RideType;
  starts_at: string;
  distance_km: number | null;
  avg_speed_kmh: number | null;
  duration_minutes: number | null;
  elevation_gain_m: number | null;
  start_name: string | null;
  start_address: string | null;
  start_lat: number | null;
  start_lng: number | null;
  has_stopover: boolean;
  stopover_note: string | null;
  visibility: RideVisibility;
  status: RideStatus;
  route_id: string | null;
  max_participants: number | null;
  allow_maybe: boolean;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type RideWithRelations = Ride & {
  club: ClubLite;
  creator: ProfileLite;
  rsvps: Rsvp[];
  leaders: { user_id: string; profile: ProfileLite }[];
  subgroups: Subgroup[];
  comments: { count: number }[];
  route: Pick<RouteRow, 'id' | 'title' | 'preview' | 'gpx_path' | 'distance_km' | 'elevation_gain_m' | 'start_lat' | 'start_lng'> | null;
};

export type Comment = {
  id: string;
  ride_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  author: ProfileLite;
};

export type NewsPost = {
  id: string;
  club_id: string;
  author_id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  author: ProfileLite;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  club_id: string | null;
  ride_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type SavedLocation = {
  id: string;
  club_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
};
