/** Players get a generated callsign, never free text. Keep in sync with supabase/schema.sql. */
export const CALLSIGN_ADJECTIVES = [
  'Amber',
  'Arctic',
  'Cobalt',
  'Coral',
  'Copper',
  'Crimson',
  'Golden',
  'Indigo',
  'Jade',
  'Lunar',
  'Misty',
  'Polar',
  'Saffron',
  'Silver',
  'Solar',
  'Swift',
  'Tidal',
  'Velvet',
];
export const CALLSIGN_NOUNS = [
  'Albatross',
  'Comet',
  'Condor',
  'Crane',
  'Falcon',
  'Gannet',
  'Heron',
  'Horizon',
  'Ibis',
  'Kestrel',
  'Meridian',
  'Monsoon',
  'Osprey',
  'Petrel',
  'Sirocco',
  'Swallow',
  'Tern',
  'Zephyr',
];

export function newCallsign(rng = Math.random) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  return `${pick(CALLSIGN_ADJECTIVES)} ${pick(CALLSIGN_NOUNS)} ${10 + Math.floor(rng() * 90)}`;
}

export function isValidCallsign(name) {
  const m = /^([A-Za-z]+) ([A-Za-z]+) ([1-9][0-9])$/.exec(name || '');
  return !!m && CALLSIGN_ADJECTIVES.includes(m[1]) && CALLSIGN_NOUNS.includes(m[2]);
}
