const fs = require('fs');
const { chromium } = require('playwright');

const baseUrl = process.env.HIGHTECH_BASE_URL || 'http://127.0.0.1:8505';
const output = process.env.AUDIT_OUTPUT || '/tmp/hightech-runbook-live-audit.json';
const pages = [
  ['welcome', 'welcome'],
  ['foundation', 'datamodel'],
  ['dashboard', 'dashboard'],
  ['signals', 'social'],
  ['graph', 'graph'],
  ['supply', 'fulfillment'],
  ['commitments', 'orders'],
  ['analytics', 'oml'],
  ['ask-data', 'askdata'],
  ['agents', 'agents'],
];

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1066 } });
  const results = [];

  for (const [id, route] of pages) {
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/?page=${route}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    results.push({
      id,
      route,
      title: await page.title(),
      text: await page.locator('main').innerText(),
      headings: await page.locator('main h1, main h2, main h3').allTextContents(),
      buttons: await page.locator('main button').allTextContents(),
      selects: await page.locator('main select').evaluateAll((elements) => elements.map((element) => ({
        value: element.value,
        options: [...element.options].map((option) => ({ value: option.value, label: option.textContent.trim() })),
      }))),
      inputs: await page.locator('main input').evaluateAll((elements) => elements.map((element) => ({
        type: element.type,
        placeholder: element.placeholder,
        value: element.value,
      }))),
      errors,
    });
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(output, `${JSON.stringify({ baseUrl, capturedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log(output);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
