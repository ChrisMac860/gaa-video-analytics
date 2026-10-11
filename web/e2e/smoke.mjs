// End-to-end smoke test of the built site (run `npm run build && npx vite preview --port 4173` first).
// Usage: node e2e/smoke.mjs [processor-analysis.json]
// Uses the preinstalled Chromium if PLAYWRIGHT_BROWSERS_PATH is set; otherwise `npx playwright install chromium`.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const cvJson = process.argv[2];
const errors = [];
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const ok = (m) => console.log('ok  ', m);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept());
await page.goto(BASE);

await page.getByRole('tab', { name: /Export/ }).click();
await page.locator('#panel-data').getByRole('button', { name: 'Load demo match' }).click();
await page.getByRole('tab', { name: /Statistics/ }).click();
const statsText = await page.locator('#panel-stats').innerText();
statsText.includes('1-10 (13)') && statsText.includes('1-08 (11)') ? ok('demo scoreline 1-10 (13) v 1-08 (11)') : fail('demo scoreline missing');
/unknown/.test(statsText) ? ok('untagged categories shown as unknown') : fail('no unknown shown');

await page.getByRole('tab', { name: /Review/ }).click();
(await page.locator('#panel-review h3.team-h').first().innerText()).includes('Ballymore') ? ok('tag panel shows team names after load') : fail('tag panel team name stale');
await page.getByRole('tab', { name: /Report/ }).click();
(await page.locator('#panel-report').innerText()).includes('DEMO DATA') ? ok('report carries DEMO banner') : fail('no DEMO banner');

if (cvJson) {
  await page.getByRole('tab', { name: /Export/ }).click();
  await page.setInputFiles('#import-cv', cvJson);
  await page.getByRole('tab', { name: /CV candidates/ }).click();
  const cvText = await page.locator('#panel-cv').innerText();
  /YOLOX/i.test(cvText) ? ok('CV run info shown') : fail('CV run info missing');
  /not.implemented/i.test(cvText) ? ok('not-implemented capabilities disclosed') : fail('capabilities not shown');
  const before = await page.getByRole('tab', { name: /Review/ }).count();
  const accept = page.getByRole('button', { name: 'Accept…' }).first();
  if (await accept.count()) {
    await accept.click();
    await page.locator('#event-form').getByLabel('Event type').selectOption('turnover');
    await page.locator('#event-form').getByLabel('Team', { exact: true }).selectOption('home');
    await page.getByRole('button', { name: 'Accept and add event' }).click();
    const reviewText = await page.locator('#panel-review').innerText();
    /CV candidate accepted/.test(reviewText) ? ok('accepted candidate appears as CV-verified event') : fail('accepted event not listed');
  } else {
    ok(`no candidates in ${cvJson} (accept flow skipped) ${before}`);
  }
}

errors.length ? fail('console/page errors: ' + errors.join(' | ')) : ok('no console errors');
await browser.close();
