import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CALLSIGN_ADJECTIVES, CALLSIGN_NOUNS, isValidCallsign, newCallsign } from '../src/lib/callsigns.js';

const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const sqlList = (n) => {
  const fn = sql.slice(sql.indexOf('function public.halfway_callsign_ok'));
  const arrays = [...fn.matchAll(/array\[([\s\S]*?)\]/g)].map((m) => m[1].match(/'([^']+)'/g).map((w) => w.slice(1, -1)));
  return arrays[n];
};

describe('callsigns', () => {
  it('generates valid callsigns', () => {
    for (let i = 0; i < 200; i++) expect(isValidCallsign(newCallsign())).toBe(true);
  });
  it('rejects anything else', () => {
    ['', 'Robert Tables 12', 'Amber Heron 7', 'Amber Heron 100', 'amber heron 12; drop'].forEach((n) =>
      expect(isValidCallsign(n)).toBe(false),
    );
  });
  it('uses the same word lists as the database', () => {
    expect(sqlList(0)).toEqual(CALLSIGN_ADJECTIVES);
    expect(sqlList(1)).toEqual(CALLSIGN_NOUNS);
  });
});
