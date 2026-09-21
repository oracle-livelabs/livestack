const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const OUTPUT_DIR = '/tmp/hospitality-scene-2-captures';
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
    await page.goto(`${BASE_URL}/?page=dashboard`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Property Performance Command Center', exact: true }).last().waitFor();
    await page.getByText('Reservations', { exact: true }).first().waitFor();
    await settle(page);

    const navButton = page.getByRole('button', { name: /Property Performance Command Center/ }).first();
    const storyPanel = page.locator('section.hospitality-story-panel');
    const statGrid = page.locator('.dashboard-stat-card').first().locator('xpath=parent::div');

    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 250);
    await addCallouts(page, [navButton, storyPanel, statGrid]);
    await capture(page, 'portfolio-kpis.png');

    const velocityHeading = page.getByRole('heading', { name: 'Guest and Demand Signal Velocity', exact: true });
    const velocityCard = velocityHeading.locator('xpath=ancestor::div[contains(@class,"glass-card")][1]');
    const oneYearButton = page.getByRole('button', { name: '1y', exact: true });
    const revenueHeading = page.getByRole('heading', { name: 'Revenue Impact by Room Type and Revenue Center', exact: true });
    const revenueCard = revenueHeading.locator('xpath=ancestor::div[contains(@class,"glass-card")][1]');

    await oneYearButton.click();
    await settle(page, 1400);
    await position(page, velocityHeading, 145);
    await addCallouts(page, [
      velocityHeading,
      oneYearButton,
      velocityCard.locator('.recharts-responsive-container').first(),
      revenueCard,
    ]);
    await capture(page, 'demand-signal-velocity.png');

    const riskHeading = page.getByRole('heading', { name: /Room Type or Revenue Centers Under Operational Risk Review/ });
    const riskCard = riskHeading.locator('xpath=ancestor::div[contains(@class,"glass-card")][1]');
    const searchField = riskCard.getByPlaceholder('Search room types, revenue centers, or properties...');
    const table = riskCard.locator('table');

    await position(page, riskHeading, 145);
    await addCallouts(page, [
      riskHeading,
      searchField,
      table.locator('thead tr'),
      table.locator('tbody tr').first(),
    ]);
    await capture(page, 'operational-risk-room-types.png');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
