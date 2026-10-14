import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { buildMapHtml, type MapInput } from './mapHtml';
import { radius, useTheme } from './theme';

export function RouteMap({ height = 200, style, ...input }: MapInput & { height?: number; style?: StyleProp<ViewStyle> }) {
  const { isDark, c } = useTheme();
  const { line, start, interactive, color, padding } = input;
  const padKey = padding ? `${padding.top},${padding.bottom},${padding.left},${padding.right}` : '';
  const lat = start?.[0];
  const lng = start?.[1];
  const html = useMemo(
    () =>
      buildMapHtml({
        line,
        start: lat != null && lng != null ? [lat, lng] : null,
        interactive,
        dark: isDark,
        color: color ?? c.brand,
        padding,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [line, lat, lng, interactive, isDark, color, c.brand, padKey],
  );
  return (
    <View style={[{ height, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.subtle }, style]}>
      <iframe
        title="Route map"
        srcDoc={html}
        sandbox="allow-scripts"
        style={{ border: 0, width: '100%', height: '100%', pointerEvents: interactive ? 'auto' : 'none' }}
      />
    </View>
  );
}
