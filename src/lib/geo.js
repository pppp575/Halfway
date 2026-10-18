import { geoDistance, geoInterpolate } from 'd3-geo';
import { EARTH_RADIUS_KM } from './constants.js';

/** Points are [longitude, latitude] in decimal degrees, as d3-geo expects. */
export function kmBetween(a, b) {
  return geoDistance(a, b) * EARTH_RADIUS_KM;
}

export function midpointOf(a, b) {
  return geoInterpolate(a, b)(0.5);
}

export function normLon(lon) {
  return ((lon + 540) % 360) - 180;
}

export function samplePath(a, b, n) {
  const f = geoInterpolate(a, b);
  return Array.from({ length: n + 1 }, (_, i) => f(i / n));
}

export function pathMaxAbsLat(a, b) {
  return samplePath(a, b, 48).reduce((m, p) => Math.max(m, Math.abs(p[1])), 0);
}

/** Central meridian for the flat map, chosen so the route never wraps off the edge. */
export function chooseCenter(a, b) {
  const pts = samplePath(a, b, 64);
  for (const c of [0, 150, -90, 60]) {
    let ok = true;
    for (let i = 1; i < pts.length && ok; i++) {
      ok = Math.abs(normLon(pts[i][0] - c) - normLon(pts[i - 1][0] - c)) <= 180;
    }
    if (ok) return c;
  }
  return 0;
}

export function nearestCity(p, cities, exclude = []) {
  let best = null;
  for (const c of cities) {
    if (exclude.includes(c)) continue;
    const d = kmBetween(p, c.p);
    if (!best || d < best.d) best = { city: c, d };
  }
  return best;
}
