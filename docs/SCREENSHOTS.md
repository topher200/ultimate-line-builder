# Regenerating the screenshots

The images in [`docs/screenshots/`](screenshots/) that the README shows are
generated, not hand-captured, so they can be refreshed whenever the UI changes.

A [Playwright](https://playwright.dev) script seeds a fictional roster into
`localStorage`, then drives the real app: it starts a game and plays a scripted
set of points through the actual engine, so the scoreboard, line suggestion, and
playing-time numbers are all genuine rather than mocked. It captures the Game
(line picker), Roster, and Predictor screens on a tablet-portrait viewport.

## Run it

```bash
npm install
npx playwright install chromium   # one-time: fetch the headless browser
npm run dev                       # in one terminal, serves http://localhost:5173
npm run screenshots               # in another, writes docs/screenshots/*.png
```

Point at a different server with `BASE_URL=http://host:port npm run screenshots`.

## What to edit

- **The demo team, ratings, and score sequence:** `scripts/demo-data.mjs`.
- **Viewport, which screens, capture order:** `scripts/screenshots.mjs`.

After regenerating, review the PNGs and commit them alongside any UI change that
moved them.
