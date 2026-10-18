import { describe, expect, it } from 'vitest';
import { newlyUnlocked } from '../src/lib/achievements.js';

const day = (scores, extra = {}) => ({
  iso: '2027-01-01',
  archive: false,
  hard: false,
  rounds: scores.map((s) => ({ s, km: 0, d: 12000 })),
  ...extra,
});

describe('achievements', () => {
  it('unlocks badges once', () => {
    const ctx = { days: [day([100, 90, 85, 95, 100])], stats: { best: 1 }, leagues: 0 };
    const got = newlyUnlocked(ctx, []);
    expect(got).toEqual(expect.arrayContaining(['first', 'bullseye', 'ocean', 'sweep', 'ace']));
    expect(got).not.toContain('streak7');
    expect(newlyUnlocked(ctx, got)).toEqual([]);
  });
  it('needs a full day for day badges', () => {
    expect(newlyUnlocked({ days: [day([90, 90])], stats: {}, leagues: 0 }, [])).not.toContain('first');
  });
});
