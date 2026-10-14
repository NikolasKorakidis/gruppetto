import { router } from 'expo-router';

import { CreateClubForm } from '@/components/ClubForms';
import { Screen, Stack, Txt } from '@/components/ui';

export default function NewClub() {
  return (
    <Screen>
      <Stack gap={16}>
        <Txt muted>Start a club or a small riding group. You’ll be the owner and can invite others with a code, link or QR.</Txt>
        <CreateClubForm onCreated={() => router.replace('/club/manage')} />
      </Stack>
    </Screen>
  );
}
