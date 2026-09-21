const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8505';
const outputDir = process.env.OUTPUT_DIR || '/tmp/hospitality-runbook-build/screenshots';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const scenes = [
  ['welcome', 'introduction/images/hospitality-livestack-welcome.png'],
  ['datamodel', 'scene-1-data-foundation/images/data-foundation.png'],
  ['dashboard', 'scene-2-property-performance-command-center/images/property-performance-command-center.png'],
  ['social', 'scene-3-guest-and-demand-signal-intelligence/images/guest-and-demand-signal-intelligence.png'],
  ['graph', 'scene-4-guest-experience-network-graph/images/guest-experience-network-graph.png'],
  ['fulfillment', 'scene-5-housekeeping-and-maintenance-coverage-map/images/housekeeping-and-maintenance-coverage-map.png'],
  ['orders', 'scene-6-reservation-and-folio-operations/images/reservation-and-folio-operations.png'],
  ['oml', 'scene-7-oml-occupancy-revenue-and-labor-analytics/images/oml-occupancy-revenue-and-labor-analytics.png'],
  ['askdata', 'scene-8-ask-hospitality-data/images/ask-hospitality-data.png'],
  ['agents', 'scene-9-hospitality-agent-console/images/hospitality-agent-console.png'],
  ['ownerfinancial', 'scene-10-owner-financial-validation-workbench/images/owner-financial-validation-workbench.png'],
];

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'Europe/Amsterdam',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  for (const [route, relative] of scenes) {
    const query = route === 'welcome' ? '' : `?page=${route}`;
    await page.goto(`${baseUrl}/${query}`, { waitUntil: 'networkidle' });
    await page.locator('#root').waitFor({ state: 'visible' });
    await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
    await page.waitForTimeout(1000);
    const destination = path.join(outputDir, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    await page.screenshot({ path: destination, animations: 'disabled' });
    console.log(`Captured ${relative}`);
  }
  await browser.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
