import { LAUNCH_DATE } from './constants.js';

const pad = (n) => String(n).padStart(2, '0');
const toUTC = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Today (or `date`) as YYYY-MM-DD in the player's own time zone. */
export function isoLocal(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isoAddDays(iso, days) {
  return new Date(toUTC(iso) + days * 86400000).toISOString().slice(0, 10);
}

export function isoPrev(iso) {
  return isoAddDays(iso, -1);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((toUTC(toIso) - toUTC(fromIso)) / 86400000);
}

/** Puzzle number: the launch day is No. 1. */
export function dayNumber(iso) {
  return Math.max(1, daysBetween(LAUNCH_DATE, iso) + 1);
}

/** Monday to Sunday of the week containing `iso`. */
export function weekRange(iso) {
  const weekday = (new Date(toUTC(iso)).getUTCDay() + 6) % 7; // Monday = 0
  const from = isoAddDays(iso, -weekday);
  return { from, to: isoAddDays(from, 6) };
}

const longFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function formatLong(iso) {
  return longFmt.format(new Date(toUTC(iso)));
}

export function formatShort(iso) {
  return shortFmt.format(new Date(toUTC(iso)));
}
