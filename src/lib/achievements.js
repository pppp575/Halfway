/**
 * Badges earned from local play history.
 * ctx = { days: [{ iso, archive, hard, rounds: [{ s, km, d }] }], stats: { streak, best }, leagues }
 */
const complete = (day) => day.rounds.length === 5;
const total = (day) => day.rounds.reduce((t, r) => t + r.s, 0);

export const ACHIEVEMENTS = [
  {
    id: 'first',
    title: 'First flight',
    desc: 'Finish your first daily Halfway.',
    test: (c) => c.days.some((d) => !d.archive && complete(d)),
  },
  { id: 'bullseye', title: 'Bullseye', desc: 'Score 100 on a round.', test: (c) => c.days.some((d) => d.rounds.some((r) => r.s === 100)) },
  {
    id: 'ocean',
    title: 'Ocean crosser',
    desc: 'Score 80 or more on a route over 10,000 km.',
    test: (c) => c.days.some((d) => d.rounds.some((r) => r.s >= 80 && r.d > 10000)),
  },
  {
    id: 'sweep',
    title: 'Clean sweep',
    desc: 'Score 80 or more on all five rounds in one day.',
    test: (c) => c.days.some((d) => complete(d) && d.rounds.every((r) => r.s >= 80)),
  },
  { id: 'ace', title: 'Navigator', desc: 'Score 450 or more in one day.', test: (c) => c.days.some((d) => complete(d) && total(d) >= 450) },
  { id: 'hard', title: 'No dots needed', desc: 'Finish a day in hard mode.', test: (c) => c.days.some((d) => complete(d) && d.hard) },
  { id: 'streak7', title: 'Frequent flyer', desc: 'Play seven days in a row.', test: (c) => (c.stats.best || 0) >= 7 },
  { id: 'streak30', title: 'Elite status', desc: 'Play thirty days in a row.', test: (c) => (c.stats.best || 0) >= 30 },
  {
    id: 'archive',
    title: 'Time traveller',
    desc: 'Finish five puzzles from the archive.',
    test: (c) => c.days.filter((d) => d.archive && complete(d)).length >= 5,
  },
  { id: 'league', title: 'Crew', desc: 'Create or join a league.', test: (c) => (c.leagues || 0) > 0 },
];

/** Returns the ids that pass now but are not in `unlocked` yet. */
export function newlyUnlocked(ctx, unlocked) {
  return ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id) && a.test(ctx)).map((a) => a.id);
}
