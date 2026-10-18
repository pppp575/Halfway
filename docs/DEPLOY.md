# Publishing on GitHub Pages

## 1. Put the code on GitHub

Create a new repository on github.com (without a README, since this project has one). GitHub Pages is free for public repositories; private ones need a paid plan.

From this folder:

```bash
git init
git add .
git commit -m "Halfway 1.0.0"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/halfway.git
git push -u origin main
```

`node_modules`, `dist` and `.env` are already in `.gitignore`.

## 2. Turn on Pages

In the repository: **Settings > Pages > Build and deployment > Source**, choose **GitHub Actions**.

## 3. Add the build settings

**Settings > Secrets and variables > Actions > Variables tab > New repository variable.** Add:

| Name | Value | Needed? |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL | For the leaderboard |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your publishable (or anon) key | For the leaderboard |
| `CUSTOM_DOMAIN` | e.g. `playhalfway.com`, no `https://` | Only with a custom domain |
| `VITE_ADSENSE_CLIENT` | `ca-pub-...` | Only for ads |
| `VITE_ADSENSE_SLOT_ROUND` | Ad unit id shown after each round | Only for ads |
| `VITE_ADSENSE_SLOT_DONE` | Ad unit id on the end-of-day screen | Only for ads |

The workflow works out the site address and base path on its own.

## 4. Deploy

Push to `main`, or open **Actions > Deploy to GitHub Pages > Run workflow**. When it’s green, the site is live at `https://YOUR-NAME.github.io/halfway/`. Every later push to `main` runs the checks and redeploys.

Pull requests and other branches run **CI** (lint, formatting, tests, build) without deploying. Dependabot opens weekly update pull requests.

## Custom domain

A custom domain looks more professional and you need one for AdSense.

1. Buy a domain from any registrar.
2. In **Settings > Pages > Custom domain**, enter it and follow GitHub’s instructions for the DNS records.
3. Add the `CUSTOM_DOMAIN` variable above and re-run the deploy.
4. Once the certificate is ready, tick **Enforce HTTPS**.

## Ads (optional)

1. With the site live on your own domain, apply for Google AdSense.
2. AdSense gives you a line for `ads.txt`. Save it as `public/ads.txt` (see `docs/ads.txt.example`), commit and push.
3. Create two responsive display ad units and add the `VITE_ADSENSE_*` variables.
4. Set up the consent message AdSense offers for your visitors’ regions, and check Google’s current requirements for where you operate.
5. Update the advertising section of `privacy.html`.

Ads load only when the variables are set, and only appear after a round and on the end-of-day screen, never while someone is playing.
