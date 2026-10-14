import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Linking, Platform } from 'react-native';

import { space } from '@/components/theme';
import { Banner, Button, Card, confirmAsync, Loading, Screen, showMessage, Stack, Txt } from '@/components/ui';
import { friendlyError, isDemo, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

const FUNCTIONS_URL = isDemo
  ? 'https://your-project.supabase.co/functions/v1/calendar'
  : `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/calendar`;

export default function CalendarSync() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const token = useQuery({
    queryKey: ['calendar-token', userId],
    queryFn: async () => {
      const { data } = await supabase.from('calendar_tokens').select('token').eq('user_id', userId!).maybeSingle();
      return (data?.token as string | undefined) ?? null;
    },
  });

  async function rotate(confirm: boolean) {
    if (confirm && !(await confirmAsync('Create a new link?', 'Calendars subscribed with the old link stop updating.', 'Create'))) return;
    const { error } = await supabase.rpc('rotate_calendar_token');
    if (error) return showMessage('Error', friendlyError(error));
    qc.invalidateQueries({ queryKey: ['calendar-token', userId] });
  }

  if (token.isPending) return <Loading />;
  const https = token.data ? `${FUNCTIONS_URL}?token=${token.data}` : null;
  const webcal = https?.replace(/^https?:/, 'webcal:');

  return (
    <Screen>
      <Stack gap={space.lg}>
        <Txt variant="title">Your rides in your calendar</Txt>
        <Txt muted>
          Subscribe once and every ride from your clubs appears in Apple Calendar, Google Calendar or Outlook — with your status (✓ going, ? maybe),
          start location and route stats. Changes and cancellations update automatically.
        </Txt>
        {!https ? (
          <Button title="Create my calendar link" icon="calendar-outline" onPress={() => rotate(false)} />
        ) : (
          <>
            <Card>
              <Txt variant="small" selectable style={{ fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }}>
                {https}
              </Txt>
            </Card>
            <Button title="Subscribe on this device" icon="add-circle-outline" onPress={() => Linking.openURL(webcal!)} />
            <Button
              title="Copy link"
              icon="copy-outline"
              variant="secondary"
              onPress={async () => {
                await Clipboard.setStringAsync(https);
                showMessage('Copied', 'Google Calendar: Other calendars → + → From URL → paste.');
              }}
            />
            {isDemo ? <Banner tone="warn" icon="flask">Demo: the link becomes live once Supabase is connected.</Banner> : null}
            <Banner icon="lock-closed">This link is private. Anyone with it can see your club’s ride schedule.</Banner>
            <Button title="Reset link" variant="ghost" small onPress={() => rotate(true)} />
          </>
        )}
      </Stack>
    </Screen>
  );
}
