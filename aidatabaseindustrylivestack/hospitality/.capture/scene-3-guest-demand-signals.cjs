const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const OUTPUT_DIR = '/tmp/hospitality-scene-3-captures';
const BASE_URL = 'http://127.0.0.1:8505';
const VIEWPORT = { width: 1440, height: 1100 };
const RED = '#c74634';

async function settle(page, delay = 500) {
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.waitForTimeout(delay);
}

async function position(page, locator, top = 145) {
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

async function openScene(page) {
  await page.goto(`${BASE_URL}/?page=social`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Hospitality LiveStack Guest & Demand Signal Monitor', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Brand Standards & Operational Risk Activity Feed', exact: true }).waitFor();
  await settle(page, 800);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: 'light' });
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await openScene(page);

    const navButton = page.getByRole('button', { name: /Guest & Demand Signal Intelligence/ }).first();
    const feedHeading = page.getByRole('heading', { name: 'Brand Standards & Operational Risk Activity Feed', exact: true });
    const feedControls = feedHeading.locator('xpath=following::div[contains(@class,"jet-control-row")][1]');
    const bulletinCount = page.getByText(/5\.0K bulletins/).first();
    const firstBulletin = feedControls
      .locator('xpath=following::div[contains(concat(" ", normalize-space(@class), " "), " glass-card ")][1]');

    await position(page, feedHeading);
    await addCallouts(page, [navButton, feedControls, bulletinCount, firstBulletin]);
    await capture(page, 'signal-feed.png');

    await openScene(page);
    const vectorHeading = page.getByRole('heading', { name: 'Room Type & Revenue Center Intelligence Search', exact: true });
    const vectorInput = page.getByRole('textbox', { name: 'Search room types, guest signals, channel issues, or operational scenarios...', exact: true });
    const vectorSearchButton = page.getByRole('button', { name: 'Search', exact: true });
    await vectorInput.fill('housekeeping delays tied to arrival pressure');
    await vectorSearchButton.click();
    const matchSummary = page.getByText(/8 room types matched for/).first();
    await matchSummary.waitFor();
    const firstVectorMatch = page.getByText('Availability Stress Test Series B', { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');

    await position(page, vectorHeading);
    await addCallouts(page, [vectorInput, vectorSearchButton, matchSummary, firstVectorMatch]);
    await capture(page, 'semantic-evidence-search.png');

    await openScene(page);
    const postInput = page.getByRole('textbox', { name: 'Search guest issues, OTA discrepancies, demand spikes, or service alerts...', exact: true });
    const goButton = page.getByRole('button', { name: 'Go', exact: true });
    await postInput.fill('OTA overbooking guest recovery');
    await goButton.click();
    const resultCount = page.getByText(/matches · \d+ms/).first();
    await resultCount.waitFor();
    const rankedLabel = page.getByText(/Operational Risk intelligence results for/).first().locator('xpath=parent::div');
    const firstRankedBulletin = page.getByText(/^#1 ·/).first()
      .locator('xpath=ancestor::div[contains(@class,"glass-card")][1]');

    await position(page, feedHeading);
    await addCallouts(page, [postInput, goButton, rankedLabel, firstRankedBulletin]);
    await capture(page, 'signal-escalation.png');

    await openScene(page);
    await page.getByRole('combobox', { name: 'All Severity', exact: true }).click();
    await page.getByRole('gridcell', { name: 'Critical', exact: true }).click();
    await settle(page, 800);
    const filteredCount = await page.getByText(/bulletins$/).first().textContent();
    console.log(`Severity filter returned ${filteredCount}.`);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
    await mobile.goto(`${BASE_URL}/?page=social`, { waitUntil: 'networkidle' });
    await mobile.getByRole('heading', { name: 'Hospitality LiveStack Guest & Demand Signal Monitor', exact: true }).waitFor();
    const mobileLayout = await mobile.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    await mobile.close();
    if (mobileLayout.documentWidth > mobileLayout.viewportWidth) {
      throw new Error(`Mobile overflow: ${mobileLayout.documentWidth}px document in ${mobileLayout.viewportWidth}px viewport.`);
    }
    console.log(`Mobile layout fits ${mobileLayout.viewportWidth}px without horizontal overflow.`);

    if (consoleErrors.length > 0) {
      throw new Error(`Browser console errors:\n${consoleErrors.join('\n')}`);
    }
    console.log('No browser console or page errors detected.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
