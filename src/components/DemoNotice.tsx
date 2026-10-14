import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { DEMO_EMAIL, DEMO_INVITE, DEMO_PASSWORD } from '@/demo/seed';
import { friendlyError, isDemo, supabase } from '@/lib/supabase';

import { radius, space, useTheme } from './theme';
import { Button, Icon, Row, Txt } from './ui';

/** Sign-in shortcut shown only in demo mode. */
export function DemoSignIn() {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isDemo) return null;
  return (
    <View style={{ backgroundColor: c.hero, borderRadius: radius.xl, padding: space.lg, gap: space.md }}>
      <Row gap={8}>
        <Icon name="flask" size={16} color={c.lime} />
        <Txt variant="label" color={c.lime}>
          Demo
        </Txt>
      </Row>
      <Txt color="#fff" style={{ fontWeight: '600' }}>
        Explore with sample clubs, rides and riders. Everything stays on this device.
      </Txt>
      <Button
        title="Try it as Jordan"
        variant="lime"
        icon="arrow-forward"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
          setBusy(false);
          if (error) setError(friendlyError(error));
        }}
      />
      {error ? <Txt color={c.danger}>{error}</Txt> : null}
      <Txt variant="small" color="rgba(255,255,255,0.6)">
        Or create your own account below: any 6-digit code confirms it in the demo.
      </Txt>
    </View>
  );
}

/** Small inline hint for demo-only shortcuts (e.g. the code to use). */
export function DemoHint({ children }: { children: string }) {
  const { c } = useTheme();
  if (!isDemo) return null;
  return (
    <Row gap={8} style={{ backgroundColor: c.subtle, padding: space.md, borderRadius: radius.md }}>
      <Icon name="flask-outline" size={16} color={c.brand} />
      <Txt variant="small" style={{ flex: 1, fontWeight: '600' }}>
        {children}
      </Txt>
    </Row>
  );
}

export function DemoInviteHint({ onUse }: { onUse: (code: string) => void }) {
  const { c } = useTheme();
  if (!isDemo) return null;
  return (
    <Pressable onPress={() => onUse(DEMO_INVITE)}>
      <Row gap={8} style={{ backgroundColor: c.subtle, padding: space.md, borderRadius: radius.md }}>
        <Icon name="flask-outline" size={16} color={c.brand} />
        <Txt variant="small" style={{ flex: 1, fontWeight: '600' }}>
          Demo: use invite code {DEMO_INVITE} (Northside Cycling Club)
        </Txt>
        <Txt variant="small" color={c.brand} style={{ fontWeight: '800' }}>
          Use
        </Txt>
      </Row>
    </Pressable>
  );
}
