const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = process.env.HIGHTECH_BASE_URL || 'http://127.0.0.1:8505';
const OUTPUT_ROOT = process.env.CAPTURE_OUTPUT || '/output';
const VIEWPORT = { width: 1280, height: 1066 };
const RED = '#e2231a';

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function locatorFromSpec(page, spec) {
  let locator;
  if (spec.role) {
    locator = page.getByRole(spec.role, { name: spec.name, exact: spec.exact ?? false });
  } else if (spec.placeholder) {
    locator = page.getByPlaceholder(spec.placeholder, { exact: spec.exact ?? true });
  } else if (spec.css) {
    locator = page.locator(spec.css);
  } else {
    locator = page.getByText(spec.text, { exact: spec.exact ?? false });
  }
  locator = spec.last ? locator.last() : locator.first();
  if (spec.ancestorClass) {
    locator = locator.locator(`xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' ${spec.ancestorClass} ')][1]`);
  } else if (spec.ancestorTag) {
    locator = locator.locator(`xpath=ancestor::${spec.ancestorTag}[1]`);
  }
  return locator;
}

async function waitForStable(page) {
  await page.waitForTimeout(900);
  await page.evaluate(() => document.fonts?.ready);
}

async function removeCallouts(page) {
  await page.evaluate(() => document.querySelectorAll('[data-runbook-callout]').forEach((element) => element.remove()));
}

async function addCallouts(page, specs) {
  const boxes = [];
  for (const spec of specs) {
    let locator = locatorFromSpec(page, spec);
    if (!(await locator.count()) && (spec.ancestorClass || spec.ancestorTag)) {
      locator = locatorFromSpec(page, { ...spec, ancestorClass: undefined, ancestorTag: undefined });
    }
    if (!(await locator.count())) {
      console.warn(`Missing callout target: ${JSON.stringify(spec)}`);
      continue;
    }
    const box = await locator.boundingBox();
    if (!box) continue;
    const pad = spec.padding ?? 7;
    boxes.push({
      x: Math.max(2, box.x - pad),
      y: Math.max(2, box.y - pad),
      width: Math.min(VIEWPORT.width - Math.max(2, box.x - pad) - 2, box.width + pad * 2),
      height: Math.min(VIEWPORT.height - Math.max(2, box.y - pad) - 2, box.height + pad * 2),
    });
  }

  await page.evaluate(({ boxes: calloutBoxes, red }) => {
    calloutBoxes.forEach((box, index) => {
      const outline = document.createElement('div');
      outline.dataset.runbookCallout = 'true';
      Object.assign(outline.style, {
        position: 'fixed',
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        border: `4px solid ${red}`,
        borderRadius: '4px',
        boxSizing: 'border-box',
        zIndex: '2147483646',
        pointerEvents: 'none',
        boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
      });

      const badge = document.createElement('div');
      badge.textContent = String(index + 1);
      badge.dataset.runbookCallout = 'true';
      Object.assign(badge.style, {
        position: 'fixed',
        left: `${Math.max(4, box.x - 13)}px`,
        top: `${Math.max(4, box.y - 13)}px`,
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: red,
        color: '#fff',
        border: '2px solid #fff',
        font: '700 15px Oracle Sans, Arial, sans-serif',
        zIndex: '2147483647',
        pointerEvents: 'none',
        boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
      });
      document.body.append(outline, badge);
    });
  }, { boxes, red: RED });
}

async function scrollTo(page, spec) {
  if (!spec) {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelector('.app-content')?.scrollTo(0, 0);
    });
    await waitForStable(page);
    return;
  }
  const locator = locatorFromSpec(page, spec);
  if (!(await locator.count())) {
    console.warn(`Missing scroll target: ${JSON.stringify(spec)}`);
    return;
  }
  await locator.evaluate((element, block) => element.scrollIntoView({ block, inline: 'nearest' }), spec.block || 'start');
  await waitForStable(page);
}

