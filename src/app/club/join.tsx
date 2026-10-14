import { router, useLocalSearchParams } from 'expo-router';

import { JoinClubForm } from '@/components/ClubForms';
import { Screen, Stack, Txt } from '@/components/ui';

export default function JoinClub() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return (
    <Screen>
      <Stack gap={16}>
        <Txt muted>Enter the invite code from your club admin. You can be a member of several clubs.</Txt>
        <JoinClubForm
          initialCode={code ?? ''}
          onJoined={(_, status) => {
            if (status === 'active') router.replace('/');
          }}
        />
      </Stack>
    </Screen>
  );
}
