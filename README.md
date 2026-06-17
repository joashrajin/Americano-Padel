# Americano Padel

A lightweight web app for running Americano-format padel tournaments. Create a tournament, share a link, and track scores live — no accounts required.

## What is Americano?

Americano is a padel format where partners rotate each round. The app auto-generates a schedule to maximise variety in pairings, then tracks scores and updates the leaderboard in real time.

## Features

- Supports 4–20 players, 1–4 courts
- Auto-generates a round schedule with balanced partner rotation
- Share a live link — viewers see scores update without an account
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