async function capture(page, relativePath, options = {}) {
  await removeCallouts(page);
  await scrollTo(page, options.scroll);
  if (options.before) await options.before(page);
  await waitForStable(page);

  const rawPath = path.join(OUTPUT_ROOT, 'raw', relativePath);
  const selectedPath = path.join(OUTPUT_ROOT, 'selected', relativePath);
  ensureParent(rawPath);
  ensureParent(selectedPath);
  await page.screenshot({ path: rawPath, animations: 'disabled' });

  if (options.callouts?.length) await addCallouts(page, options.callouts);
  await page.screenshot({ path: selectedPath, animations: 'disabled' });
  await removeCallouts(page);
  console.log(`CAPTURED ${relativePath}`);
}

async function goto(page, route) {
  await page.goto(`${BASE_URL}/?page=${route}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#root', { state: 'visible' });
  await waitForStable(page);
}

async function clickIfPresent(locator, timeout = 5000) {
  try {
    await locator.first().click({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function captureWelcome(page) {
  await goto(page, 'welcome');
  await capture(page, 'introduction/images/welcome-and-demo-orientation.png');
  await capture(page, 'scene-1-seer-tech-control-tower/images/scene-1-seer-tech-control-tower.png');
  await capture(page, 'scene-1-seer-tech-control-tower/images/use-case-carousel.png', {
    scroll: { text: 'Key High Tech Use Cases Featured' },
    callouts: [{ text: 'Key High Tech Use Cases Featured', ancestorClass: 'glass-card', padding: 9 }],
  });
  await capture(page, 'scene-1-seer-tech-control-tower/images/start-the-demo-button.png', {
    callouts: [{ role: 'button', name: 'Start the demo', exact: true, padding: 10 }],
  });
}

async function captureFoundation(page) {
  await goto(page, 'datamodel');
  await capture(page, 'scene-2-seer-tech-26ai-data-foundation/images/scene-2-seer-tech-26ai-data-foundation.png');
  await capture(page, 'scene-2-seer-tech-26ai-data-foundation/images/prepare-dataset-counts.png', {
    scroll: { text: 'Prepare the Dataset' },
    callouts: [
      { role: 'button', name: 'Restore Demo Data', exact: true, padding: 10 },
      { text: 'High Tech Products', ancestorClass: 'glass-card', padding: 8 },
    ],
  });
  await capture(page, 'scene-2-seer-tech-26ai-data-foundation/images/what-gets-loaded-carousel.png', {
    scroll: { text: 'What Gets Loaded' },
    callouts: [{ text: 'What Gets Loaded', ancestorClass: 'glass-card', padding: 9 }],
  });
  await capture(page, 'scene-2-seer-tech-26ai-data-foundation/images/foundation-downstream-handoff.png', {
    scroll: { text: 'Build the governed High Tech operating baseline.' },
    callouts: [{ text: 'Build the governed High Tech operating baseline.', ancestorClass: 'glass-card', padding: 9 }],
  });
}

async function captureDashboard(page) {
  await goto(page, 'dashboard');
  await capture(page, 'scene-3-product-and-commitment-control-tower/images/scene-3-product-and-commitment-control-tower.png');
  await capture(page, 'scene-3-product-and-commitment-control-tower/images/control-tower-kpis-overview.png', {
    scroll: { text: 'How the launch constraint is detected', block: 'center' },
    callouts: [
      { css: 'main section.business-explanation', padding: 8 },
      { css: "xpath=//*[normalize-space()='3.0K']/ancestor::div[contains(@class,'grid')][1]", padding: 8 },
    ],
  });
  await page.getByRole('button', { name: '1y', exact: true }).click();
  await waitForStable(page);
  await capture(page, 'scene-3-product-and-commitment-control-tower/images/signal-velocity-and-product-value.png', {
    scroll: { text: 'Signal Velocity' },
    callouts: [
      { text: 'Signal Velocity', ancestorClass: 'glass-card', padding: 8 },
      { text: 'Product Value by Portfolio', ancestorClass: 'glass-card', padding: 8 },
    ],
  });
  await capture(page, 'scene-3-product-and-commitment-control-tower/images/watched-products-and-commitments.png', {
    scroll: { text: 'High-Demand Products', block: 'start' },
    callouts: [
      { text: 'High-Demand Products', ancestorClass: 'glass-card', padding: 8 },
      { text: 'Constraint Risk', exact: true, padding: 7 },
    ],
  });
}

async function captureSignals(page) {
  await goto(page, 'social');
  await capture(page, 'scene-4-enterprise-buyer-signal-monitor/images/scene-4-enterprise-buyer-signal-monitor.png');
  await capture(page, 'scene-4-enterprise-buyer-signal-monitor/images/signal-feed-overview.png', {
    scroll: { text: 'High-Tech Product Signal Match Search' },
    callouts: [
      { text: 'High-Tech Product Signal Match Search', ancestorClass: 'glass-card', padding: 8 },
      { text: 'Signal Summary', ancestorClass: 'glass-card', padding: 8 },
    ],
  });

  await page.getByRole('button', { name: 'GPU capacity surge for AI training', exact: true }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForTimeout(1800);
  await capture(page, 'scene-4-enterprise-buyer-signal-monitor/images/semantic-product-results.png', {
    scroll: { text: 'high-tech products matched', block: 'center' },
    callouts: [
      { text: 'Unit Price', padding: 7 },
      { text: 'Signal Match', padding: 7 },
    ],
  });
  await capture(page, 'scene-4-enterprise-buyer-signal-monitor/images/matched-signal-cards.png', {
    scroll: { text: 'MEGA VIRAL' },
    callouts: [
      { text: 'MEGA VIRAL', ancestorTag: 'article', padding: 8 },
      { text: 'Affected commitments', padding: 7 },
    ],
  });
}

async function captureGraph(page) {
  await goto(page, 'graph');
  await page.getByRole('button', { name: '5 Hops', exact: true }).click();
  await page.waitForTimeout(1200);
  await capture(page, 'scene-5-product-signal-graph/images/scene-5-product-signal-graph.png');
  await capture(page, 'scene-5-product-signal-graph/images/graph-workspace-controls.png', {
    scroll: { text: 'How risk scores and hops guide the decision', block: 'center' },
    callouts: [
      { css: 'main section.business-explanation', padding: 8 },
      { text: 'GRAPH DEPTH (HOPS)', padding: 7 },
    ],
  });
  await capture(page, 'scene-5-product-signal-graph/images/product-lifecycle-node-example.png', {
    scroll: { text: 'Risk Score / 100' },
    callouts: [
      { text: 'Risk Score / 100', ancestorClass: 'glass-card', padding: 8 },
      { text: 'HOP COVERAGE', ancestorClass: 'glass-card', padding: 8 },
    ],
  });
  await capture(page, 'scene-5-product-signal-graph/images/graph-query-explorer.png', {
    scroll: { text: 'Graph Query Explorer' },
    callouts: [{ text: 'Graph Query Explorer', ancestorClass: 'glass-card', padding: 8 }],
  });
  await page.getByRole('button', { name: 'BOM and ECO Commitment Path', exact: false }).click();
  await page.getByRole('button', { name: 'Run Query', exact: true }).click();
  await page.waitForTimeout(1200);
  await capture(page, 'scene-5-product-signal-graph/images/graph-query-results.png', {
    scroll: { text: 'EXECUTED SQL/PGQ' },
    callouts: [
      { text: 'BOM and ECO Commitment Path', ancestorClass: 'glass-card', padding: 8 },
      { text: 'rows returned', padding: 7 },
    ],
  });
}

async function captureSupply(page) {
  await goto(page, 'fulfillment');
  await capture(page, 'scene-6-supply-and-commitment-map/images/scene-6-supply-and-commitment-map.png');
  await capture(page, 'scene-6-supply-and-commitment-map/images/supply-commitment-map-layers.png', {
    scroll: { text: 'MAP LAYERS', block: 'center' },
    callouts: [
      { text: 'MAP LAYERS', padding: 16 },
      { text: 'SELECTED SUPPLY SITE', ancestorClass: 'glass-card', padding: 8 },
    ],
  });
  await capture(page, 'scene-6-supply-and-commitment-map/images/supply-commitment-sites-table.png', {
    scroll: { text: 'Supply & Commitment Sites', last: true, block: 'center' },
    callouts: [
      { css: "xpath=//h3[normalize-space(.)='Supply & Commitment Sites']/following::table[1]/thead/tr/th[5]", padding: 7 },
      { css: "xpath=//h3[normalize-space(.)='Supply & Commitment Sites']/following::table[1]/thead/tr/th[7]", padding: 7 },
    ],
  });
  await capture(page, 'scene-6-supply-and-commitment-map/images/capacity-priorities.png', {
    scroll: { text: 'Capacity Alerts - Immediate Shortages and Watchlist' },
    callouts: [
      { text: 'Capacity Alerts - Immediate Shortages and Watchlist', ancestorClass: 'glass-card', padding: 8 },
      { text: 'Forecast need exceeds stock on hand', padding: 7 },
    ],
  });
}

async function selectOrderStatus(page, optionLabel) {
  const control = page.getByPlaceholder('All Statuses', { exact: true }).first();
  await control.click();
  await page.waitForTimeout(300);
  if (optionLabel === 'Cancelled') {
    await page.getByText('Commitment Cancelled', { exact: true }).last().click();
  } else {
    await page.keyboard.type(optionLabel);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(900);
}

async function captureCommitments(page) {
  await goto(page, 'orders');
  await capture(page, 'scene-7-customer-commitments/images/scene-7-customer-commitments.png');
  await selectOrderStatus(page, 'Cancelled');
  await capture(page, 'scene-7-customer-commitments/images/customer-commitment-workspace.png', {
    scroll: { text: 'Cancellation Reason', exact: true, block: 'center' },
    before: async (p) => {
      const header = p.getByText('Cancellation Reason', { exact: true }).first();
      if (await header.count()) await header.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'end' }));
    },
    callouts: [
      { text: 'Completion Dates', exact: true, padding: 7 },
      { text: 'Cancellation Reason', exact: true, padding: 7 },
    ],
  });
  await capture(page, 'scene-7-customer-commitments/images/commitment-relational-detail.png', {
    scroll: { text: 'Cancellation Reason', exact: true },
    before: async (p) => {
      const commitment = p.getByText(/^#\d+$/).first();
      if (await commitment.count()) await commitment.click();
      await p.waitForTimeout(700);
      const target = p.getByText('Target Completion Date', { exact: true });
      if (await target.count()) await target.first().scrollIntoViewIfNeeded();
    },
    callouts: [
      { text: 'Target Completion Date', ancestorClass: 'glass-card', padding: 8 },
      { text: 'Cancellation Reason', exact: true, ancestorClass: 'glass-card', padding: 8 },
    ],
  });
  await clickIfPresent(page.getByText('JSON Duality View', { exact: true }));
  await page.waitForTimeout(600);
  await capture(page, 'scene-7-customer-commitments/images/commitment-json-duality.png', {
    scroll: { text: 'JSON Relational Duality', block: 'start' },
    callouts: [{ text: 'JSON Relational Duality', ancestorClass: 'glass-card', padding: 8 }],
  });
  await clickIfPresent(page.getByText('Fulfillment Route', { exact: true }));
  await page.waitForTimeout(600);
  await capture(page, 'scene-7-customer-commitments/images/commitment-route-context.png', {
    scroll: { text: 'Fulfillment Route', block: 'start' },
    callouts: [{ text: 'Fulfillment Route', ancestorClass: 'glass-card', padding: 8 }],
  });
}

async function captureAnalytics(page) {
  await goto(page, 'oml');
  await capture(page, 'scene-8-oml-product-intelligence/images/scene-8-oml-product-intelligence.png');
  await capture(page, 'scene-8-oml-product-intelligence/images/demand-volatility-forecasting.png', {
    scroll: { text: 'How these values are calculated' },
    callouts: [
      { text: 'How these values are calculated', ancestorClass: 'glass-card', padding: 8 },
      { text: 'TOP 10 - PREDICTED SOLUTION ORDERS', ancestorClass: 'glass-card', padding: 8 },
    ],
  });
  await page.getByRole('button', { name: 'Commitment Segments', exact: true }).click();
  await page.waitForTimeout(800);
  await capture(page, 'scene-8-oml-product-intelligence/images/customer-commitment-segments.png', {
    scroll: { text: 'Customer Commitment Segments', block: 'center' },
    callouts: [{ text: 'Customer Commitment Segments', ancestorClass: 'glass-card', padding: 8 }],
  });
  await page.getByRole('button', { name: 'Commitment Forecast', exact: true }).click();
  await page.waitForTimeout(800);
  await capture(page, 'scene-8-oml-product-intelligence/images/commitment-value-forecast.png', {
    scroll: { text: 'Commitment Value Forecast' },
    callouts: [{ text: 'Commitment Value Forecast', ancestorClass: 'glass-card', padding: 8 }],
  });
  await page.getByRole('button', { name: 'Signal Clusters', exact: true }).click();
  await page.waitForTimeout(800);
  await capture(page, 'scene-8-oml-product-intelligence/images/product-signal-clusters.png', {
    scroll: { text: 'Product Signal Clusters' },
    callouts: [{ text: 'Product Signal Clusters', ancestorClass: 'glass-card', padding: 8 }],
  });
  await page.getByRole('button', { name: 'BOM Capacity', exact: true }).click();
  await page.waitForTimeout(800);
  await capture(page, 'scene-8-oml-product-intelligence/images/bom-capacity-intelligence.png', {
    scroll: { text: 'BOM & Capacity Intelligence', block: 'center' },
    callouts: [{ text: 'BOM & Capacity Intelligence', ancestorClass: 'glass-card', padding: 8 }],
  });
}

async function runAskData(page, mode, question) {
  await goto(page, 'askdata');
  await page.getByRole('button', { name: mode, exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Ask a data question', exact: true });
  await input.fill(question);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return !/Generating|Thinking|Sending/i.test(text) && text.includes('Clear');
  }, null, { timeout: 210000 }).catch(() => {});
  await page.waitForTimeout(700);
}

async function captureAskData(page) {
  await goto(page, 'askdata');
  await capture(page, 'scene-9-ask-seer-tech-data/images/scene-9-ask-seer-tech-data.png', {
    callouts: [
      { text: 'Explain', exact: true, padding: 7 },
      { text: 'Run SQL', exact: true, padding: 7 },
    ],
  });
  await runAskData(page, 'Explain', 'Which products are constrained by component shortages and supplier risk?');
  await capture(page, 'scene-9-ask-seer-tech-data/images/ask-seer-tech-data-explain-mode.png', {
    scroll: { text: 'Found 5 rows', block: 'center' },
    callouts: [{ text: 'Found 5 rows', padding: 10 }],
  });
  await runAskData(page, 'Chat', 'Which customer commitments are at risk from shortage signals?');
  await capture(page, 'scene-9-ask-seer-tech-data/images/ask-seer-tech-data-chat-mode.png', {
    scroll: { text: 'I found 5 rows', block: 'center' },
    callouts: [{ text: 'I found 5 rows', padding: 10 }],
  });
  await runAskData(page, 'Show SQL', 'Which products have the highest demand volatility this week?');
  await capture(page, 'scene-9-ask-seer-tech-data/images/ask-seer-tech-data-generated-sql.png', {
    scroll: { text: 'GENERATED SQL' },
    callouts: [{ text: 'GENERATED SQL', ancestorClass: 'glass-card', padding: 8 }],
  });
  await runAskData(page, 'Run SQL', 'Which products have the highest demand volatility this week?');
  await capture(page, 'scene-9-ask-seer-tech-data/images/ask-seer-tech-data-run-sql-results.png', {
    scroll: { text: 'rows returned', block: 'center' },
    callouts: [{ text: 'rows returned', padding: 10 }],
  });
}

async function captureAgents(page) {
  await goto(page, 'agents');
  await capture(page, 'scene-10-ai-agent-console/images/scene-10-ai-agent-console.png');
  const input = page.getByPlaceholder('Ask the agent runtime a question…', { exact: true }).last();
  await input.fill('Which high-tech products have low capacity?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return !/Agent thinking|Sending/i.test(text) && text.includes('Clear');
  }, null, { timeout: 240000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await capture(page, 'scene-10-ai-agent-console/images/agent-capacity-response.png', {
    scroll: { text: 'Which high-tech products have low capacity?' },
    callouts: [{ text: 'Which high-tech products have low capacity?', ancestorClass: 'glass-card', padding: 8 }],
  });
  await capture(page, 'scene-10-ai-agent-console/images/agent-action-audit-trail.png', {
    scroll: { text: 'Recent Agent Actions' },
    callouts: [{ text: 'Recent Agent Actions', ancestorClass: 'glass-card', padding: 8 }],
  });
}

async function openDatasetTool(page) {
  await goto(page, 'welcome');
  await page.getByRole('button', { name: 'Use Your Own Product Data', exact: true }).click();
  await page.waitForTimeout(600);
}

async function captureDatasetTool(page) {
  await openDatasetTool(page);
  await capture(page, 'scene-11-use-your-own-product-data/images/scene-11-use-your-own-product-data.png');
  await capture(page, 'scene-11-use-your-own-product-data/images/open-dataset-tool.png', {
    callouts: [{ text: 'Active dataset: Demo Data', padding: 8 }],
  });
  await capture(page, 'scene-11-use-your-own-product-data/images/template-and-upload-workflow.png', {
    scroll: { text: 'Download Template ZIP' },
    callouts: [
      { text: 'Download Template ZIP', padding: 8 },
      { text: 'Select Completed ZIP', padding: 8 },
    ],
  });
  await capture(page, 'scene-11-use-your-own-product-data/images/preview-restore-seeded-dataset.png', {
    scroll: { text: 'Restore Demo Data' },
    callouts: [
      { text: 'Preview Restore', padding: 8 },
      { text: 'Restore Demo Data', padding: 8 },
    ],
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));

  const groups = [
    ['welcome', captureWelcome],
    ['foundation', captureFoundation],
    ['dashboard', captureDashboard],
    ['signals', captureSignals],
    ['graph', captureGraph],
    ['supply', captureSupply],
    ['commitments', captureCommitments],
    ['analytics', captureAnalytics],
    ['ask-data', captureAskData],
    ['agents', captureAgents],
    ['dataset-tool', captureDatasetTool],
  ];
  const only = (process.env.CAPTURE_ONLY || '').split(',').map((value) => value.trim()).filter(Boolean);
  const startAt = process.env.CAPTURE_FROM || 'welcome';
  const startIndex = Math.max(0, groups.findIndex(([id]) => id === startAt));
  const selectedGroups = only.length ? groups.filter(([id]) => only.includes(id)) : groups.slice(startIndex);
  for (const [, captureGroup] of selectedGroups) {
    await captureGroup(page);
  }

  fs.writeFileSync(path.join(OUTPUT_ROOT, 'capture-errors.json'), `${JSON.stringify(errors, null, 2)}\n`);
  await browser.close();
  console.log(`COMPLETE ${OUTPUT_ROOT}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
