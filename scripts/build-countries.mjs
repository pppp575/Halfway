// Regenerates src/data/countries.json (compact world map) from the world-atlas package.
// Usage: npm run countries
import { readFile, writeFile } from 'node:fs/promises';
import { feature } from 'topojson-client';

const topo = JSON.parse(await readFile(new URL('../node_modules/world-atlas/countries-110m.json', import.meta.url)));
const geo = feature(topo, topo.objects.countries);

// Short names in world-atlas, rewritten for sentences like "Halfway is in the United States".
const RENAME = {
  'United States of America': 'the United States',
  'Dem. Rep. Congo': 'DR Congo',
  'Central African Rep.': 'the Central African Republic',
  'S. Sudan': 'South Sudan',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'W. Sahara': 'Western Sahara',
  'N. Cyprus': 'Cyprus',
  Somaliland: 'Somalia',
  'Falkland Is.': 'the Falkland Islands',
  'Fr. S. Antarctic Lands': 'the French Southern Lands',
  'Solomon Is.': 'the Solomon Islands',
  'Eq. Guinea': 'Equatorial Guinea',
  eSwatini: 'Eswatini',
  'Dominican Rep.': 'the Dominican Republic',
  Macedonia: 'North Macedonia',
  Netherlands: 'the Netherlands',
  Philippines: 'the Philippines',
  'United Kingdom': 'the United Kingdom',
  'United Arab Emirates': 'the United Arab Emirates',
  Bahamas: 'the Bahamas',
  Gambia: 'the Gambia',
  "Côte d'Ivoire": 'Côte d’Ivoire',
};

const round = (x) => Math.round(x * 100) / 100;
const roundCoords = (c) => (Array.isArray(c[0]) ? c.map(roundCoords) : [round(c[0]), round(c[1])]);

const out = geo.features.map((f) => ({
  n: RENAME[f.properties.name] || f.properties.name,
  t: f.geometry.type,
  c: roundCoords(f.geometry.coordinates),
}));

await writeFile(new URL('../src/data/countries.json', import.meta.url), JSON.stringify(out));
console.log(`Wrote ${out.length} countries to src/data/countries.json`);
