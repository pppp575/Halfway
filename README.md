# Halfway

**The daily geography game about meeting in the middle.**

Every day you get five pairs of cities. Tap the exact halfway point between them along the shortest route, the way a plane flies. Because the Earth is round, the real middle is often far from where it looks on a flat map. After each round the map folds into a globe and a plane flies the route, so you can see why.

![Halfway social preview](public/og-image.png)

## Features

- **Five daily rounds**, the same for everyone, from a short hop to an ocean crossing. Two years of puzzles are already scheduled.
- **Flat-to-globe reveal** with the true flight path, the flat-map trap and a plane flying the route.
- **Live leaderboards**: today, all time, and private weekly **leagues** with invite links (needs Supabase).
- **Crowd pins**: after each round, see where other players tapped and what share of them you beat.
- **Server-side scoring**: the database scores every pin itself, so a modified client can’t post a made-up score.
- **Archive** of every past day, unlimited **practice**, and **hard mode** (no city dots).
- **Share** as text with emoji squares, or as a portrait **image** of the day’s routes and your rank.
- **Ten badges**, streaks and stats, saved on the player’s device.
- **Installable and offline-ready** (web app manifest and service worker), self-hosted fonts, light and dark themes, keyboard play.
- **Optional AdSense slots** that switch on when you add your IDs.

## Quick start

You need [Node.js](https://nodejs.org) 22.12 or newer.

```bash
npm install
npm run dev
```

Open the address it prints. Without Supabase settings the game runs with local stats only, which is fine for development.

To try the leaderboard locally, copy `.env.example` to `.env` and fill in your Supabase project URL and publishable key (see [docs/SUPABASE.md](docs/SUPABASE.md)).

## Publishing

1. Set up the database: [docs/SUPABASE.md](docs/SUPABASE.md).
2. Put the code on GitHub and turn on GitHub Pages: [docs/DEPLOY.md](docs/DEPLOY.md).

Every push to `main` then tests, builds and publishes the site automatically.

## Before you launch

- [ ] Set `LAUNCH_DATE` in `src/lib/constants.js` to your first day, run `npm run schedule`, and load the new `supabase/puzzles.sql`.
- [ ] Fill in every `[bracketed]` item in `privacy.html` and have the page reviewed.
- [ ] Decide on a license (see below).
- [ ] Play a full day on your phone on the live site.
- [ ] Optional: custom domain and AdSense ([docs/DEPLOY.md](docs/DEPLOY.md)).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run check` | Lint, formatting check and tests, as CI runs them |
| `npm run schedule` | Extend the puzzle schedule and regenerate `supabase/puzzles.sql` |
| `npm run countries` | Rebuild the world map data from `world-atlas` |

## Project layout

```
index.html, privacy.html    Pages
src/
  main.js                   Entry point
  game.js                   Game flow: rounds, results, end of day, archive, settings, sharing
  styles.css                All styles; fonts in src/fonts
  lib/                      Pure logic with unit tests: puzzles, scoring, geometry, dates, badges
  ui/                       Map and globe, leaderboard, split-flap board, share image
  services/                 Supabase client, ads
  data/                     Cities, world map, puzzle schedule
supabase/
  schema.sql                Tables, security and API functions
  puzzles.sql               Generated puzzle rows
scripts/                    Data generators
tests/                      Unit tests
docs/                       Setup guides, architecture, roadmap
.github/workflows/          CI and GitHub Pages deploy
```

How the pieces fit together is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Plans and premium ideas are in [docs/ROADMAP.md](docs/ROADMAP.md).

## License

`LICENSE` currently says all rights reserved. Choose the license you want before you make the repository public, and get advice if you’re unsure what each option allows. Third-party code, data and fonts keep their own licenses, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
