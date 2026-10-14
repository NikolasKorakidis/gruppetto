/**
 * Dependency-free GPX parser that works the same on iOS, Android and web
 * (React Native has no DOMParser). Handles <trkpt>, <rtept> and lone <wpt>
 * tracks, self-closing points, attributes in any order and namespaced tags.
 */

export type LatLng = [lat: number, lng: number];

export type ParsedGpx = {
  name: string | null;
  points: number;
  distanceKm: number;
  elevationGainM: number | null;
  elevationLossM: number | null;
  start: LatLng;
  end: LatLng;
  bbox: [minLat: number, minLng: number, maxLat: number, maxLng: number];
  /** Simplified line for maps, at most ~400 points. */
  preview: LatLng[];
};

type Pt = { lat: number; lng: number; ele: number | null };

const MAX_BYTES = 15 * 1024 * 1024;

export class GpxError extends Error {}

function decodeEntities(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();
}

function attr(attrs: string, name: string): number {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(attrs);
  return m ? Number(m[1]) : NaN;
}

function extractPoints(xml: string, tag: string): Pt[] {
  // <(ns:)?trkpt attrs/> or <(ns:)?trkpt attrs> ... </(ns:)?trkpt>
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*?)(\\/>|>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>)`, 'g');
  const out: Pt[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const lat = attr(m[1], 'lat');
    const lng = attr(m[1], 'lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    let ele: number | null = null;
    if (m[3]) {
      const e = /<(?:\w+:)?ele>\s*([-\d.eE+]+)\s*<\/(?:\w+:)?ele>/.exec(m[3]);
      if (e && Number.isFinite(Number(e[1]))) ele = Number(e[1]);
    }
    out.push({ lat, lng, ele });
  }
  return out;
}

const R = 6371.0088; // mean Earth radius, km
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Elevation gain/loss with smoothing + hysteresis so GPS noise does not inflate
 * the numbers (summing every tiny positive step overestimates by 20–50%).
 */
export function elevationStats(eles: number[], threshold = 4): { gain: number; loss: number } {
  if (eles.length < 2) return { gain: 0, loss: 0 };
  const w = 2;
  const smooth = eles.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(eles.length - 1, i + w); j++) {
      sum += eles[j];
      n++;
    }
    return sum / n;
  });
  let gain = 0;
  let loss = 0;
  let ref = smooth[0];
  for (const e of smooth) {
    const d = e - ref;
    if (d >= threshold) {
      gain += d;
      ref = e;
    } else if (d <= -threshold) {
      loss -= d;
      ref = e;
    }
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
}

/** Douglas–Peucker on lat/lng (planar approximation is fine at route scale). */
export function simplify(points: LatLng[], tolerance: number): LatLng[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = points[s];
    const [bx, by] = points[e];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = points[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + t * dx - px;
      const qy = ay + t * dy - py;
      const d = qx * qx + qy * qy;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > tolerance * tolerance) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function previewLine(points: LatLng[], maxPoints = 400): LatLng[] {
  let tol = 0.00002;
  let line = simplify(points, tol);
  while (line.length > maxPoints && tol < 0.05) {
    tol *= 2;
    line = simplify(points, tol);
  }
  return line.map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5]);
}

export function parseGpx(xml: string): ParsedGpx {
  if (xml.length > MAX_BYTES) throw new GpxError('GPX file is too large (max 15 MB).');
  if (!/<gpx[\s>]/i.test(xml.slice(0, 5000))) throw new GpxError('This does not look like a GPX file.');
  // Never process DTDs/entities from uploaded XML.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new GpxError('GPX files with DOCTYPE/ENTITY declarations are not supported.');

  let pts = extractPoints(xml, 'trkpt');
  if (pts.length < 2) pts = extractPoints(xml, 'rtept');
  if (pts.length < 2) pts = extractPoints(xml, 'wpt');
  if (pts.length < 2) throw new GpxError('No track points found in this GPX file.');

  const nameMatch =
    /<(?:\w+:)?trk\b[^>]*>[\s\S]*?<(?:\w+:)?name>([\s\S]*?)<\/(?:\w+:)?name>/.exec(xml) ??
    /<(?:\w+:)?rte\b[^>]*>[\s\S]*?<(?:\w+:)?name>([\s\S]*?)<\/(?:\w+:)?name>/.exec(xml) ??
    /<(?:\w+:)?metadata>[\s\S]*?<(?:\w+:)?name>([\s\S]*?)<\/(?:\w+:)?name>/.exec(xml);

  const line: LatLng[] = pts.map((p) => [p.lat, p.lng]);
  let dist = 0;
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (let i = 0; i < line.length; i++) {
    const [la, ln] = line[i];
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (ln < minLng) minLng = ln;
    if (ln > maxLng) maxLng = ln;
    if (i) dist += haversineKm(line[i - 1], line[i]);
  }

  const eles = pts.map((p) => p.ele).filter((e): e is number => e !== null);
  const hasEle = eles.length >= pts.length * 0.5;
  const { gain, loss } = hasEle ? elevationStats(eles) : { gain: 0, loss: 0 };

  return {
    name: nameMatch ? decodeEntities(nameMatch[1]) || null : null,
    points: pts.length,
    distanceKm: Math.round(dist * 100) / 100,
    elevationGainM: hasEle ? gain : null,
    elevationLossM: hasEle ? loss : null,
    start: line[0],
    end: line[line.length - 1],
    bbox: [minLat, minLng, maxLat, maxLng],
    preview: previewLine(line),
  };
}
