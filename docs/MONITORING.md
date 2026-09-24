# Monitoring Doodle Voyager

## What is deployed

- **Local (primary):** `start-local.cmd` stages the playable files into
  `dist/` (`node tools/stage.mjs`) and serves them at http://127.0.0.1:5178/
  (`node tools/serve.mjs --port 5178 --root dist`). The server sends the same
  security headers a host would (from `dist/_headers`). A hidden launcher in the
  Windows Startup folder (DoodleVoyager-Server.vbs) starts it at logon; a
  logon scheduled task needs admin rights, which this account does not have.
- **Vercel (live):** https://doodle-voyager.vercel.app (project ridelink1/doodle-voyager),
  deployed from dist/ with vercel.json carrying the same headers. To redeploy:
  node tools/stage.mjs, then in dist/: npx vercel link --yes --project doodle-voyager
  and npx vercel deploy --prod --yes (staging wipes dist/, so the link is redone each time).
  The daily task checks both the local and the Vercel copy.
- Netlify was dropped on 2026-09-22 (no credits on the account).

## The daily check

`node tools/monitor.mjs` runs every day at 09:00 from Windows Task Scheduler
(task name `DoodleVoyager Monitor`). It reads the URL from `docs/deploy.json`
(or `--url`), and for that site it checks:

| Check | Why it matters |
|---|---|
| front page answers in under 2 s | the game is reachable at all |
| security headers present | CSP and nosniff arrived with the page |
| `version.json` served, every listed file served with the right hash | nothing is missing or half-uploaded |
| live files match the local `dist/` build | spots a stale deploy (drift) |
| three.js on jsDelivr and Google Fonts reachable | the two outside dependencies |
| `/.git/HEAD`, `/tools/test.mjs`, `/docs/PLAN.md`, `/.env` are not served | nothing private leaks |
| the game boots in headless Chrome, catalogues load, zones roll, frames render | the actual game works, not just the files |
| no console errors | the page is clean |

If the local server is down, the monitor restarts it and logs that it did.

Results: one line per run appended to `docs/monitor-log.md`, the full result
in `docs/monitor-last.json`, and a screenshot in `docs/monitor/` (the last 14
are kept). Exit code 1 means something failed.

## By hand

```
node tools/monitor.mjs                       # the local deploy
node tools/monitor.mjs --url https://....vercel.app/
node tools/monitor.mjs --no-browser          # HTTP checks only, fast
node tools/test.mjs                          # the full end-to-end game test
```

## The scheduled tasks

```
schtasks /Query /TN "DoodleVoyager Monitor"
schtasks /Delete /TN "DoodleVoyager Monitor" /F     # to stop the daily check
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DoodleVoyager-Server.vbs"   # to stop starting the server at logon
```
