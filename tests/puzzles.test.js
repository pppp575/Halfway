import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CITIES } from '../src/data/cities.js';
import { LAUNCH_DATE } from '../src/lib/constants.js';
import { isoAddDays } from '../src/lib/dates.js';
import { kmBetween } from '../src/lib/geo.js';
import { BANDS, generatedPairs, pairsFor, roundData } from '../src/lib/puzzles.js';

const schedule = JSON.parse(readFileSync(new URL('../src/data/schedule.json', import.meta.url), 'utf8'));

describe('puzzles', () => {
  it('are deterministic for a date', () => {
    expect(generatedPairs('2027-03-01')).toEqual(generatedPairs('2027-03-01'));
    expect(generatedPairs('2027-03-01')).not.toEqual(generatedPairs('2027-03-02'));
  });

  it('follow the distance bands and never repeat a city in a day', () => {
    for (let i = 0; i < 120; i++) {
      const pairs = generatedPairs(isoAddDays('2027-01-01', i));
      const used = pairs.flat();
      expect(new Set(used).size).toBe(used.length);
      pairs.forEach(([a, b], r) => {
        const d = kmBetween(CITIES[a].p, CITIES[b].p);
        expect(d).toBeGreaterThanOrEqual(BANDS[r][0]);
        expect(d).toBeLessThanOrEqual(BANDS[r][1]);
        expect(CITIES[a].c).not.toBe(CITIES[b].c);
      });
    }
  });

  it('reads the committed schedule, which matches the generator', () => {
    expect(schedule.start).toBe(LAUNCH_DATE);
    expect(schedule.cities).toBe(CITIES.length);
    for (let i = 0; i < 30; i++) {
      const iso = isoAddDays(LAUNCH_DATE, i);
      expect(pairsFor(iso, schedule)).toEqual(generatedPairs(iso));
    }
  });

  it('has a database row for every scheduled round', () => {
    const sql = readFileSync(new URL('../supabase/puzzles.sql', import.meta.url), 'utf8');
    const rows = sql.match(/^\('\d{4}-\d{2}-\d{2}',[1-5],/gm) || [];
    expect(rows.length).toBe(schedule.days.length * 5);
  });

  it('builds round data with a midpoint halfway along the route', () => {
    const R = roundData(pairsFor(LAUNCH_DATE, schedule)[2]);
    expect(kmBetween(R.a, R.m)).toBeCloseTo(R.dist / 2, 3);
    expect(kmBetween(R.b, R.m)).toBeCloseTo(R.dist / 2, 3);
  });
});
