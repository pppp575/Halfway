import { describe, expect, it } from 'vitest';
import { dayNumber, daysBetween, isoAddDays, isoPrev, weekRange } from '../src/lib/dates.js';
import { LAUNCH_DATE } from '../src/lib/constants.js';

describe('dates', () => {
  it('counts puzzle numbers from launch', () => {
    expect(dayNumber(LAUNCH_DATE)).toBe(1);
    expect(dayNumber(isoAddDays(LAUNCH_DATE, 9))).toBe(10);
  });
  it('handles month and leap-year boundaries', () => {
    expect(isoPrev('2028-03-01')).toBe('2028-02-29');
    expect(daysBetween('2027-12-31', '2028-01-01')).toBe(1);
  });
  it('finds the Monday-to-Sunday week', () => {
    expect(weekRange('2026-10-17')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(weekRange('2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  });
});
