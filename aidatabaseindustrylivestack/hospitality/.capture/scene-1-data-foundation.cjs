const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const OUTPUT_DIR = '/tmp/hospitality-scene-1-captures';
const BASE_URL = 'http://127.0.0.1:8505';
const VIEWPORT = { width: 1440, height: 1100 };
const RED = '#c74634';

async function settle(page, delay = 500) {
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.waitForTimeout(delay);
}

async function position(page, locator, top = 135) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Capture target is not visible.');
  await page.evaluate((delta) => window.scrollBy(0, delta), box.y - top);
  await settle(page, 250);
}

async function clearCallouts(page) {
  await page.evaluate(() => document.querySelectorAll('[data-runbook-callout]').forEach((node) => node.remove()));
}

async function addCallouts(page, locators) {
  await clearCallouts(page);
  const boxes = [];
  for (const locator of locators) {
    const target = locator.first();
    await target.waitFor({ state: 'visible' });
    const box = await target.boundingBox();
    if (!box) throw new Error('Callout target is not visible.');
    boxes.push(box);
  }

  await page.evaluate(({ boxes: targetBoxes, red }) => {
    targetBoxes.forEach((box, index) => {
      const padding = 7;
      const left = Math.max(3, box.x - padding);
      const top = Math.max(3, box.y - padding);
      const right = Math.min(window.innerWidth - 3, box.x + box.width + padding);
      const bottom = Math.min(window.innerHeight - 3, box.y + box.height + padding);

      const outline = document.createElement('div');
      outline.dataset.runbookCallout = 'true';
      Object.assign(outline.style, {
        position: 'fixed', left: `${left}px`, top: `${top}px`,
        width: `${right - left}px`, height: `${bottom - top}px`,
        border: `4px solid ${red}`, borderRadius: '6px', boxSizing: 'border-box',
        boxShadow: '0 0 0 2px rgba(255,255,255,0.95)', pointerEvents: 'none', zIndex: '2147483646',
      });

      const badge = document.createElement('div');
      badge.dataset.runbookCallout = 'true';
      badge.textContent = String(index + 1);
      Object.assign(badge.style, {
        position: 'fixed', left: `${Math.max(4, left - 13)}px`, top: `${Math.max(4, top - 13)}px`,
        width: '29px', height: '29px', borderRadius: '50%', background: red, color: '#fff',
        border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        font: '700 15px Arial, sans-serif', boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
        pointerEvents: 'none', zIndex: '2147483647',
      });
      document.body.append(outline, badge);
    });
  }, { boxes, red: RED });
}

async function capture(page, name) {
  const destination = path.join(OUTPUT_DIR, name);
  await page.screenshot({ path: destination, animations: 'disabled' });
  console.log(`Captured ${destination}`);
  await clearCallouts(page);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: 'light' });
  page.setDefaultTimeout(60000);

  try {
    await page.goto(`${BASE_URL}/?page=datamodel`, { waitUntil: 'networkidle' });
    await page.getByText('Ava Chen', { exact: true }).waitFor();
    await page.getByText('5,000', { exact: true }).first().waitFor();
    await settle(page);

    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 250);
    await capture(page, 'data-foundation.png');

    const prepareHeading = page.getByRole('heading', { name: 'Prepare the Dataset', exact: true });
    const prepareCard = prepareHeading.locator('xpath=ancestor::div[contains(@class,"glass-card")][1]');
    await position(page, prepareHeading, 135);
    await addCallouts(page, [
      page.getByRole('button', { name: 'Restore Demo Data', exact: true }),
      prepareCard.locator('.grid').first(),
    ]);
    await capture(page, 'prepare-dataset.png');

    const loadedHeading = page.getByRole('heading', { name: 'What Gets Loaded', exact: true });
    const loadedCard = loadedHeading.locator('xpath=ancestor::div[contains(@class,"glass-card")][1]');
    await position(page, loadedHeading, 135);
    await addCallouts(page, [
      loadedCard.locator('[aria-label="Loaded data groups"]'),
      page.getByRole('button', { name: 'Show next loaded data domains', exact: true }),
    ]);
    await capture(page, 'what-gets-loaded.png');

    await page.getByRole('button', { name: 'Show Oracle Internals', exact: true }).click();
    await settle(page, 350);
    const internalsHeading = page.getByText('Demo Readiness', { exact: true }).first();
    await internalsHeading.waitFor({ state: 'visible' });
    await addCallouts(page, [
      page.getByText('Load the hospitality demo data.', { exact: true }).first()
        .locator('xpath=ancestor::section[1]'),
      internalsHeading.locator('xpath=ancestor::div[contains(@class,"space-y-4")][1]'),
    ]);
    await capture(page, 'foundation-story-and-oracle-internals.png');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
