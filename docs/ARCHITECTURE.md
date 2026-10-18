# How Halfway works

## Puzzles

- `src/data/cities.js` lists the cities. **Only add cities to the end**: puzzles refer to cities by position.
- `src/lib/puzzles.js` picks five pairs per day with a seeded random generator, within distance bands that grow each round (1,500 to 16,500 km), with no repeated cities and no midpoint near the poles.
- `npm run schedule` freezes those picks into `src/data/schedule.json` (city positions per day) and writes the matching `supabase/puzzles.sql`. Existing days are never changed, so past puzzles stay fixed even if the generator changes later.
- The browser reads the schedule; for days beyond it, it falls back to the generator, but those days have no leaderboard until you extend the schedule.

## Scoring

`scoreFor(offKm, routeKm)` in `src/lib/scoring.js`: 100 points inside a ring of 60 km or 1.5% of the route, whichever is bigger, then the score halves for every 12% of the route length you’re off. `halfway_score` in `supabase/schema.sql` is the same formula, and the database is the authority for the leaderboard. A test checks that 15 sample pins score identically in both.

## The map

`src/ui/map.js` uses d3-geo. Play happens on a Natural Earth projection, rotated so the route never crosses the map edge. After a pin is locked, the route draws in, then the projection is interpolated into an orthographic globe (clipping first along the back meridian, then to the visible hemisphere), the globe rotates to face the midpoint, and a plane flies the great circle. Markers live in an overlay so they stay the same size while the map zooms.

## Data on the device

`src/lib/storage.js` keeps results per day, stats, badges, settings, the callsign and a queue of rounds waiting to upload, all under `halfway:v2:` in localStorage. Rounds played offline are sent in order when the connection returns.

## Backend

`src/services/backend.js` signs the browser in anonymously with Supabase and calls the SQL functions in `supabase/schema.sql`. The Supabase library loads only when the site is built with Supabase settings, so the base game stays small. See [SUPABASE.md](SUPABASE.md) for the security model.

## Builds

Vite builds `index.html` and `privacy.html` into `dist/`. `VITE_*` variables are baked in at build time; the deploy workflow sets them from repository variables. `public/` is copied as is (icons, manifest, service worker, social image).
