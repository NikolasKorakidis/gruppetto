import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNotifications } from '@/hooks/data';
import { ROLE_LABEL } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { useClub } from '@/providers/ClubProvider';

import { MAX_WIDTH, radius, space, useTheme } from './theme';
import { Avatar, Button, ClubLogo, Icon, IconButton, Row, Sheet, Stack, Txt } from './ui';

/** Dark hero header: club switcher, notifications, profile, optional title and extra content. */
export function ClubHeader({ title, subtitle, children }: { title?: string; subtitle?: string; children?: ReactNode }) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { club, activeMemberships, pendingMemberships, setActiveClub } = useClub();
  const { data: notifications } = useNotifications();
  const [open, setOpen] = useState(false);
  const unread = notifications?.filter((n) => !n.read_at).length ?? 0;
  const glow = club?.color ?? c.brand;

  // Light status bar text over the dark header while this screen is visible.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(isDark ? 'light' : 'dark');
    }, [isDark]),
  );

  return (
    <View style={{ backgroundColor: c.hero, paddingTop: insets.top + space.sm, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' }}>
      <LinearGradient
        colors={[`${glow}AA`, `${glow}22`, 'transparent']}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.lg }}>
        <Row gap={space.sm}>
          <Pressable
            onPress={() => setOpen(true)}
            accessibilityLabel="Switch club"
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: radius.pill,
              paddingVertical: 6,
              paddingLeft: 6,
              paddingRight: 14,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}>
            {club ? <ClubLogo name={club.name} url={club.logo_url} color={club.color} size={30} /> : null}
            <Txt variant="h3" numberOfLines={1} style={{ flex: 1 }} color={c.onHero}>
              {club?.name ?? 'Choose a club'}
            </Txt>
            <Icon name="chevron-down" size={16} color={c.onHeroMuted} />
          </Pressable>
          <IconButton
            icon="notifications-outline"
            label="Notifications"
            badge={unread}
            onPress={() => router.push('/notifications')}
            bg="rgba(255,255,255,0.1)"
            color={c.onHero}
            size={42}
          />
          <Pressable onPress={() => router.push('/profile')} accessibilityLabel="Your profile">
            <Avatar name={profile?.display_name ?? '?'} url={profile?.avatar_url} size={42} ring="rgba(255,255,255,0.25)" />
          </Pressable>
        </Row>

        {title ? (
          <View style={{ gap: 4 }}>
            <Txt variant="hero" color={c.onHero}>
              {title}
            </Txt>
            {subtitle ? <Txt color={c.onHeroMuted} style={{ fontWeight: '500' }}>{subtitle}</Txt> : null}
          </View>
        ) : null}

        {children}
      </View>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Your clubs">
        <Stack gap={8}>
          {activeMemberships.map((m) => {
            const selected = m.club_id === club?.id;
            return (
              <Pressable
                key={m.club_id}
                onPress={() => {
                  setActiveClub(m.club_id);
                  setOpen(false);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: radius.lg,
                  backgroundColor: selected ? c.brandSoft : c.subtle,
                }}>
                <ClubLogo name={m.club.name} url={m.club.logo_url} color={m.club.color} size={42} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3">{m.club.name}</Txt>
                  <Txt variant="small" muted>
                    {ROLE_LABEL[m.role]}
                    {m.club.city ? ` · ${m.club.city}` : ''}
                  </Txt>
                </View>
                {selected ? <Icon name="checkmark-circle" size={24} color={c.brand} /> : null}
              </Pressable>
            );
          })}
          {pendingMemberships.map((m) => (
            <Row key={m.club_id} gap={12} style={{ padding: 12, opacity: 0.65 }}>
              <ClubLogo name={m.club.name} url={m.club.logo_url} color={m.club.color} size={42} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">{m.club.name}</Txt>
                <Txt variant="small" muted>
                  Waiting for approval
                </Txt>
              </View>
              <Icon name="hourglass-outline" size={20} color={c.muted} />
            </Row>
          ))}
          <Row gap={8} style={{ marginTop: 8 }}>
            <Button
              title="Join a club"
              icon="enter-outline"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => {
                setOpen(false);
                router.push('/club/join');
              }}
            />
            <Button
              title="New club"
              icon="add"
              style={{ flex: 1 }}
              onPress={() => {
                setOpen(false);
                router.push('/club/new');
              }}
            />
          </Row>
        </Stack>
      </Sheet>
    </View>
  );
}
