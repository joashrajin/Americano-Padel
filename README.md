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
- Scores and standings are kept for 7 days after the last update
- Works offline (local-only mode if the API is unreachable)

## Stack

Hosted on [Spacefast](https://spacefast.com) at https://americano-padel.space.fast/.

- Front end: `public/`, vanilla JS with no framework
- API: `spacefast/functions/`, [Spacefast Functions](https://spacefast.com/docs/functions) backed by the Space's database, with a daily cron that deletes expired tournaments
- Config: `spacefast/sf.jsonc` (target Space, metadata, cron) and `spacefast/_redirects` (tournament links load the app)

The old `americano-padel.pages.dev` address is a Cloudflare Pages project that redirects every path to the Spacefast site (`cloudflare-redirect/`).

## Development

```bash
npm install
npm run build     # assembles dist/spacefast from public/ and spacefast/
```

Spacefast doesn't run functions locally (`sf dev` refuses them), so test API changes on a published version.

## Deploy

```bash
npm run deploy            # builds and publishes to the americano-padel Space
npm run deploy:redirect   # redeploys the pages.dev redirect (rarely needed)
```

`deploy` needs you signed in with `npx spacefast login`; the target Space is pinned in `spacefast/sf.jsonc`. `deploy:redirect` needs a Cloudflare login (`npx wrangler login`).
