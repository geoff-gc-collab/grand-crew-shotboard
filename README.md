# Grand Crew — Shot Board

A purpose-built shot list tool for Grand Crew shoots. Card-based, color-coded
by shooting day, no spreadsheet column-resizing — built to replace the
Google Sheets shot list workflow.

## What's here

- **Next.js (App Router)** front end + API routes
- **JSON file storage** (`data/data.json`, created automatically on first run)
  — no database setup required to get started
- Multiple projects supported — each shoot gets its own board
- Each project has its own days (any number, any color), and each day holds
  scenes you can add, edit, reorder, move between days, and delete (with undo)

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000 — the "42nd Strt" board is pre-loaded with
the current shot list as a starting example.

## Deploying this for real use

This app keeps its data in a single JSON file on disk
(`data/data.json`), written on every edit. That means **it needs a host with
a persistent filesystem** — a small VPS, or a platform like Railway, Render,
or Fly.io that gives the app a persistent volume.

**It will NOT work as-is on Vercel or other serverless hosts** — their
functions don't have a writable, persistent disk between requests, so edits
would silently vanish. If you want to deploy there instead, swap
`lib/store.js` for a hosted database call (a few good low-effort options:
Turso/libSQL, Supabase, or Neon Postgres — all have generous free tiers and
a simple JS client).

### Quick path to a real deploy
1. Push this folder to a GitHub repo
2. Spin up a small app on Railway or Render, pointed at that repo
3. Set the build command to `npm install && npm run build` and the start
   command to `npm run start`
4. Attach a persistent volume mounted at `/app/data` (or wherever this
   project ends up living) so `data/data.json` survives restarts/redeploys

## Extending it

- `lib/store.js` — all data reads/writes go through here. This is the only
  file you'd touch to swap JSON-file storage for a real database later.
- `components/ShotBoard.js` — the main interactive board (cards, days, edits)
- `components/ProjectList.js` — the project picker / home screen
- API routes live under `app/api/` — one route per resource
  (`projects`, `projects/[id]`, `projects/[id]/scenes`, etc.)

Natural next features if this sticks around as a real studio tool:
basic auth (so it's not editable by literally anyone with the link),
per-scene photo upload instead of pasted image URLs, and a printable/PDF
call-sheet export.
