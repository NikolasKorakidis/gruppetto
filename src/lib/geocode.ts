// Best-effort geocoding of a free-text start location using OpenStreetMap
// Nominatim. Fine for personal/club use (max 1 request/second, see
// https://operations.osmfoundation.org/policies/nominatim/). Swap for a paid
// geocoder if you open the app to many users.
export async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (q.length < 3) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json', 'User-Agent': 'Gruppetto/1.0 (club ride planner)' } },
    );
    if (!res.ok) return null;
    const [hit] = await res.json();
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}
