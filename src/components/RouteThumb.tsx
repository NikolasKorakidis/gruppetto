import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { radius, useTheme } from './theme';

/** Lightweight SVG sketch of a route for lists and cards (no map tiles). */
export function RouteThumb({
  line,
  size = 64,
  color,
  bg,
  strokeWidth = 2.4,
}: {
  line: [number, number][] | null;
  size?: number;
  color?: string;
  bg?: string;
  strokeWidth?: number;
}) {
  const { c } = useTheme();
  const pad = Math.max(6, size * 0.12);
  let points: string[] = [];
  if (line && line.length > 1) {
    const lats = line.map((p) => p[0]);
    const lngs = line.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const w = (maxLng - minLng) * kx || 1e-6;
    const h = maxLat - minLat || 1e-6;
    const scale = (size - pad * 2) / Math.max(w, h);
    const ox = (size - w * scale) / 2;
    const oy = (size - h * scale) / 2;
    const step = Math.max(1, Math.ceil(line.length / 140));
    points = line
      .filter((_, i) => i % step === 0 || i === line.length - 1)
      .map(([la, ln]) => `${(ox + (ln - minLng) * kx * scale).toFixed(1)},${(oy + (maxLat - la) * scale).toFixed(1)}`);
  }
  const stroke = color ?? c.brand;
  const [sx, sy] = points[0]?.split(',').map(Number) ?? [0, 0];
  return (
    <View style={{ width: size, height: size, borderRadius: size > 80 ? radius.lg : radius.md, backgroundColor: bg ?? c.subtle, overflow: 'hidden' }}>
      {points.length ? (
        <Svg width={size} height={size}>
          <Polyline points={points.join(' ')} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={sx} cy={sy} r={strokeWidth * 1.5} fill={stroke} />
        </Svg>
      ) : null}
    </View>
  );
}
