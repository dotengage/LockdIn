# LockdIn

**Lock in your money goals.** LockdIn is a personal, goal-based savings planner. Set one or more goals (a world tour, a bike, an emergency fund, anything), and LockdIn works out exactly how much to save each month. It tracks where the money sits and keeps everything up to date with quick check-ins.

It's a fully static web app: no server and no account. It works offline and can be installed on your phone's home screen.

## What it does

- **Goals**: simple targets (with optional inflation adjustment) or a detailed **planner**. The planner supports line items, rate × quantity, percent-of-sections, contingency, multi-year spreading and an after-goal cushion. It includes a built-in *2-Year Solo World Tour* template.
- **Real maths**: required monthly saving (flat, or stepping up every January), expected return from your actual holdings, projections, status (on track / behind / ahead) and concrete fixes when you're short. Everything recalculates live.
- **Holdings**: bank, FD, RD, PPF/EPF (interest grows automatically), stocks, mutual funds, bonds, crypto (you update the value), gold and silver (grams × price), and cash.
- **Fair goal ownership**: money in a shared holding is tracked in *units*, like a mutual fund. Each goal gets the gains or losses that happened while its money was in there.
- **Check-ins**: weekly or monthly. Log income, spending, savings per goal and where each rupee went. Missed periods can be filled in or skipped.
- **Valuation prompts** on your schedule for market-linked holdings.
- **Chat assistant** (offline, rule-based). Type things like *"Saved 10k in silver, 30% for the bike and 70% for the tour"* or *"I want to save 5 lakh for a car by Dec 2028"*. It asks for anything missing and shows a confirmation card before saving anything.
- **Dashboard**: KPIs, a savings chart (weekly/monthly/yearly/all time, per goal, invested vs value), goal cards, allocation donut, income vs saving, and plain-English insights.
- **History** with filters, search, edit/delete with undo, and CSV export.
- **Exports**: JSON backup and restore (with preview), a **PDF report** with charts, an **Excel workbook**, and CSV.
- **Sync across devices** through a private GitHub Gist (optional).
- Light/dark/system theme, Indian number formatting (₹1,23,45,678 or ₹1.23 Cr), fully responsive down to 375px, respects reduced motion.
- **Demo data**: Settings → *Load demo data* fills every screen with 12 months of realistic history. *Clear demo data* removes only those records.

## Run locally

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (finance engine, chat parser, backups)
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## Deploy to GitHub Pages

1. Create a GitHub repository named **LockdIn** (the name is set in `REPO_NAME` in `vite.config.ts`; change it there if you use another name, or set `VITE_BASE`).
2. Push this project to the `main` branch.
3. In the repository, go to **Settings → Pages → Build and deployment** and set **Source: GitHub Actions**.
4. Every push to `main` runs `.github/workflows/deploy.yml`. It installs dependencies, runs the tests, builds and publishes to `https://<your-username>.github.io/LockdIn/`.

The app uses hash-based routing (`/#/goals/...`), so refreshes and deep links work on GitHub Pages.

## How data storage works

- All data lives in your browser's **IndexedDB** (via Dexie) on the device you're using. Nothing is sent anywhere by default.
- Clearing site data or uninstalling the browser deletes it, so **download a backup** now and then (Settings → Your data). The dashboard reminds you after 30 days.
- Backups are a single JSON file with a `schemaVersion`. Older files are migrated automatically on import. Invalid files are rejected without touching your data.
- **Optional sync**: in Settings → *Sync across devices*, paste a GitHub token that has only the `gist` permission. LockdIn stores your data in a private gist and syncs when the app opens and a few seconds after each change. If both devices changed, it asks which copy to keep. The token stays in that browser only and is never written into backups.

## Project structure

```
src/
  config.ts              app name, schema version
  lib/
    finance/             pure, tested money maths (compounding, planner, ledger, goals, series, insights)
    chat/                offline natural-language parser + slot-filling conversation engine
    db/                  Dexie schema, backup/migrations
    sync/                GitHub Gist sync
    export/              PDF, Excel and CSV exports
    templates.ts, demo.ts
  store/                 Zustand store (persists to IndexedDB) + derived selectors
  components/            UI primitives, layout, charts
  features/              onboarding, dashboard, goals (+ planner), holdings, check-in, valuation, history, settings, chat
```

To rename the app, change `APP_NAME` in `src/config.ts` (plus the manifest name in `vite.config.ts` and the `<title>` in `index.html`).

> Projections use expected returns, which are assumptions, not guarantees. LockdIn is a planning tool, not financial advice.
