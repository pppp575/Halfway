# Setting up the database (Supabase)

The leaderboard, crowd pins and leagues run on [Supabase](https://supabase.com). The game works without it, with local stats only. Supabase’s dashboard changes from time to time, so menu names below may differ slightly.

## 1. Create a project

Sign up at supabase.com and create a new project. Pick a region close to most of your players and save the database password somewhere safe.

## 2. Turn on anonymous sign-ins

Players never create an account. The game signs each browser in anonymously.

In the dashboard, open **Authentication**, find the sign-in providers settings and switch on **Allow anonymous sign-ins**.

Also look at **Authentication > Rate limits**. Anonymous sign-ins have their own limit; raise it if you expect a lot of new players at once.

## 3. Create the tables and functions

Open **SQL Editor**, start a new query, paste the whole of `supabase/schema.sql` and run it.

Then do the same with `supabase/puzzles.sql`. It’s about 370 KB. If the editor struggles with it, run it from your computer with `psql` instead, using the connection string from **Connect** in the dashboard:

```bash
psql "postgresql://postgres:[YOUR-PASSWORD]@[YOUR-HOST]:5432/postgres" -f supabase/puzzles.sql
```

Both files are safe to run again. Re-run `schema.sql` after updating the game, and `puzzles.sql` after running `npm run schedule`.

## 4. Copy the project URL and publishable key

Open **Project Settings > API Keys** (or **Connect**). Copy:

- the **Project URL**, like `https://abcdefgh.supabase.co`
- the **publishable key** (`sb_publishable_...`), or the legacy **anon** key if that’s what your project shows

These two go into GitHub as repository variables (see [DEPLOY.md](DEPLOY.md)) and, for local testing, into `.env`.

The publishable key ends up in the public JavaScript, which is expected. It only lets browsers call the game’s functions; the tables themselves are locked. **Never** put the secret key or `service_role` key in the code, in `.env` or in GitHub variables.

## How the database protects itself

- Row level security is on for every table, with no policies, and table privileges are revoked. Browsers can’t read or write tables directly.
- Browsers call functions such as `submit_round` and `daily_board`. These act only for the signed-in player and check their input.
- `submit_round` scores the pin on the server, accepts rounds only in order and only for a day that is “today” somewhere on Earth, and stores each round once.
- Callsigns come from fixed word lists, so players can’t post offensive names.
- `delete_my_data` lets a player remove their profile, rounds and leagues (Settings > Delete my leaderboard data).

The puzzles are public in this repository, so a determined player can still work out the answers. That’s true of any daily web game; the server checks stop fake scores and spam, not someone who computes the midpoint by hand.

## Keeping it healthy

- The schedule in this repo runs for two years from `LAUNCH_DATE`. Well before it ends, run `npm run schedule -- --days=1095`, commit, push, and load the new `puzzles.sql`.
- Supabase’s free plan has limits and can pause inactive projects. Check the current plan details and upgrade when the game gets regular traffic.
- The all-time board adds up every round ever played. Past tens of thousands of players, swap it for a summary table or materialised view.
