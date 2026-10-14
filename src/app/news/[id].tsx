import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';

import { Avatar, Button, confirmAsync, EmptyState, Loading, Row, Screen, showMessage, Stack, Txt } from '@/components/ui';
import { useNewsPost } from '@/hooks/data';
import { fmtDateLong, fmtTime } from '@/lib/format';
import { friendlyError, supabase } from '@/lib/supabase';
import { useClub } from '@/providers/ClubProvider';

export default function NewsPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = useNewsPost(id);
  const { memberships } = useClub();
  const qc = useQueryClient();

  if (post.isPending) return <Loading />;
  const p = post.data;
  if (!p) return <EmptyState icon="newspaper-outline" title="Post not found" />;
  const role = memberships.find((m) => m.club_id === p.club_id)?.role;
  const canEdit = role === 'owner' || role === 'admin';

  async function togglePin() {
    const { error } = await supabase.from('news_posts').update({ pinned: !p!.pinned }).eq('id', p!.id);
    if (error) return showMessage('Error', friendlyError(error));
    qc.invalidateQueries({ queryKey: ['news'] });
    post.refetch();
  }

  async function remove() {
    if (!(await confirmAsync('Delete post?', 'This cannot be undone.', 'Delete', true))) return;
    const { error } = await supabase.from('news_posts').delete().eq('id', p!.id);
    if (error) return showMessage('Error', friendlyError(error));
    qc.invalidateQueries({ queryKey: ['news'] });
    router.back();
  }

  return (
    <Screen>
      <Stack gap={16}>
        <Txt variant="display">{p.title}</Txt>
        <Row gap={10}>
          <Avatar name={p.author.display_name} url={p.author.avatar_url} size={32} />
          <Txt variant="small" muted>
            {p.author.display_name} · {fmtDateLong(p.created_at)} {fmtTime(p.created_at)}
          </Txt>
        </Row>
        <Txt style={{ fontSize: 16, lineHeight: 25 }}>{p.body}</Txt>
        {canEdit ? (
          <Row gap={8} style={{ marginTop: 16 }}>
            <Button title={p.pinned ? 'Unpin' : 'Pin'} icon="pin-outline" variant="secondary" small onPress={togglePin} />
            <Button title="Delete" icon="trash-outline" variant="danger" small onPress={remove} />
          </Row>
        ) : null}
      </Stack>
    </Screen>
  );
}
