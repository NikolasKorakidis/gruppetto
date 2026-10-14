// Ride-time forecast from Open-Meteo (free, no API key, CORS-enabled).
export type RideWeather = {
  temperature: number;
  apparent: number;
  precipitationProbability: number;
  windKmh: number;
  windGustKmh: number;
  windDirection: number;
  beaufort: number;
  compass: string;
  code: number;
  summary: string;
  icon: string;
};

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const toCompass = (deg: number) => COMPASS[Math.round(((deg % 360) / 22.5)) % 16];

export function toBeaufort(kmh: number) {
  const limits = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  const i = limits.findIndex((l) => kmh < l);
  return i === -1 ? 12 : i;
}

function describe(code: number): { summary: string; icon: string } {
  if (code === 0) return { summary: 'Clear', icon: 'sunny' };
  if (code <= 2) return { summary: 'Partly cloudy', icon: 'partly-sunny' };
  if (code === 3) return { summary: 'Overcast', icon: 'cloudy' };
  if (code <= 48) return { summary: 'Fog', icon: 'cloudy' };
  if (code <= 57) return { summary: 'Drizzle', icon: 'rainy' };
  if (code <= 67) return { summary: 'Rain', icon: 'rainy' };
  if (code <= 77) return { summary: 'Snow', icon: 'snow' };
  if (code <= 82) return { summary: 'Showers', icon: 'rainy' };
  if (code <= 86) return { summary: 'Snow showers', icon: 'snow' };
  return { summary: 'Thunderstorm', icon: 'thunderstorm' };
}

/** Forecast for the hour the ride starts. Returns null when outside the 16-day window. */
export async function fetchRideWeather(lat: number, lng: number, startsAt: string): Promise<RideWeather | null> {
  const start = new Date(startsAt);
  const ahead = (start.getTime() - Date.now()) / 864e5;
  if (ahead > 15.5 || ahead < -1) return null;
  const day = start.toISOString().slice(0, 10);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m` +
    `&timezone=UTC&start_date=${day}&end_date=${day}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = await res.json();
  const hour = start.getUTCHours();
  const h = j.hourly;
  if (!h?.time?.length) return null;
  const i = Math.min(hour, h.time.length - 1);
  const windKmh = h.wind_speed_10m[i];
  return {
    temperature: Math.round(h.temperature_2m[i]),
    apparent: Math.round(h.apparent_temperature[i]),
    precipitationProbability: h.precipitation_probability?.[i] ?? 0,
    windKmh: Math.round(windKmh),
    windGustKmh: Math.round(h.wind_gusts_10m[i]),
    windDirection: h.wind_direction_10m[i],
    beaufort: toBeaufort(windKmh),
    compass: toCompass(h.wind_direction_10m[i]),
    code: h.weather_code[i],
    ...describe(h.weather_code[i]),
  };
}
