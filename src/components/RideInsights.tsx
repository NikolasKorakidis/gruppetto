import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { fuelPlan } from '@/lib/fuel';
import type { RideWithRelations } from '@/lib/types';
import { fetchRideWeather } from '@/lib/weather';

import { font, radius, space, useTheme } from './theme';
import { Card, IconTile, Row, Txt, type IconName } from './ui';

/** Forecast for the start hour + a simple fuelling plan. */
export function RideInsights({ ride }: { ride: RideWithRelations }) {
  const { c } = useTheme();
  const lat = ride.start_lat ?? ride.route?.start_lat ?? null;
  const lng = ride.start_lng ?? ride.route?.start_lng ?? null;

  const weather = useQuery({
    queryKey: ['weather', lat, lng, ride.starts_at],
    enabled: lat != null && lng != null && ride.status !== 'cancelled',
    staleTime: 30 * 60e3,
    queryFn: () => fetchRideWeather(lat!, lng!, ride.starts_at),
  });
  const w = weather.data;
  const fuel = fuelPlan({
    durationMinutes: ride.duration_minutes,
    avgSpeedKmh: ride.avg_speed_kmh,
    rideType: ride.ride_type,
    temperatureC: w?.temperature,
  });

  if (!w && !fuel) return null;

  return (
    <View style={{ gap: space.md }}>
      {w ? (
        <View style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: c.hero }}>
          <LinearGradient
            colors={w.precipitationProbability >= 50 ? ['#3B5B7A', '#111316'] : ['#1F6F8B', '#111316']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{ padding: space.lg, gap: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="label" color={c.lime}>
                Forecast at the start
              </Txt>
              <Txt variant="caption" color="rgba(255,255,255,0.5)">
                Open-Meteo
              </Txt>
            </Row>
            <Row gap={space.lg}>
              <Ionicons name={w.icon as never} size={44} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={[font('800'), { fontSize: 40, letterSpacing: -1.5, color: '#fff', lineHeight: 44 }]}>{w.temperature}°</Text>
                <Txt variant="small" color="rgba(255,255,255,0.7)">
                  {w.summary} · feels like {w.apparent}°
                </Txt>
              </View>
            </Row>
            <Row gap={8}>
              <Pill icon="navigate" iconRotate={(w.windDirection + 180) % 360} label={`${w.beaufort} Bft ${w.compass}`} />
              <Pill icon="flag-outline" label={`gusts ${w.windGustKmh} km/h`} />
              <Pill icon="umbrella-outline" label={`${w.precipitationProbability}% rain`} />
            </Row>
            {w.precipitationProbability >= 40 || w.beaufort >= 5 ? (
              <Txt variant="small" color={c.lime} style={{ fontWeight: '600' }}>
                {w.precipitationProbability >= 40 ? 'Pack a rain jacket. ' : ''}
                {w.beaufort >= 5 ? `Strong wind from the ${w.compass}: ride into it first, tailwind home.` : ''}
              </Txt>
            ) : null}
          </LinearGradient>
        </View>
      ) : null}

      {fuel ? (
        <Card>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
            <Txt variant="label">Fuelling</Txt>
            <Txt variant="caption">{fuel.intensity} effort</Txt>
          </Row>
          <Row gap={space.lg}>
            <Row gap={10} style={{ flex: 1 }}>
              <IconTile icon="nutrition" color={c.accent} bg={c.accentSoft} />
              <View>
                <Text style={[font('800'), { fontSize: 20, color: c.ink }]}>
                  {fuel.carbsPerHour}
                  <Text style={[font('600'), { fontSize: 12, color: c.muted }]}> g/h</Text>
                </Text>
                <Txt variant="caption">carbs</Txt>
              </View>
            </Row>
            <Row gap={10} style={{ flex: 1 }}>
              <IconTile icon="water" color="#2F6FDB" bg="#DCE8FB" />
              <View>
                <Text style={[font('800'), { fontSize: 20, color: c.ink }]}>
                  {fuel.waterPerHourMl}
                  <Text style={[font('600'), { fontSize: 12, color: c.muted }]}> ml/h</Text>
                </Text>
                <Txt variant="caption">fluid</Txt>
              </View>
            </Row>
          </Row>
          <Txt variant="small" muted style={{ marginTop: space.md }}>
            {fuel.tip} In total about {fuel.totalCarbs} g carbs and {(fuel.totalWaterMl / 1000).toFixed(1)} L.
          </Txt>
        </Card>
      ) : null}
    </View>
  );
}

function Pill({ icon, label, iconRotate }: { icon: IconName; label: string; iconRotate?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill }}>
      <View style={iconRotate != null ? { transform: [{ rotate: `${iconRotate - 45}deg` }] } : undefined}>
        <Ionicons name={icon} size={13} color="#fff" />
      </View>
      <Text style={[font('700'), { fontSize: 12, color: '#fff' }]}>{label}</Text>
    </View>
  );
}
