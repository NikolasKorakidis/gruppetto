// Simple fueling guidance from duration, intensity and temperature.
// Based on widely used sports-nutrition ranges (≈30–90 g carbs/h depending on
// duration & intensity; ≈400–1000 ml fluid/h depending on heat). Not medical advice.
import type { RideType } from './types';

export type FuelPlan = {
  carbsPerHour: number;
  waterPerHourMl: number;
  totalCarbs: number;
  totalWaterMl: number;
  intensity: 'easy' | 'moderate' | 'hard';
  tip: string;
};

// Typical "endurance" pace per discipline; faster than this = harder.
const BASE_SPEED: Record<RideType, number> = {
  road: 27, gravel: 21, mtb: 15, cx: 18, ebike: 25, training: 28, tour: 22, social: 20,
};

export function fuelPlan(opts: {
  durationMinutes: number | null;
  avgSpeedKmh: number | null;
  rideType: RideType;
  temperatureC?: number | null;
}): FuelPlan | null {
  const { durationMinutes, avgSpeedKmh, rideType, temperatureC } = opts;
  if (!durationMinutes || durationMinutes < 30) return null;

  const ratio = avgSpeedKmh ? avgSpeedKmh / BASE_SPEED[rideType] : 1;
  const intensity: FuelPlan['intensity'] = ratio < 0.95 ? 'easy' : ratio < 1.12 ? 'moderate' : 'hard';
  const hours = durationMinutes / 60;

  let carbs: number;
  if (hours < 1.25) carbs = intensity === 'hard' ? 30 : 0;
  else if (hours < 2.5) carbs = { easy: 40, moderate: 60, hard: 70 }[intensity];
  else carbs = { easy: 60, moderate: 75, hard: 90 }[intensity];

  const t = temperatureC ?? 15;
  let water = 500 + Math.max(0, t - 15) * 25 + (intensity === 'hard' ? 150 : 0);
  water = Math.round(Math.min(1000, Math.max(400, water)) / 50) * 50;

  const tip =
    carbs === 0
      ? 'Short ride — water is enough, eat normally beforehand.'
      : carbs >= 75
        ? 'Start eating within 30 minutes and take something every 20 minutes.'
        : t > 24
          ? 'Warm out: add electrolytes and drink before you feel thirsty.'
          : 'Eat little and often — a bar or gel every 40–45 minutes.';

  return {
    carbsPerHour: carbs,
    waterPerHourMl: water,
    totalCarbs: Math.round(carbs * hours),
    totalWaterMl: Math.round((water * hours) / 50) * 50,
    intensity,
    tip,
  };
}
