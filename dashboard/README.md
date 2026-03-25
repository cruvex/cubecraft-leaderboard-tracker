# Leaderboard Dashboard

This is a small, lightweight dashboard I added to visualize leaderboard score gains and individual player time series (last 30 days). It's intentionally minimal so you can run it alongside your existing `main.ts` without changing that script.

I wrote the server using Bun and the frontend uses Chart.js via CDN.

## What I added
- `dashboard/server.ts` — Bun HTTP server that serves the frontend and exposes simple API endpoints that query your existing database tables (`leaderboard_snapshots`, `leaderboard_rows`, etc.) using `Bun.sql`.
- `dashboard/public/index.html` — Basic UI to view top gainers and load a player's time series.
- `dashboard/public/app.js` — Frontend logic and chart rendering (Chart.js).

## Prerequisites
- Bun installed and on your PATH (https://bun.sh).
- The same database configuration/environment that your `main.ts` uses must be available to Bun so `Bun.sql` can connect. I do not change `main.ts`; the dashboard uses `Bun.sql` directly and expects the DB to contain the same schema/tables your collector populates.
- Internet access from the machine running the dashboard (Chart.js is loaded from a CDN in the UI).

## Running
From the project root:

1. Start the dashboard server:
   - `bun run dashboard/server.ts`
   - or (depending on your Bun setup) `bun dashboard/server.ts`

2. Open your browser at: `http://localhost:3000` (port can be changed with the `PORT` environment variable).

Example:
```sh
PORT=4000 bun run dashboard/server.ts
# open http://localhost:4000
```

## API endpoints
The server exposes a few simple endpoints used by the UI:

- `GET /api/top-gainers`  
  Returns the top 20 players by score gain in the last 30 days. Response:
  ```json
  [{ "player": "<uuid>", "score_gain": 123 }, ...]
  ```

- `GET /api/player/:uuid/score_gain`  
  Returns a single JSON object with the player's score gain over the last 30 days:
  ```json
  { "player": "<uuid>", "score_gain": 45 }
  ```

- `GET /api/player/:uuid/scores`  
  Returns the time series for a player in the last 30 days:
  ```json
  { "player": "<uuid>", "rows": [{ "timestamp": "...", "score": 123 }, ...] }
  ```

You can test endpoints with curl:
```sh
curl http://localhost:3000/api/top-gainers
curl http://localhost:3000/api/player/d8aa305e-264d-49b8-84ca-aaec79594666/score_gain
curl http://localhost:3000/api/player/d8aa305e-264d-49b8-84ca-aaec79594666/scores
```

## UI
- The homepage shows the Top 20 gainers table.
- Enter a player UUID (defaults to the example UUID used in your queries) and click:
  - "Load Score Gain" to fetch the single-number gain.
  - "Load Time Series" to plot their scores over the last 30 days.

Charting is handled by Chart.js loaded from CDN in `index.html`.

## Notes & next steps
- The server relies on `Bun.sql`. Ensure your environment supplies whatever Bun expects for DB connectivity (for example a `DATABASE_URL` or other config used in your project).
- If you want filtering by game, authentication, or a nicer frontend, tell me which features you want and I can extend the dashboard.
- I kept `main.ts` unchanged as requested; this dashboard reads the same tables produced by your snapshot pipeline.

If you want, I can:
- Add per-game filtering to the endpoints and UI.
- Add simple basic-auth or token protection for the dashboard.
- Bundle Chart.js locally so the UI works offline.
