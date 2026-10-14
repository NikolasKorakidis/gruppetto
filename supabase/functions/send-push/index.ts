// Sends an Expo push notification for every row inserted into public.notifications.
// Wire it up with a Database Webhook (see README): table `notifications`, event INSERT,
// HTTP header `x-webhook-secret: <PUSH_WEBHOOK_SECRET>`.
import { adminClient, json } from '../_shared/admin.ts';

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  ride_id: string | null;
  club_id: string | null;
  data: Record<string, unknown>;
};

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }

  const payload = await req.json();
  const n = payload?.record as NotificationRow | undefined;
  if (payload?.type !== 'INSERT' || !n?.user_id) return json({ skipped: true });

  const db = adminClient();
  const { data: tokens, error } = await db
    .from('push_tokens')
    .select('token')
    .eq('user_id', n.user_id)
    .neq('platform', 'web');
  if (error) return json({ error: error.message }, 500);
  if (!tokens?.length) return json({ sent: 0 });

  const url = n.ride_id
    ? `/ride/${n.ride_id}`
    : n.data?.post_id
      ? `/news/${n.data.post_id}`
      : '/notifications';

  const messages = tokens.map((t) => ({
    to: t.token,
    title: n.title,
    body: n.body ?? undefined,
    sound: 'default',
    data: { url, notificationId: n.id },
  }));

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
  });
  const result = await res.json();

  // Clean up tokens of uninstalled apps.
  const dead: string[] = [];
  (result?.data ?? []).forEach((ticket: { status: string; details?: { error?: string } }, i: number) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      dead.push(messages[i].to);
    }
  });
  if (dead.length) await db.from('push_tokens').delete().in('token', dead);

  return json({ sent: messages.length, removed: dead.length });
});
