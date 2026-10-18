# Roadmap

## 1.0 (this release)

Daily puzzles, globe reveal, leaderboards, leagues, crowd pins, archive, practice, hard mode, badges, share image, offline support, optional ads.

## Next: growth

- **“Halfway between X and Y” pages.** People search for the midpoint between two cities. Generate a static page per popular pair at build time, each with the map, the midpoint, the flight time and a button to play today’s puzzle. This is likely the biggest source of free search traffic.
- **Video share.** Record the globe reveal from the canvas and share it as a short clip, made for TikTok, Reels and Shorts.
- **Streak reminders** with web push notifications.
- **Bot protection** with Cloudflare Turnstile on anonymous sign-in. Supabase supports it, but the client needs to send the token first.
- **More languages**, starting with the biggest search markets.

## Premium: Halfway Plus

A small yearly or monthly subscription for players who love the game:

- No ads.
- Full stats: a map of where your pins tend to land, your accuracy by region, your best and worst routes.
- League history and seasons instead of weekly resets only.
- Share-image themes and a supporter badge on leaderboards.
- Early access to themed packs.

**How to build it:** let players attach an email to their anonymous account (Supabase supports linking an anonymous user to a permanent one), so a purchase survives a new phone. Take payment with Stripe Payment Links, and have a Supabase Edge Function receive Stripe’s webhook and set a `plus_until` date on the profile. The client hides ads and unlocks features when `my_profile` reports an active subscription.

## Other revenue

- **Themed packs:** a US edition with state capitals, famous real flights, capitals only, one region per week.
- **Classroom edition:** teacher accounts, class leagues, no ads, a printable worksheet per day, priced per class or per school. Geography teachers are a natural audience.
- **Sponsored days:** a travel brand or airline presents a day’s puzzle.
- **Licensing:** newspapers and travel sites embed a branded daily Halfway on their own pages.
