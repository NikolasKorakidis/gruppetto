import { Redirect, useLocalSearchParams } from 'expo-router';

import { rememberInvite } from '@/lib/links';
import { useAuth } from '@/providers/AuthProvider';

/** Invite link target: /join/ABCD2345 */
export default function InviteLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session } = useAuth();
  const clean = (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!session) {
    if (clean) rememberInvite(clean);
    return <Redirect href="/sign-up" />;
  }
  return <Redirect href={{ pathname: '/club/join', params: { code: clean } }} />;
}
