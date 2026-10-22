# Americano Padel

A lightweight web app for running Americano- and Mexicano-format padel tournaments. Create a tournament, share a link, and track scores live — no accounts required.

## Formats

- **Americano** — partners rotate every round on a fixed schedule generated up front, maximising pairing variety.
- **Mexicano** — the organiser picks a number of rounds and each round's pairings are seeded from the live standings (top 4 share a court, paired 1+4 vs 2+3), so matches stay competitive. Round 1 is balanced; later rounds are generated one at a time as scores come in.

## Features

- Two formats: Americano (fixed schedule) and Mexicano (standings-based)
- Supports 4–20 players, 1–4 courts, with fair rest rotation
- Share a live link — viewers see scores update without an account
- Share an **admin code** (or one-tap admin link) so co-organisers can enter scores too; the creator can reset it to revoke access
- Scores and standings persist for 7 days after the last update
- Works offline (local-only mode if the API is unreachable)

## Stack

The app is moving from Cloudflare to [Spacefast](https://spacefast.com). Both deploy from this repo until the switch.

- Front end: `public/index.html`, vanilla JS with no framework, shared by both hosts
- **Spacefast** (`spacefast/`): [Functions](https://spacefast.com/docs/functions) for the API, the Space's database for tournaments, and a daily cron that deletes expired ones
- **Cloudflare** (`functions/`, `wrangler.toml`): Pages Functions and KV, the current production site

## Development

```bash
npm install
npm run dev       # local dev server via wrangler (Cloudflare)
```

Spacefast doesn't run functions locally (`sf dev` refuses them), so test API changes on a published version.

## Deploy

```bash
npm run deploy:spacefast   # builds dist/spacefast and publishes it to the americano-padel Space
npm run deploy             # deploys to Cloudflare Pages
```

`deploy:spacefast` copies `public/` and `spacefast/` into `dist/spacefast` and publishes it. The target Space is pinned in `spacefast/sf.jsonc`, and you need to be signed in with `npx spacefast login`. The Cloudflare deploy needs a Cloudflare account and the `TOURNAMENTS` KV namespace bound in `wrangler.toml`.
