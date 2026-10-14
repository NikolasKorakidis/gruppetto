import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text } from 'react-native';

import { elevation, font, radius, useTheme } from './theme';
import type { IconName } from './ui';

/** Floating lime action button. */
export function Fab({ label, icon = 'add', onPress }: { label: string; icon?: IconName; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        {
          position: 'absolute',
          right: 18,
          bottom: 18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: c.lime,
          paddingLeft: 18,
          paddingRight: 22,
          paddingVertical: 16,
          borderRadius: radius.pill,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
        elevation(c, 3),
      ]}>
      <Ionicons name={icon} size={20} color={c.onLime} />
      <Text style={[font('800'), { color: c.onLime, fontSize: 15 }]}>{label}</Text>
    </Pressable>
  );
}
