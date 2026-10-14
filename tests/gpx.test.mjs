// Unit tests for the GPX parser. Run with: npm run test:gpx
import assert from 'node:assert/strict';
import { parseGpx, GpxError } from '../src/lib/gpx.ts';

let failed = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

// 1001 points due north from 52.0 to 52.1 (≈11.12 km), climbing 100 m with ±1.5 m GPS noise.
const pts = Array.from({ length: 1001 }, (_, i) => {
  const lat = (52 + i * 0.0001).toFixed(6);
  const ele = (10 + i * 0.1 + (i % 2 ? 1.5 : -1.5)).toFixed(1);
  return `<trkpt lon="6.000000" lat="${lat}"><ele>${ele}</ele><time>2026-01-01T00:00:00Z</time></trkpt>`;
}).join('\n');
const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>Meta</name></metadata><trk><name>Forest &amp; River loop</name><trkseg>${pts}</trkseg></trk></gpx>`;

console.log('\nGPX parser tests');
test('distance is geodesic and accurate', () => {
  const r = parseGpx(gpx);
  assert.ok(Math.abs(r.distanceKm - 11.12) < 0.02, `got ${r.distanceKm}`);
});
test('elevation gain filters GPS noise', () => {
  const r = parseGpx(gpx);
  assert.ok(r.elevationGainM >= 95 && r.elevationGainM <= 105, `gain ${r.elevationGainM}`);
  assert.ok(r.elevationLossM <= 5, `loss ${r.elevationLossM}`);
});
test('name prefers the track name and decodes entities', () => {
  assert.equal(parseGpx(gpx).name, 'Forest & River loop');
});
test('preview is simplified but keeps endpoints', () => {
  const r = parseGpx(gpx);
  assert.ok(r.preview.length <= 400 && r.preview.length >= 2);
  assert.deepEqual(r.preview[0], [52, 6]);
  assert.deepEqual(r.preview.at(-1), [52.1, 6]);
  assert.deepEqual(r.start, [52, 6]);
});
test('bbox is [minLat, minLng, maxLat, maxLng]', () => {
  const [a, b, c, d] = parseGpx(gpx).bbox;
  assert.deepEqual([a, b, +c.toFixed(4), d], [52, 6, 52.1, 6]);
});
test('route points (rtept), self-closing tags and namespaces', () => {
  const r = parseGpx(`<gpx><gpx:rte><gpx:rtept lat="52.0" lon="6.0"/><gpx:rtept lat="52.01" lon="6.0"/></gpx:rte></gpx>`);
  assert.equal(r.points, 2);
  assert.equal(r.elevationGainM, null);
  assert.ok(Math.abs(r.distanceKm - 1.11) < 0.01);
});
test('rejects non-GPX, empty tracks and DOCTYPE/ENTITY payloads', () => {
  assert.throws(() => parseGpx('<html></html>'), GpxError);
  assert.throws(() => parseGpx('<gpx><trk></trk></gpx>'), GpxError);
  assert.throws(() => parseGpx('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><gpx></gpx>'), GpxError);
});
test('ignores points with invalid coordinates', () => {
  const r = parseGpx(`<gpx><trk><trkseg><trkpt lat="999" lon="6"/><trkpt lat="52" lon="6"/><trkpt lat="52.001" lon="6"/></trkseg></trk></gpx>`);
  assert.equal(r.points, 2);
});
console.log(failed ? `\n${failed} FAILED\n` : '\nall passed\n');
process.exitCode = failed ? 1 : 0;
