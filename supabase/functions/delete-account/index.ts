// Permanently deletes the calling user's account (GDPR "right to erasure").
// Cascades remove profile, memberships, RSVPs, comments, tokens, notifications.
// Clubs where the user is the only member are deleted; clubs where they are the
// only owner get the longest-standing admin (or member) promoted to owner.
import { adminClient, corsHeaders, json } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);

  const db = adminClient();
  const { data: userData, error: userError } = await db.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  const { data: owned } = await db
    .from('club_members')
    .select('club_id')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .eq('status', 'active');

  for (const { club_id } of owned ?? []) {
    const { data: others } = await db
      .from('club_members')
      .select('user_id, role, requested_at')
      .eq('club_id', club_id)
      .eq('status', 'active')
      .neq('user_id', userId)
      .order('requested_at', { ascending: true });

    if (!others?.length) {
      await db.from('clubs').delete().eq('id', club_id);
      continue;
    }
    if (others.some((m) => m.role === 'owner')) continue;
    const heir = others.find((m) => m.role === 'admin') ?? others[0];
    await db.from('club_members').update({ role: 'owner' }).eq('club_id', club_id).eq('user_id', heir.user_id);
  }

  // Remove the user's uploaded avatar files.
  const { data: files } = await db.storage.from('avatars').list(userId);
  if (files?.length) {
    await db.storage.from('avatars').remove(files.map((f) => `${userId}/${f.name}`));
  }

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return json({ error: error.message }, 500);
  return json({ deleted: true });
});
