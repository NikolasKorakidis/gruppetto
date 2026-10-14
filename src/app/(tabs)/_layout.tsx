import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { elevation, font, useTheme } from '@/components/theme';
import type { IconName } from '@/components/ui';

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: 52,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? c.lime : 'transparent',
      }}>
      <Ionicons name={name} size={21} color={focused ? c.onLime : c.faint} />
    </View>
  );
}

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', title: 'Rides', icon: 'bicycle-outline', iconActive: 'bicycle' },
  { name: 'news', title: 'News', icon: 'newspaper-outline', iconActive: 'newspaper' },
  { name: 'routes', title: 'Routes', icon: 'map-outline', iconActive: 'map' },
  { name: 'club', title: 'Club', icon: 'people-outline', iconActive: 'people' },
  { name: 'more', title: 'More', icon: 'grid-outline', iconActive: 'grid' },
];

export default function TabLayout() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.ink,
        tabBarInactiveTintColor: c.faint,
        tabBarStyle: { backgroundColor: c.card, borderTopWidth: 0, height: 68 + insets.bottom, paddingTop: 8, paddingBottom: insets.bottom + 8, ...elevation(c, 2) },
        tabBarLabelStyle: { ...font('700'), fontSize: 11, marginTop: 2 },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarIcon: ({ focused }) => <TabIcon name={focused ? t.iconActive : t.icon} focused={focused} /> }}
        />
      ))}
    </Tabs>
  );
}
