// Regenerate the documentation screenshots in docs/screenshots/.
//
// Seeds a fictional roster into localStorage, then drives the real UI to start a
// game and play a scripted set of points, so every derived number (score, line
// suggestion, playing time) is produced by the actual engine rather than
// hand-faked. Captures the Game (line picker), Roster, and Predictor screens.
//
// Prerequisites: `npm install`, `npx playwright install chromium`, and a dev
// server running on BASE_URL (`npm run dev`). Then: `npm run screenshots`.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  DEMO_OUR_TEAM,
  DEMO_THEIR_TEAM,
  DEMO_SCRIPT,
  rosterSeed,
} from './demo-data.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/screenshots');

// A sideline tablet, portrait. Wide enough for the 3-across line grid.
const VIEWPORT = { width: 834, height: 1194 };

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Seed the roster before the app reads it, then reload into a ready app.
  await page.goto(BASE_URL);
  await page.evaluate((roster) => {
    localStorage.setItem('ulb:roster', JSON.stringify(roster));
  }, rosterSeed());
  await page.reload();
  await page.getByRole('link', { name: 'Roster' }).waitFor();

  await playDemoGame(page);

  await shoot(page, 'Game', 'game-line-picker');
  await captureRoster(page);
  await shoot(page, 'Predictor', 'predictor');

  await browser.close();
  console.log(`Wrote screenshots to ${OUT_DIR}`);
}

async function playDemoGame(page) {
  await gotoTab(page, 'Games');
  await page.getByRole('button', { name: 'New game' }).click();

  const teams = page.locator('input:not([type="number"])');
  await teams.nth(0).fill(DEMO_OUR_TEAM);
  await teams.nth(1).fill(DEMO_THEIR_TEAM);
  await page.getByRole('button', { name: 'Start game' }).click();

  // The scoreboard confirms we've landed on the live Game screen.
  await page.getByRole('button', { name: `+1 ${DEMO_OUR_TEAM}` }).waitFor();

  for (const step of DEMO_SCRIPT) {
    if (step === 'h') {
      await page.getByRole('button', { name: 'Start 2nd half' }).click();
      continue;
    }
    const team = step === 'us' ? DEMO_OUR_TEAM : DEMO_THEIR_TEAM;
    await page.getByRole('button', { name: `+1 ${team}` }).click();
  }
}

async function captureRoster(page) {
  await gotoTab(page, 'Roster');
  // Sort by rating so the strongest players lead the list.
  await page.getByRole('button', { name: 'Rating' }).click();
  await settle(page);
  await page.screenshot({ path: resolve(OUT_DIR, 'roster.png'), fullPage: true });
}

async function shoot(page, tab, name) {
  await gotoTab(page, tab);
  await settle(page);
  await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`), fullPage: true });
}

async function gotoTab(page, label) {
  await page.getByRole('link', { name: label, exact: true }).click();
  await settle(page);
}

async function settle(page) {
  await page.waitForTimeout(250);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
