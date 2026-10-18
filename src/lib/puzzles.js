import { CITIES } from '../data/cities.js';
import { ROUNDS } from './constants.js';
import { daysBetween } from './dates.js';
import { chooseCenter, kmBetween, midpointOf, pathMaxAbsLat } from './geo.js';
import { mulberry32, seedFrom } from './random.js';

/** Route length per round in km: a short hop first, an ocean crossing last. */
export const BANDS = [
  [1500, 4000],
  [3500, 7500],
  [6000, 10500],
  [8500, 13500],
  [11000, 16500],
];

/** Pick five city pairs. Deterministic for a given rng. */
export function makeRounds(rng, cities = CITIES) {
  const used = new Set();
  return BANDS.map(([lo, hi], r) => {
    for (let tries = 0; tries < 40000; tries++) {
      const i = Math.floor(rng() * cities.length);
      const j = Math.floor(rng() * cities.length);
      if (i === j || used.has(i) || used.has(j)) continue;
      const A = cities[i];
      const B = cities[j];
      if (A.c === B.c) continue;
      const d = kmBetween(A.p, B.p);
      if (d < lo || d > hi) continue;
      if (Math.abs(midpointOf(A.p, B.p)[1]) > 70) continue; // keep the middle off the map's polar edges
      if (pathMaxAbsLat(A.p, B.p) > 78) continue;
      used.add(i).add(j);
      return [i, j];
    }
    throw new Error(`Could not build round ${r + 1}`);
  });
}

export function generatedPairs(iso) {
  return makeRounds(mulberry32(seedFrom(`halfway:${iso}`)));
}

/** The day's five pairs: from the committed schedule when it covers the day, otherwise generated. */
export function pairsFor(iso, schedule) {
  const i = schedule ? daysBetween(schedule.start, iso) : -1;
  if (schedule && i >= 0 && i < schedule.days.length) {
    const row = schedule.days[i];
    return Array.from({ length: ROUNDS }, (_, r) => [row[r * 2], row[r * 2 + 1]]);
  }
  return generatedPairs(iso);
}

export function isScheduled(iso, schedule) {
  const i = schedule ? daysBetween(schedule.start, iso) : -1;
  return i >= 0 && i < (schedule?.days.length ?? 0);
}

export function roundData(pair, cities = CITIES) {
  const A = cities[pair[0]];
  const B = cities[pair[1]];
  return {
    A,
    B,
    a: A.p,
    b: B.p,
    m: midpointOf(A.p, B.p),
    dist: kmBetween(A.p, B.p),
    center: chooseCenter(A.p, B.p),
  };
}
