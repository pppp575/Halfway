import { describe, expect, it } from 'vitest';
import { chooseCenter, kmBetween, midpointOf, normLon } from '../src/lib/geo.js';

const LONDON = [-0.128, 51.507];
const TOKYO = [139.65, 35.676];
const NORILSK = [88.2, 69.35];

describe('geo', () => {
  it('measures great-circle distance', () => {
    expect(kmBetween(LONDON, TOKYO)).toBeCloseTo(9559, -1);
  });
  it('puts London–Tokyo halfway near Norilsk, as the site copy claims', () => {
    expect(kmBetween(midpointOf(LONDON, TOKYO), NORILSK)).toBeLessThan(100);
  });
  it('normalises longitudes', () => {
    expect(normLon(190)).toBe(-170);
    expect(normLon(-190)).toBe(170);
  });
  it('centres Pacific routes on the Pacific', () => {
    expect(chooseCenter([-118.244, 34.052], TOKYO)).toBe(150);
    expect(chooseCenter(LONDON, TOKYO)).toBe(0);
  });
});
