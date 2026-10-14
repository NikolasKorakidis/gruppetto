import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { Banner, Button, Input, Screen, Stack, ToggleRow, Txt } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { useClub } from '@/providers/ClubProvider';

export default function NewPost() {
  const { club } = useClub();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    if (title.trim().length < 2 || !body.trim()) return setError('Add a title and a message.');
    setBusy(true);
    const { error } = await supabase.from('news_posts').insert({ club_id: club!.id, title: title.trim(), body: body.trim(), pinned });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    qc.invalidateQueries({ queryKey: ['news'] });
    router.back();
  }

  return (
    <Screen>
      <Stack gap={16}>
        <Txt muted>Posting to {club?.name}. Members get a notification.</Txt>
        <Input label="Title" value={title} onChangeText={setTitle} maxLength={140} placeholder="e.g. Winter schedule starts Sunday" />
        <Input label="Message" value={body} onChangeText={setBody} multiline maxLength={10000} style={{ minHeight: 200 }} />
        <ToggleRow icon="pin-outline" label="Pin to top" value={pinned} onChange={setPinned} />
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Button title="Publish" icon="paper-plane-outline" onPress={publish} loading={busy} />
      </Stack>
    </Screen>
  );
}
