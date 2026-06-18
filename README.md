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
- Scores and standings persist for 7 days via Cloudflare KV
- Works offline (local-only mode if the API is unreachable)

## Stack

- [Cloudflare Pages](https://pages.cloudflare.com/) — static hosting + serverless functions
- [Cloudflare KV](https://developers.cloudflare.com/kv/) — tournament persistence
- Vanilla JS, no framework

## Development

```bash
npm install
npm run dev       # local dev server via wrangler
```

## Deploy

```bash
npm run deploy    # deploys to Cloudflare Pages
```

Requires a Cloudflare account and a KV namespace bound as `TOURNAMENTS` in `wrangler.toml`.
