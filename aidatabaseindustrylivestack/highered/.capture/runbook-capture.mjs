import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8505';
const outputDir = process.env.OUTPUT_DIR || '/captures';
const only = new Set((process.env.ONLY || '').split(',').map((value) => value.trim()).filter(Boolean));

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 1066 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'Europe/Amsterdam',
});

const page = await context.newPage();
page.setDefaultTimeout(30_000);

page.on('console', (message) => {
  if (message.type() === 'error') console.error(`[browser console] ${message.text()}`);
});
page.on('pageerror', (error) => console.error(`[page error] ${error.message}`));

async function settle(milliseconds = 900) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(milliseconds);
}

async function openPage(pageId = 'welcome', expectedText) {
  const query = pageId === 'welcome' ? '' : `?page=${encodeURIComponent(pageId)}`;
  await page.goto(`${baseUrl}/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('.app-shell').waitFor({ state: 'visible' });
  if (expectedText) await page.getByText(expectedText, { exact: true }).first().waitFor({ state: 'visible' });
  await page.evaluate(() => {
    localStorage.removeItem('higheredLivestack.customerName');
    document.documentElement.style.background = '#ffffff';
    document.body.style.background = '#ffffff';
    const style = document.createElement('style');
    style.id = 'runbook-capture-stability';
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
      html { scroll-behavior: auto !important; }
    `;
    document.head.appendChild(style);
  });
  await settle();
}

function exactText(text) {
  return page.getByText(text, { exact: true }).first();
}

function closest(locator, selector) {
  return locator.locator(`xpath=ancestor::*[${selector}][1]`);
}

function closestClass(locator, className) {
  return closest(locator, `contains(concat(' ', normalize-space(@class), ' '), ' ${className} ')`);
}

async function position(locator, top = 150) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Could not position an invisible target.');
  await page.evaluate((delta) => window.scrollBy(0, delta), box.y - top);
  await settle(250);
}

async function removeHighlights() {
  await page.evaluate(() => document.querySelectorAll('.runbook-capture-highlight').forEach((node) => node.remove()));
}

