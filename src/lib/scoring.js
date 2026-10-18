/**
 * 100 points inside a small target ring, then the score halves for every
 * 12% of the route length you are off. Mirrored in supabase/schema.sql.
 */
export function scoreFor(offKm, routeKm) {
  const ring = Math.max(60, routeKm * 0.015);
  if (offKm <= ring) return 100;
  return Math.round(100 * Math.pow(0.5, (offKm - ring) / routeKm / 0.12));
}

export function bucketIndex(score) {
  if (score >= 80) return 0;
  if (score >= 55) return 1;
  if (score >= 30) return 2;
  return 3;
}

export const BUCKET_EMOJI = ['🟩', '🟨', '🟧', '🟥'];

export function squares(scores) {
  return scores.map((s) => BUCKET_EMOJI[bucketIndex(s)]).join('');
}

export function verdictFor(total, max) {
  if (total >= max * 0.9) return 'You could run an airline.';
  if (total >= max * 0.72) return 'Excellent sense of the globe.';
  if (total >= max * 0.5) return 'Solid. The curve got you once or twice.';
  if (total >= max * 0.3) return 'The flat map fooled you a few times.';
  return 'The Earth is rounder than it looks.';
}
