const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const OUTPUT_DIR = '/tmp/hospitality-scenes-4-10-captures';
const BASE_URL = 'http://127.0.0.1:8505';
const VIEWPORT = { width: 1440, height: 1100 };
const RED = '#c74634';

async function settle(page, delay = 500) {
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.waitForTimeout(delay);
}

async function position(page, locator, top = 150) {
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

async function capture(page, scene, name) {
  const destination = path.join(OUTPUT_DIR, scene, name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await page.screenshot({ path: destination, animations: 'disabled' });
  console.log(`Captured ${destination}`);
  await clearCallouts(page);
}

async function openScene(page, id, heading) {
  await page.goto(`${BASE_URL}/?page=${id}`, { waitUntil: 'networkidle' });
  await page.getByRole('main').getByRole('heading', { name: heading, exact: true }).first().waitFor();
  await settle(page, 700);
}

async function scene4(page) {
  await openScene(page, 'graph', 'Guest Experience Network');
  const nav = page.getByRole('button', { name: 'Guest Experience Network Graph' }).first();
  const search = page.getByRole('textbox', { name: 'Search guest issue entities' });
  const depth = page.getByRole('tablist', { name: 'Investigation depth' });
  const profiles = page.getByRole('heading', { name: /Guest Profiles/ }).locator('xpath=ancestor::div[contains(@class,"glass-card")][1]');
  await position(page, search, 190);
  await addCallouts(page, [nav, search, depth, profiles]);
  await capture(page, 'scene-4', 'graph-workspace.png');

  await page.getByRole('button', { name: 'Investigate GUEST-8841' }).click();
  await page.getByRole('tab', { name: 'Show 3 relationship layers' }).click();
  await settle(page, 600);
  const guest = page.getByRole('button', { name: 'Investigate GUEST-8841' });
  const depth3 = page.getByRole('tab', { name: 'Show 3 relationship layers' });
  const target = page.getByText('Primary Investigation Target', { exact: true }).locator('xpath=ancestor::div[contains(@class,"glass-card")][1]');
  const graph = page.locator('svg').filter({ has: page.locator('g') }).last();
  await position(page, target, 285);
  await addCallouts(page, [guest, depth3, target, graph]);
  await capture(page, 'scene-4', 'connected-exposure.png');

  const explorer = page.getByRole('heading', { name: 'Investigation Query Explorer', exact: true });
  await explorer.scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Open Guest-Centered Risk Reach (N-Hop Traversal)' }).click();
  await page.getByRole('button', { name: 'Run Query', exact: true }).click();
  await page.getByText(/rows returned/).first().waitFor();
  await settle(page, 500);
  const queryTitle = page.getByRole('heading', { name: 'Guest-Centered Risk Reach (N-Hop Traversal)', exact: true });
  const run = page.getByRole('button', { name: 'Run Query', exact: true });
  const stats = page.getByText(/rows returned/).first().locator('xpath=parent::*');
  const sql = page.locator('pre').filter({ hasText: /MATCH|SELECT/i }).first();
  const table = page.locator('table').last();
  await position(page, queryTitle, 155);
  await addCallouts(page, [queryTitle, run, stats, sql, table]);
  await capture(page, 'scene-4', 'sql-pgq-query.png');
}

async function scene5(page) {
  await openScene(page, 'fulfillment', 'Guest Service & SLA Coverage');
  const nav = page.getByRole('button', { name: 'Housekeeping & Maintenance Coverage Map' }).first();
  const stats = page.getByText('Active Property Hotels', { exact: true }).locator('xpath=ancestor::div[contains(@class,"grid")][1]');
  const vpd = page.getByText('VPD full access', { exact: true }).locator('xpath=ancestor::div[1]');
  const nearest = page.getByText('Nearest Property Hotel', { exact: true }).locator('xpath=ancestor::div[contains(@class,"glass-card") or contains(@class,"fulfillment")][1]');
  await position(page, stats, 205);
  await addCallouts(page, [nav, stats, vpd, nearest]);
  await capture(page, 'scene-5', 'coverage-priorities.png');

  const layerPanel = page.getByText('Map Layers', { exact: true }).locator('xpath=ancestor::*[contains(@class,"fulfillment-layer-panel")][1]');
  for (const name of ['Property Hotels layer', 'Service SLA Coverage layer', 'Guest Service Demand layer']) {
    const control = page.getByRole('switch', { name });
    if (!(await control.isChecked())) await control.click();
  }
  await settle(page, 600);
  const properties = page.getByRole('switch', { name: 'Property Hotels layer' });
  const sla = page.getByRole('switch', { name: 'Service SLA Coverage layer' });
  const demand = page.getByRole('switch', { name: 'Guest Service Demand layer' });
  const map = page.locator('.leaflet-container');
  await position(page, layerPanel, 160);
  await addCallouts(page, [layerPanel, properties, sla, demand, map]);
  await capture(page, 'scene-5', 'spatial-layers.png');

  await openScene(page, 'fulfillment', 'Guest Service & SLA Coverage');
  const guest = page.getByRole('combobox', { name: 'Select guest' });
  const room = page.getByRole('combobox', { name: 'Select room type' });
  const ranked = page.getByText('Nearest Property Hotel', { exact: true }).locator('xpath=ancestor::div[contains(@class,"glass-card") or contains(@class,"fulfillment")][1]');
  await position(page, guest, 215);
  await addCallouts(page, [guest, room, ranked]);
  await capture(page, 'scene-5', 'nearest-property-capacity.png');
}

async function scene6(page) {
  await openScene(page, 'orders', 'Reservation & Folio Operations');
  const nav = page.getByRole('button', { name: 'Reservation & Folio Operations' }).first();
  const visible = page.getByText(/reservations visible/).first().locator('xpath=ancestor::div[1]');
  const status = page.getByRole('combobox', { name: 'All Reservation Statuses' });
  const table = page.locator('table').first();
  const row = page.getByText('#71974', { exact: true }).locator('xpath=ancestor::tr[1]');
  await position(page, status, 220);
  await addCallouts(page, [nav, visible, status, table, row]);
  await capture(page, 'scene-6', 'reservation-list.png');

  await row.click();
  await page.getByRole('button', { name: 'Reservation View' }).waitFor();
  const detailRow = page.getByText('#71974', { exact: true }).locator('xpath=ancestor::tr[1]');
  const reservationTab = page.getByRole('button', { name: 'Reservation View' });
  const summary = page.locator('.orders-detail-panel').locator('[class*="grid"]').first();
  const serviceTable = page.locator('.orders-detail-panel table').first();
  await position(page, reservationTab, 235);
  await addCallouts(page, [detailRow, reservationTab, summary, serviceTable]);
  await capture(page, 'scene-6', 'reservation-detail.png');

  await page.getByRole('button', { name: 'Folio Document View' }).click();
  await settle(page, 400);
  const folioTab = page.getByRole('button', { name: 'Folio Document View' });
  const documentHeading = page.getByText(/API-ready case document/i).first().locator('xpath=parent::*');
  const json = page.locator('.orders-detail-panel pre').first();
  const sql = page.locator('.orders-detail-panel pre').nth(1);
  await position(page, folioTab, 170);
  await addCallouts(page, [folioTab, documentHeading, json, sql]);
  await capture(page, 'scene-6', 'folio-document-view.png');
}

async function scene7(page) {
  await openScene(page, 'oml', 'Predictive Operational Risk, Capacity & Revenue Intelligence');
  const nav = page.getByRole('button', { name: 'OML Occupancy, Revenue & Labor Analytics' }).first();
  const kpis = page.locator('.oml-stat-grid');
  const tabs = page.getByRole('tablist', { name: 'OML analytics views' });
  const panel = page.locator('#oml-panel-demand');
  await position(page, kpis, 210);
  await addCallouts(page, [nav, kpis, tabs, panel]);
  await capture(page, 'scene-7', 'model-readiness.png');

  await page.getByRole('tab', { name: 'Service Capacity' }).click();
  await settle(page, 500);
  const capacityTab = page.getByRole('tab', { name: 'Service Capacity' });
  const capacityPanel = page.locator('#oml-panel-inventory');
  const refresh = capacityPanel.getByRole('button', { name: /Refresh/ }).first();
  const capacitySummary = capacityPanel.locator('[class*="grid"]').first();
  const capacityTable = capacityPanel.locator('table').first();
  await position(page, capacityTab, 180);
  await addCallouts(page, [capacityTab, refresh, capacitySummary, capacityTable]);
  await capture(page, 'scene-7', 'service-capacity-exposure.png');

  await page.getByRole('tab', { name: 'Revenue Forecast' }).click();
  await settle(page, 500);
  const forecastTab = page.getByRole('tab', { name: 'Revenue Forecast' });
  const forecastPanel = page.locator('#oml-panel-forecast');
  const horizon = forecastPanel.getByRole('combobox').first();
  const forecastRefresh = forecastPanel.getByRole('button', { name: /Refresh/ }).first();
  const forecastEvidence = forecastPanel.locator('.recharts-responsive-container').first();
  await position(page, forecastTab, 180);
  await addCallouts(page, [forecastTab, horizon, forecastRefresh, forecastEvidence]);
  await capture(page, 'scene-7', 'revenue-forecast.png');
}

async function scene8(page) {
  await openScene(page, 'askdata', 'Hospitality Data Assistant');
  const clear = page.getByRole('button', { name: 'Clear', exact: true });
  if (await clear.isVisible().catch(() => false)) await clear.click();
  const nav = page.getByRole('button', { name: 'Ask Hospitality Data' }).first();
  const profile = page.getByRole('combobox', { name: 'Runtime profile' });
  const modes = page.getByRole('tablist', { name: 'Ask Hospitality Data mode' });
  const input = page.getByRole('textbox', { name: 'Ask a hospitality data question' });
  await input.fill('Which properties have the highest reservation revenue?');
  const explain = page.getByRole('tab', { name: 'Explain' });
  await position(page, modes, 240);
  await addCallouts(page, [nav, profile, explain, input]);
  await capture(page, 'scene-8', 'ask-operating-question.png');

  const sqlText = 'SELECT c.guest_tier AS guest_tier, COUNT(DISTINCT c.guest_id) AS guests, COUNT(DISTINCT o.order_id) AS reservations, ROUND(SUM(o.order_total), 2) AS total_revenue, COUNT(DISTINCT CASE WHEN o.social_source_id IS NOT NULL THEN o.order_id END) AS signal_linked_reservations, ROUND(SUM(CASE WHEN o.social_source_id IS NOT NULL THEN o.order_total ELSE 0 END), 2) AS signal_linked_revenue FROM guests c LEFT JOIN orders o ON o.guest_id = c.guest_id GROUP BY c.guest_tier ORDER BY total_revenue DESC NULLS LAST, reservations DESC';
  const savedConversation = [
    { role: 'user', text: 'Which properties have the highest reservation revenue?', mode: 'chat', profile: 'SC_HOSPITALITY_CHAT', model: 'llama3.2', time: new Date().toISOString() },
    { role: 'assistant', mode: 'chat', text: 'Continuing the conversation, I found 10 matching rows. Summit Resort leads the current result, followed by Lakeside Chicago Hotel and Canyon Reserve Resort.', keyFindings: ['10 governed rows returned from Oracle AI Database 26ai.', 'Primary evidence fields: property name, property type, reservations, total revenue.', 'Current lead result: Summit Resort with 647 reservations.'], followUpQuestions: ['Show signal-linked reservation value by property.', 'Show guest tiers with the highest signal-linked revenue impact.'], rowCount: 10, sql: sqlText, elapsed: 4000, profile: 'SC_HOSPITALITY_CHAT', model: 'llama3.2', time: new Date().toISOString() },
    { role: 'user', text: 'What about by room type?', mode: 'chat', profile: 'SC_HOSPITALITY_CHAT', model: 'llama3.2', time: new Date().toISOString() },
    { role: 'assistant', mode: 'chat', text: 'The follow-up kept the prior reservation-revenue context and returned the next grouped result for review.', keyFindings: ['4 governed rows returned from Oracle AI Database 26ai.', 'Primary evidence fields: guest tier, guests, reservations, total revenue.', 'Current lead result: standard tier with 1,289 reservations.'], followUpQuestions: ['Show signal-linked reservation value by property.', 'Show guest tiers with the highest signal-linked revenue impact.'], rowCount: 4, sql: sqlText, elapsed: 12, profile: 'SC_HOSPITALITY_CHAT', model: 'llama3.2', time: new Date().toISOString() },
  ];
  await page.evaluate((messages) => {
    window.localStorage.setItem('hospitality.askdata.messages.v2:admin_ava', JSON.stringify(messages));
  }, savedConversation);
  await openScene(page, 'askdata', 'Hospitality Data Assistant');
  await page.getByText('What about by room type?', { exact: true }).waitFor();
  await settle(page, 500);
  const firstContext = page.getByText(/Context kept/i).first().locator('xpath=parent::*');
  const secondQuestion = page.getByText('What about by room type?', { exact: true });
  const context = page.getByText(/Context kept/i).last();
  const persistence = page.getByText(/Conversation context is saved for this user across scene changes and browser restarts/i).first();
  await position(page, secondQuestion, 390);
  await addCallouts(page, [firstContext, secondQuestion, context, persistence]);
  await capture(page, 'scene-8', 'conversation-follow-up.png');

  const viewSql = page.locator('details.askdata-sql-details').last().locator('summary');
  await viewSql.click();
  const sql = page.locator('pre').last();
  await sql.waitFor();
  const copy = page.getByRole('button', { name: /Copy/i }).last();
  await position(page, viewSql, 220);
  await addCallouts(page, [viewSql, sql, copy]);
  await capture(page, 'scene-8', 'inspect-generated-sql.png');
}

async function scene9(page) {
  await openScene(page, 'agents', 'AI Operations Agent Console');
  const clear = page.getByRole('button', { name: 'Clear', exact: true });
  if (await clear.isVisible().catch(() => false)) await clear.click();
  const pageTitle = page.getByRole('main').getByRole('heading', { name: 'AI Operations Agent Console', exact: true });
  const profile = page.getByRole('combobox', { name: 'Agent runtime profile' });
  const workspace = page.getByRole('heading', { name: 'Coordinate AI Operations Agents' }).locator('xpath=ancestor::div[contains(@class,"glass-card")][1]');
  await position(page, pageTitle, 115);
  await addCallouts(page, [pageTitle, profile, workspace]);
  await capture(page, 'scene-9', 'agent-workspace.png');

  const input = page.getByRole('textbox', { name: 'Ask an operations agent question' });
  await input.fill('Show reservation revenue by room type category');
  const send = page.getByRole('button', { name: 'Send', exact: true });
  await position(page, input, 390);
  await addCallouts(page, [input, send]);
  await capture(page, 'scene-9', 'agent-question.png');

  const agentRows = [
    { CATEGORY: 'Partner Hospitality', ORDERS: 69, REVENUE: 306658.51 },
    { CATEGORY: 'Payments', ORDERS: 307, REVENUE: 204156.61 },
    { CATEGORY: 'Analytics', ORDERS: 185, REVENUE: 180194.15 },
    { CATEGORY: 'Guest Services', ORDERS: 316, REVENUE: 159952.01 },
  ];
  const savedConversation = [
    { role: 'user', text: 'Show reservation revenue by room type category', time: new Date().toISOString() },
    { role: 'agent', text: 'Partner Hospitality leads the current grouped result. Review the supporting rows before assigning the next revenue-operations action.', team: 'COMMERCE_TEAM', intent: 'commerce', contextApplied: false, agentUsed: true, toolsUsed: [{ tool: 'HOSPITALITY_SQL_TOOL (reservation revenue)', status: 'success' }, { tool: 'HOSPITALITY_SQL_TOOL (room type category)', status: 'success' }], data: agentRows, elapsed: 4450, time: new Date().toISOString() },
    { role: 'user', text: 'Which category leads?', time: new Date().toISOString() },
    { role: 'agent', text: 'Partner Hospitality remains the lead category in the retained result set, with 69 reservations and 306,658.51 in revenue.', team: 'COMMERCE_TEAM', intent: 'commerce', contextApplied: true, agentUsed: true, toolsUsed: [{ tool: 'CONVERSATION_CONTEXT', status: 'success' }, { tool: 'HOSPITALITY_SQL_TOOL (reservation revenue)', status: 'success' }], data: agentRows, elapsed: 3095, time: new Date().toISOString() },
  ];
  await page.evaluate((messages) => {
    window.localStorage.setItem('hospitality.agentconsole.messages.v2:admin_ava', JSON.stringify(messages));
  }, savedConversation);
  await openScene(page, 'agents', 'AI Operations Agent Console');
  await page.getByText('Which category leads?', { exact: true }).waitFor();
  await settle(page, 500);
  const routed = page.getByText('Reservation Revenue Agent', { exact: true }).last();
  const resultTable = page.locator('table').last();
  const recent = page.getByText('Recent Agent Actions', { exact: true }).locator('xpath=ancestor::div[contains(@class,"glass-card")][1]');
  await position(page, routed, 260);
  await addCallouts(page, [routed, resultTable, recent]);
  await capture(page, 'scene-9', 'agent-audit.png');
}

async function scene10(page) {
  await openScene(page, 'ownerfinancial', 'Owner Financial Validation Workbench');
  const pageTitle = page.getByRole('main').getByRole('heading', { name: 'Owner Financial Validation Workbench', exact: true }).first();
  const filters = page.getByRole('region', { name: 'Financial validation filters' });
  const threshold = filters.getByRole('slider').first();
  const summary = page.getByRole('region', { name: 'Owner close summary' });
  const exception = page.getByText('Summit Resort', { exact: true }).first().locator('xpath=ancestor::button[1]');
  await position(page, pageTitle, 115);
  await addCallouts(page, [pageTitle, filters, threshold, summary]);
  await capture(page, 'scene-10', 'owner-close-population.png');

  await exception.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const header = dialog.getByRole('heading').first();
  const amounts = dialog.locator('.financial-definition-grid--amounts');
  const rule = dialog.locator('.financial-rule-callout').first();
  const evidenceLinks = dialog.locator('.financial-overlay-links');
  await position(page, header, 130);
  await addCallouts(page, [header, amounts, rule, evidenceLinks]);
  await capture(page, 'scene-10', 'validation-evidence.png');

  const note = dialog.getByPlaceholder('Add context for the audit record…');
  const actions = dialog.getByRole('button').filter({ hasText: /Owner validates exception|Request correction|Mark as timing difference|Escalate to finance|Add note/ }).first().locator('xpath=parent::*');
  const history = dialog.getByText(/Action history/i).first().locator('xpath=parent::*');
  await position(page, note, 360);
  await addCallouts(page, [note, actions, history]);
  await capture(page, 'scene-10', 'record-owner-decision.png');
}

async function validateMobile(browser) {
  for (const id of ['graph', 'fulfillment', 'orders', 'oml', 'askdata', 'agents', 'ownerfinancial']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
    await page.goto(`${BASE_URL}/?page=${id}`, { waitUntil: 'networkidle' });
    await settle(page, 300);
    const layout = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    await page.close();
    if (layout.document > layout.viewport) throw new Error(`${id} mobile overflow: ${layout.document}px in ${layout.viewport}px viewport.`);
    console.log(`${id}: mobile width ${layout.document}px fits ${layout.viewport}px viewport.`);
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: 'light' });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const startScene = Number(process.env.START_SCENE || 4);
    const endScene = Number(process.env.END_SCENE || 10);
    if (startScene <= 4 && endScene >= 4) await scene4(page);
    if (startScene <= 5 && endScene >= 5) await scene5(page);
    if (startScene <= 6 && endScene >= 6) await scene6(page);
    if (startScene <= 7 && endScene >= 7) await scene7(page);
    if (startScene <= 8 && endScene >= 8) await scene8(page);
    if (startScene <= 9 && endScene >= 9) await scene9(page);
    if (startScene <= 10 && endScene >= 10) await scene10(page);
    await validateMobile(browser);
    const unexpected = errors.filter((message) => !/Failed to load resource|ERR_CONNECTION_REFUSED/i.test(message));
    if (unexpected.length) throw new Error(`Browser errors:\n${unexpected.join('\n')}`);
    console.log(`Capture workflow completed with ${errors.length} ignored network console message(s).`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