async function highlightEach(locators, padding = 4) {
  const rectangles = [];
  for (const locator of locators) {
    const count = await locator.count();
    if (!count) throw new Error(`Highlight target not found: ${locator}`);
    const box = await locator.first().boundingBox();
    if (!box || box.width < 2 || box.height < 2) throw new Error('Highlight target is not visible.');
    rectangles.push(box);
  }
  await page.evaluate(({ rectangles: rects, padding: pad }) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    for (const rect of rects) {
      const left = Math.max(2, rect.x - pad);
      const top = Math.max(2, rect.y - pad);
      const right = Math.min(viewportWidth - 2, rect.x + rect.width + pad);
      const bottom = Math.min(viewportHeight - 2, rect.y + rect.height + pad);
      const overlay = document.createElement('div');
      overlay.className = 'runbook-capture-highlight';
      Object.assign(overlay.style, {
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.max(1, right - left)}px`,
        height: `${Math.max(1, bottom - top)}px`,
        border: '3px solid #d91e18',
        borderRadius: '7px',
        boxSizing: 'border-box',
        boxShadow: '0 0 0 2px rgba(255,255,255,0.94), 0 0 12px rgba(199,70,52,0.48)',
        pointerEvents: 'none',
        zIndex: '2147483647',
      });
      document.body.appendChild(overlay);
    }
  }, { rectangles, padding });
}

async function highlightUnion(locators, padding = 6) {
  const boxes = [];
  for (const locator of locators) {
    const box = await locator.first().boundingBox();
    if (!box) throw new Error('Union highlight target is not visible.');
    boxes.push(box);
  }
  const union = boxes.reduce((result, box) => ({
    x: Math.min(result.x, box.x),
    y: Math.min(result.y, box.y),
    width: Math.max(result.x + result.width, box.x + box.width) - Math.min(result.x, box.x),
    height: Math.max(result.y + result.height, box.y + box.height) - Math.min(result.y, box.y),
  }));
  await page.evaluate(({ rect, padding: pad }) => {
    const left = Math.max(2, rect.x - pad);
    const top = Math.max(2, rect.y - pad);
    const right = Math.min(window.innerWidth - 2, rect.x + rect.width + pad);
    const bottom = Math.min(window.innerHeight - 2, rect.y + rect.height + pad);
    const overlay = document.createElement('div');
    overlay.className = 'runbook-capture-highlight';
    Object.assign(overlay.style, {
      position: 'fixed', left: `${left}px`, top: `${top}px`,
      width: `${right - left}px`, height: `${bottom - top}px`,
      border: '3px solid #d91e18', borderRadius: '7px', boxSizing: 'border-box',
      boxShadow: '0 0 0 2px rgba(255,255,255,0.94), 0 0 12px rgba(199,70,52,0.48)',
      pointerEvents: 'none', zIndex: '2147483647',
    });
    document.body.appendChild(overlay);
  }, { rect: union, padding });
}

async function screenshot(name) {
  await settle(200);
  const path = `${outputDir}/${name}.png`;
  await page.screenshot({ path, type: 'png', fullPage: false, animations: 'disabled' });
  console.log(`captured ${path}`);
  await removeHighlights();
}

async function run(name, task) {
  if (only.size && !only.has(name)) return;
  console.log(`starting ${name}`);
  try {
    await task();
  } catch (error) {
    console.error(`FAILED ${name}: ${error.stack || error.message}`);
    throw error;
  }
}

await run('scene-1-welcome-and-demo-orientation', async () => {
  await openPage('welcome', 'Start the demo');
  const journey = page.locator('.welcome-story-rail');
  const start = page.getByRole('button', { name: 'Start the demo' });
  await highlightEach([journey, start], 5);
  await screenshot('scene-1-welcome-and-demo-orientation');
});

await run('scene-2-data-foundation-loaded-domains', async () => {
  await openPage('datamodel', 'What Gets Loaded');
  const next = page.getByRole('button', { name: 'Show next loaded data domains' });
  await position(exactText('What Gets Loaded'), 140);
  await next.click();
  await exactText('Showing 4-6 of 6').waitFor();
  await settle();
  const loadedSection = closestClass(exactText('What Gets Loaded'), 'glass-card');
  await highlightEach([
    loadedSection.getByText('Campus Service Coverage', { exact: true }),
    loadedSection.getByText('Student Request Documents', { exact: true }),
    loadedSection.getByText('ML, Vector, and AI Agents', { exact: true }),
  ], 5);
  await screenshot('scene-2-data-foundation-loaded-domains');
});

// Dashboard captures are handled in one loaded page to keep live figures consistent.
if (!only.size || only.has('scene-3-student-success-command-center') || only.has('scene-3-high-demand-services-table')) {
  await openPage('dashboard', 'Student Success Command Center');
  await exactText('Student Requests').waitFor();
  await page.getByText('Signal Velocity', { exact: true }).waitFor();
  if (!only.size || only.has('scene-3-student-success-command-center')) {
    const statCards = page.locator('.stat-card');
    const chartOne = closestClass(exactText('Signal Velocity'), 'glass-card');
    const chartTwo = closestClass(exactText('Student Support Value by Category'), 'glass-card');
    await highlightEach([statCards.nth(0), statCards.nth(1), statCards.nth(2), statCards.nth(3), statCards.nth(4)], 3);
    await highlightEach([chartOne, chartTwo], 4);
    await screenshot('scene-3-student-success-command-center');
  }
  if (!only.size || only.has('scene-3-high-demand-services-table')) {
    const shuttle = exactText('Campus Shuttle Pass');
    await position(shuttle, 235);
    const row = shuttle.locator('xpath=ancestor::tr[1]');
    const tableCard = row.locator('xpath=ancestor::div[contains(@class,"glass-card")][1]');
    const search = page.getByPlaceholder('Search student services or programs...');
    const heading = tableCard.locator('h3').filter({ hasText: 'High-Demand Services' });
    await highlightEach([heading, search, row], 4);
    await screenshot('scene-3-high-demand-services-table');
  }
}

await run('scene-4-vector-search-results', async () => {
  await openPage('social', 'Student Service Vector Search');
  const example = exactText('financial aid appeal and scholarship matching');
  await example.click();
  await page.getByText(/student services matched for/i).waitFor({ timeout: 60_000 });
  const summary = page.getByText(/student services matched for/i).first();
  const results = summary.locator('xpath=ancestor::div[contains(@class,"mt-3")][1]');
  const queryInput = page.getByRole('textbox').first();
  await position(summary, 270);
  await highlightEach([queryInput, results], 5);
  await screenshot('scene-4-vector-search-results');
});

await run('scene-4-student-signal-feed-platforms', async () => {
  await openPage('social', 'Student Service Vector Search');
  const postCards = page.locator('.glass-card.p-4.fade-in');
  await postCards.first().waitFor();
  await position(postCards.first(), 170);
  await highlightEach([postCards.nth(0), postCards.nth(1), postCards.nth(2)], 4);
  await screenshot('scene-4-student-signal-feed-platforms');
});

await run('scene-5-advisor-program-and-support-network', async () => {
  await openPage('graph', 'Advisor, Program & Support Network');
  const advocatesLabel = page.getByText(/SUCCESS ADVOCATES/i).first();
  const graphSvg = page.locator('svg').first();
  await graphSvg.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('svg .node').length > 5, null, { timeout: 60_000 });
  const advocates = closestClass(advocatesLabel, 'glass-card');
  await highlightEach([advocates, graphSvg], 5);
  await screenshot('scene-5-advisor-program-and-support-network');
});

await run('scene-5-graph-query-explorer', async () => {
  await openPage('graph', 'Advisor, Program & Support Network');
  const explorer = exactText('Graph Query Explorer');
  await position(explorer, 160);
  const supportReach = page.getByText(/Support Reach/i).first();
  const bridge = page.getByText(/Cross-Channel Bridge/i).first();
  await highlightEach([
    explorer,
    supportReach.locator('xpath=ancestor::button[1]'),
    bridge.locator('xpath=ancestor::button[1]'),
  ], 5);
  await screenshot('scene-5-graph-query-explorer');
});

async function enableLayer(label) {
  const control = page.getByLabel(`${label} layer`);
  await control.waitFor();
  const checked = await control.getAttribute('aria-checked');
  if (checked !== 'true') await control.click();
}

await run('scene-6-campus-service-coverage', async () => {
  await openPage('fulfillment', 'Campus Service Coverage');
  await page.locator('.leaflet-container').waitFor();
  await enableLayer('Student Support Tiers');
  await enableLayer('Campus Service Sites');
  await enableLayer('Student Demand Regions');
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-overlay-pane path').length > 8, null, { timeout: 60_000 });
  await settle(1_500);
  const map = page.locator('.fulfillment-map-card');
  await position(map, 335);
  await highlightEach([
    page.getByText('Student Support Tiers', { exact: true }),
    page.getByText('Campus Service Sites', { exact: true }).first(),
    page.getByText('Student Demand Regions', { exact: true }),
  ], 5);
  await screenshot('scene-6-campus-service-coverage');
});

await run('scene-6-campus-service-layer-toggles', async () => {
  await openPage('fulfillment', 'Campus Service Coverage');
  await page.locator('.leaflet-container').waitFor();
  await enableLayer('Campus Service Sites');
  await enableLayer('Service Zones');
  await enableLayer('H3 Density Grid');
  await enableLayer('Student Demand Regions');
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-overlay-pane path').length > 10, null, { timeout: 60_000 });
  await settle(1_500);
  const map = page.locator('.fulfillment-map-card');
  const panel = page.locator('.fulfillment-layer-panel');
  await position(map, 335);
  await highlightEach([panel], 5);
  await screenshot('scene-6-campus-service-layer-toggles');
});

await run('scene-7-student-requests-cases', async () => {
  await openPage('orders', 'Student Requests & Cases');
  const elena = exactText('Elena Williams');
  await elena.waitFor();
  const row = elena.locator('xpath=ancestor::tr[1]');
  const filter = page.locator('.orders-status-filter');
  await highlightEach([filter, row], 5);
  await screenshot('scene-7-student-requests-cases');
});

await run('scene-7-student-request-detail', async () => {
  await openPage('orders', 'Student Requests & Cases');
  const elena = exactText('Elena Williams');
  await elena.click();
  const expanded = page.locator('.orders-detail-panel');
  const relationalButton = page.getByRole('button', { name: 'Relational' });
  await expanded.waitFor();
  await position(expanded, 395);
  await highlightEach([relationalButton, expanded], 5);
  await screenshot('scene-7-student-request-detail');
});

await run('scene-7-student-request-json-duality', async () => {
  await openPage('orders', 'Student Requests & Cases');
  const elena = exactText('Elena Williams');
  await elena.click();
  const jsonButton = page.getByRole('button', { name: 'JSON Duality View' });
  await jsonButton.click();
  const jsonHeading = page.getByText('JSON Document', { exact: true });
  await jsonHeading.waitFor();
  const jsonDocument = jsonHeading.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  const expanded = page.locator('.orders-detail-panel');
  await position(expanded, 395);
  await highlightEach([jsonButton, jsonDocument], 5);
  await screenshot('scene-7-student-request-json-duality');
});

async function captureOml(name, buttonLabel, heading) {
  await openPage('oml', 'Predictive Student Success Analytics');
  const button = page.getByRole('button', { name: buttonLabel });
  if (buttonLabel !== 'Demand Surge') await button.click();
  const sectionHeading = exactText(heading);
  await sectionHeading.waitFor({ timeout: 60_000 });
  const section = closestClass(sectionHeading, 'glass-card');
  await position(button, 405);
  await highlightEach([button, section], 5);
  await screenshot(name);
}

await run('scene-8-demand-surge-results', () => captureOml('scene-8-demand-surge-results', 'Demand Surge', 'Student Demand Predictions'));
await run('scene-8-engagement-segments-results', () => captureOml('scene-8-engagement-segments-results', 'Engagement Segments', 'Student Engagement Segmentation'));
await run('scene-8-vector-kmeans-results', () => captureOml('scene-8-vector-kmeans-results', 'Vector K-Means', 'Vector K-Means Clustering'));

await run('scene-9-ask-data-run-sql-results', async () => {
  await openPage('askdata', 'Ask Seer Higher Ed Data');
  const runSql = page.getByRole('button', { name: 'Run SQL' });
  await runSql.click();
  const question = exactText('Which academic programs show the highest retention pressure?');
  const tile = closestClass(question, 'askdata-example-tile');
  await tile.getByText('Ask', { exact: true }).click();
  await page.getByText(/ROWS RETURNED/i).waitFor({ timeout: 120_000 });
  const targetRow = page.getByText('Desert Workforce Institute', { exact: true }).locator('xpath=ancestor::tr[1]');
  const resultTable = targetRow.locator('xpath=ancestor::table[1]');
  await position(resultTable, 370);
  await highlightEach([runSql, targetRow], 5);
  await screenshot('scene-9-ask-data-run-sql-results');
});

await run('scene-10-student-success-agent-console', async () => {
  await openPage('agents', 'Student Success Agent Console');
  const chatHeading = exactText('Chat with AI Agents');
  const question = exactText('Find urgent FAFSA verification and emergency aid signals in the last 24 hours');
  const actions = exactText('Recent Agent Actions');
  await highlightEach([chatHeading, closestClass(question, 'agent-console-example-tile'), closestClass(actions, 'glass-card')], 5);
  await screenshot('scene-10-student-success-agent-console');
});

await run('scene-10-agent-trend-response', async () => {
  await openPage('agents', 'Student Success Agent Console');
  const question = exactText('Find urgent FAFSA verification and emergency aid signals in the last 24 hours');
  const tile = closestClass(question, 'agent-console-example-tile');
  const responsePromise = page.waitForResponse((response) => (
    response.url().includes('/api/agents/chat') && response.request().method() === 'POST'
  ), { timeout: 60_000 });
  await tile.getByText('Ask', { exact: true }).click();
  const apiResponse = await responsePromise;
  const payload = await apiResponse.json();
  const responseText = page.getByText(payload.response, { exact: true });
  await responseText.waitFor({ timeout: 30_000 });
  const actionsHeading = exactText('Recent Agent Actions');
  const actions = closestClass(actionsHeading, 'glass-card');
  await position(responseText, 230);
  await settle(1_000);
  await highlightEach([responseText, actions], 5);
  await screenshot('scene-10-agent-trend-response');
});

await browser.close();
