import { describe, expect, it } from 'vitest';
import { bucketIndex, scoreFor, squares } from '../src/lib/scoring.js';

describe('scoreFor', () => {
  it('gives 100 inside the target ring', () => {
    expect(scoreFor(0, 10000)).toBe(100);
    expect(scoreFor(150, 10000)).toBe(100);
    expect(scoreFor(60, 2000)).toBe(100);
  });
  it('halves every 12% of the route outside the ring', () => {
    expect(scoreFor(150 + 1200, 10000)).toBe(50);
    expect(scoreFor(150 + 2400, 10000)).toBe(25);
  });
  it('never goes below zero or above 100', () => {
    for (let off = 0; off < 20000; off += 997) {
      const s = scoreFor(off, 9000);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});

describe('buckets', () => {
  it('maps scores to share squares', () => {
    expect([90, 60, 40, 10].map(bucketIndex)).toEqual([0, 1, 2, 3]);
    expect(squares([100, 55, 30, 0])).toBe('🟩🟨🟧🟥');
  });
});
