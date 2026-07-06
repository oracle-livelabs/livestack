#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CAPTURE_DATE, CAPTURES, VIEWPORT } = require('./capture-plan');

const BASE_URL = String(process.env.SLED_BASE_URL || '').replace(/\/+$/, '');
if (!BASE_URL) {
  throw new Error('SLED_BASE_URL is required. Point it at the validated live SLED application.');
}

const OUTPUT_ROOT = path.resolve(
  process.env.CAPTURE_OUTPUT
    || path.join(__dirname, '..', '..', 'guide-screenshots', `capture-${CAPTURE_DATE}`),
);
const AUDIT_OUTPUT = path.resolve(
  process.env.SLED_AUDIT_OUTPUT
    || path.join(path.dirname(OUTPUT_ROOT), 'live-audit.json'),
);
const RED = '#e2231a';
const EXPECTED_ADMIN_CENTERS = Number(process.env.SLED_EXPECTED_ADMIN_CENTERS || 31);

const IDENTITIES = Object.freeze({
  admin: Object.freeze({
    username: 'admin_jess',
    fullName: 'Jessica Chen',
    scopeLabel: 'Global VPD Admin',
  }),
  regional: Object.freeze({
    username: 'fm_west_maria',
    fullName: 'Maria Santos',
    scopeLabel: 'Regional VPD Manager',
    regionCode: 'WESTERN_SLOPE',
    regionLabel: 'Western Slope',
  }),
  restricted: Object.freeze({
    username: 'viewer_sam',
    fullName: 'Sam Taylor',
    scopeLabel: 'Restricted Viewer (VPD)',
  }),
});

const COVERAGE_REFETCH_PATHS = Object.freeze([
  '/api/fulfillment/centers',
  '/api/fulfillment/inventory-alerts',
  '/api/fulfillment/shipments',
  '/api/fulfillment/customers',
  '/api/fulfillment/zones',
  '/api/fulfillment/demand-regions',
]);

const capturePlan = new Map(CAPTURES.map((entry) => [entry.file, entry]));
const capturedFiles = new Set();
let activeIdentity = IDENTITIES.admin;
let activeGroup = null;

const audit = {
  generatedAt: new Date().toISOString(),
  captureDate: CAPTURE_DATE,
  baseUrl: BASE_URL,
  viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
  expectedCaptures: CAPTURES.length,
  selectedRequest: null,
  roleMatrix: {},
  scenes: [],
  captures: [],
  apiResponses: [],
  expectedAuthorizationDenials: [],
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
  unexpectedConsoleErrors: [],
  unexpectedApiErrors: [],
  status: 'running',
};

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function apiPath(url) {
  try {
    return new URL(url).pathname;
  } catch (_) {
    return url;
  }
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

  if (spec.ancestorClass) {
    locator = locator.locator(`xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' ${spec.ancestorClass} ')][1]`);
  } else if (spec.ancestorTag) {
    locator = locator.locator(`xpath=ancestor::${spec.ancestorTag}[1]`);
  }

  if (Number.isInteger(spec.index)) locator = locator.nth(spec.index);
  else locator = spec.last ? locator.last() : locator.first();
  return locator;
}

async function waitForStable(page, delay = 850) {
  await page.waitForTimeout(delay);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function removeCallouts(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-runbook-callout]').forEach((element) => element.remove());
  });
}

async function addCallouts(page, specs) {
  const boxes = [];
  for (const spec of specs) {
    let locator = locatorFromSpec(page, spec);
    if (!(await locator.count()) && (spec.ancestorClass || spec.ancestorTag)) {
      locator = locatorFromSpec(page, {
        ...spec,
        ancestorClass: undefined,
        ancestorTag: undefined,
      });
    }
    if (!(await locator.count())) {
      throw new Error(`Missing required callout target: ${JSON.stringify(spec)}`);
    }
    await locator.waitFor({ state: 'visible' });
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Required callout target has no bounding box: ${JSON.stringify(spec)}`);

    const pad = spec.padding ?? 7;
    const x = Math.max(2, box.x - pad);
    const y = Math.max(2, box.y - pad);
    boxes.push({
      x,
      y,
      width: Math.min(VIEWPORT.width - x - 2, box.width + pad * 2),
      height: Math.min(VIEWPORT.height - y - 2, box.height + pad * 2),
    });
  }

  await page.evaluate(({ calloutBoxes, red }) => {
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
        boxShadow: '0 0 0 2px rgba(255,255,255,0.92)',
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
  }, { calloutBoxes: boxes, red: RED });
}

async function resetScroll(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector('.app-content')?.scrollTo(0, 0);
  });
  await waitForStable(page, 250);
}

async function scrollTo(page, spec) {
  if (!spec) {
    await resetScroll(page);
    return;
  }
  const locator = locatorFromSpec(page, spec);
  if (!(await locator.count())) {
    throw new Error(`Missing required scroll target: ${JSON.stringify(spec)}`);
  }
  await locator.evaluate(
    (element, block) => element.scrollIntoView({ block, inline: 'nearest' }),
    spec.block || 'start',
  );
  await waitForStable(page);
}

async function assertMainSurfaceSafe(page) {
  const main = page.locator('main').first();
  await main.waitFor({ state: 'visible' });
  const text = await main.innerText();
  assert(!/\b(?:Shipped|Delivered|Out for Delivery)\b/i.test(text), 'Visible scene contains a retired logistics status.');
  assert(!/Invalid Date|\bNaN\b|\bundefined\b/.test(text), 'Visible scene contains an invalid placeholder value.');
}

async function capture(page, relativePath, options = {}) {
  const planEntry = capturePlan.get(relativePath);
  if (!planEntry) throw new Error(`Capture is not declared in the 52-image plan: ${relativePath}`);
  if (capturedFiles.has(relativePath)) throw new Error(`Capture path was used more than once: ${relativePath}`);

  await removeCallouts(page);
  await scrollTo(page, options.scroll);
  if (options.before) await options.before(page);
  await waitForStable(page);
  await assertMainSurfaceSafe(page);

  const rawPath = path.join(OUTPUT_ROOT, 'raw', relativePath);
  const selectedPath = path.join(OUTPUT_ROOT, 'selected', relativePath);
  ensureParent(rawPath);
  ensureParent(selectedPath);
  await page.screenshot({ path: rawPath, animations: 'disabled' });

  try {
    if (options.callouts?.length) await addCallouts(page, options.callouts);
    await page.screenshot({ path: selectedPath, animations: 'disabled' });
  } finally {
    await removeCallouts(page);
  }

  capturedFiles.add(relativePath);
  audit.captures.push({
    file: relativePath,
    group: planEntry.group,
    route: planEntry.route,
    identity: activeIdentity.username,
    url: page.url(),
    raw: path.relative(path.dirname(OUTPUT_ROOT), rawPath).split(path.sep).join('/'),
    selected: path.relative(path.dirname(OUTPUT_ROOT), selectedPath).split(path.sep).join('/'),
  });
  process.stdout.write(`CAPTURED ${relativePath}\n`);
}

async function goto(page, route, expectedText) {
  await page.goto(`${BASE_URL}/?page=${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#root').waitFor({ state: 'visible' });
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
  });
  if (expectedText) await page.getByText(expectedText, { exact: false }).first().waitFor({ state: 'visible' });
  await waitForStable(page);
  await resetScroll(page);
}

async function sceneAudit(page, id, route) {
  const main = page.locator('main').first();
  const headings = await main.locator('h1,h2,h3').allInnerTexts();
  audit.scenes.push({
    id,
    route,
    identityAtEnd: activeIdentity.username,
    title: await page.title(),
    headings: headings.map((heading) => heading.trim()).filter(Boolean),
    captures: audit.captures.filter((entry) => entry.group === id).map((entry) => entry.file),
  });
}

function currentSwitcherButton(page, identity) {
  return page.locator('.app-sidebar-footer button').filter({ hasText: identity.fullName }).first();
}

async function waitForIdentityRefetches(page, startIndex, username, expectedPaths) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const entries = audit.apiResponses.slice(startIndex)
      .filter((entry) => entry.username === username && entry.status === 200);
    const paths = new Set(entries.map((entry) => entry.path));
    if (expectedPaths.every((pathname) => paths.has(pathname))) return;
    await page.waitForTimeout(100);
  }
  const observed = audit.apiResponses.slice(startIndex)
    .filter((entry) => entry.username === username)
    .map((entry) => `${entry.status} ${entry.path}`);
  throw new Error(`${username} did not refetch ${expectedPaths.join(', ')}; observed ${observed.join(', ')}`);
}

async function switchIdentity(page, nextIdentity, primaryPath, expectedPaths = [primaryPath]) {
  const previousIdentity = activeIdentity;
  const startIndex = audit.apiResponses.length;
  await currentSwitcherButton(page, previousIdentity).click();
  await page.getByText('VPD Demo - Switch User', { exact: true }).waitFor({ state: 'visible' });
  const option = page.locator('.app-sidebar-footer button').filter({ hasText: nextIdentity.fullName }).last();
  await option.waitFor({ state: 'visible' });

  const responsePromise = page.waitForResponse((response) => (
    apiPath(response.url()) === primaryPath
      && response.request().headers()['x-demo-user'] === nextIdentity.username
  ), { timeout: 30000 });
  await option.click();
  const response = await responsePromise;
  assert.strictEqual(response.status(), 200, `${nextIdentity.username} ${primaryPath} returned HTTP ${response.status()}`);
  const payload = await response.json();
  activeIdentity = nextIdentity;
  await waitForIdentityRefetches(page, startIndex, nextIdentity.username, expectedPaths);
  await currentSwitcherButton(page, nextIdentity).waitFor({ state: 'visible' });
  return payload;
}

async function ensureMapLayer(page, label) {
  const row = page.locator('label.fulfillment-layer-toggle').filter({ hasText: label }).first();
  await row.waitFor({ state: 'visible' });
  const control = row.locator('oj-switch').first();
  const active = await control.evaluate((element) => element.value === true || element.getAttribute('value') === 'true');
  if (!active) {
    await control.click();
    await page.waitForFunction(
      (layerLabel) => {
        const rows = [...document.querySelectorAll('label.fulfillment-layer-toggle')];
        const match = rows.find((candidate) => candidate.textContent.includes(layerLabel));
        const element = match?.querySelector('oj-switch');
        return Boolean(element && (element.value === true || element.getAttribute('value') === 'true'));
      },
      label,
    );
  }
}

async function siteTableState(page) {
  const card = page.locator('.glass-card').filter({ hasText: 'Colorado Service Sites' }).first();
  await card.waitFor({ state: 'visible' });
  const rows = card.locator('tbody tr');
  return {
    count: await rows.count(),
    locations: (await rows.locator('td:nth-child(2)').allInnerTexts()).map((value) => value.trim()),
  };
}

async function activeCenterCount(page) {
  const card = page.locator('.fulfillment-stat-card').filter({ hasText: 'Active Centers' }).first();
  await card.waitFor({ state: 'visible' });
  const value = Number((await card.locator('p').first().innerText()).replace(/[^0-9.-]/g, ''));
  assert(Number.isFinite(value), 'Unable to parse the Active Centers value.');
  return value;
}

async function assertCoverageIdentity(page, identity, centers) {
  const scene = page.locator('.fade-in').first();
  await scene.getByText(identity.fullName, { exact: true }).waitFor({ state: 'visible' });
  await scene.getByText(identity.scopeLabel, { exact: true }).waitFor({ state: 'visible' });

  if (identity.username === IDENTITIES.admin.username) {
    await scene.getByText('centers visible across Colorado', { exact: false }).waitFor();
  } else if (identity.username === IDENTITIES.regional.username) {
    await scene.getByText('Filtered to Western Slope', { exact: false }).waitFor();
    assert(centers.every((center) => center.SERVICE_REGION_CODE === identity.regionCode), 'Regional API returned an out-of-scope center.');
  } else {
    await scene.getByText('No protected operational rows visible', { exact: true }).waitFor();
    assert.deepStrictEqual(centers, [], 'Restricted viewer received protected center rows.');
  }

  assert.strictEqual(await activeCenterCount(page), centers.length, `${identity.username} center card does not match its API payload.`);
  const table = await siteTableState(page);
  assert.strictEqual(table.count, centers.length, `${identity.username} center table does not match its API payload.`);
  assert(table.locations.every((location) => /Colorado/i.test(location)), `${identity.username} rendered an out-of-state center location.`);
}

async function captureWelcome(page) {
  activeGroup = 'welcome';
  await goto(page, 'welcome', 'Colorado Resident Services Overview');
  await page.getByText('Colorado residents only', { exact: true }).waitFor();
  await capture(page, 'introduction/images/sled-operations-brief.png');
  await capture(page, 'scene-1-sled-operations-brief/images/scene-1-sled-operations-brief.png');
  await capture(page, 'scene-1-sled-operations-brief/images/operations-brief-workflow.png', {
    scroll: { text: 'Key State and Local Government Use Cases Featured', ancestorClass: 'glass-card' },
    callouts: [{ text: 'Key State and Local Government Use Cases Featured', ancestorClass: 'glass-card', padding: 9 }],
  });
  await capture(page, 'scene-1-sled-operations-brief/images/start-demo-action.png', {
    callouts: [{ role: 'button', name: 'Start the demo', exact: true, padding: 10 }],
  });
  await sceneAudit(page, activeGroup, 'welcome');
}

async function captureFoundation(page) {
  activeGroup = 'foundation';
  await goto(page, 'datamodel', 'Data Foundation');
  await page.getByText('Scene 2 - establish the governed Colorado record', { exact: false }).waitFor();
  await capture(page, 'scene-2-seer-26ai-data-foundation/images/scene-2-seer-26ai-data-foundation.png');
  await capture(page, 'scene-2-seer-26ai-data-foundation/images/prepare-dataset-counts.png', {
    scroll: { text: 'Prepare the Dataset', ancestorClass: 'glass-card' },
    callouts: [
      { text: 'Prepare the Dataset', ancestorClass: 'glass-card', padding: 9 },
      { role: 'button', name: /(?:Restore|Load) Demo Data/, padding: 10 },
    ],
  });
  await capture(page, 'scene-2-seer-26ai-data-foundation/images/what-gets-loaded-carousel.png', {
    scroll: { text: 'What Gets Loaded', ancestorClass: 'glass-card' },
    callouts: [{ text: 'What Gets Loaded', ancestorClass: 'glass-card', padding: 9 }],
  });
  await capture(page, 'scene-2-seer-26ai-data-foundation/images/foundation-downstream-handoff.png', {
    scroll: { text: 'Confirm one trusted statewide operating baseline.', ancestorClass: 'industry-story-panel' },
    callouts: [{ text: 'Confirm one trusted statewide operating baseline.', ancestorClass: 'industry-story-panel', padding: 9 }],
  });
  await sceneAudit(page, activeGroup, 'datamodel');
}

async function captureDashboard(page) {
  activeGroup = 'dashboard';
  await goto(page, 'dashboard', 'Public Service Command Center');
  const riskCard = page.locator('section[aria-labelledby="medicaid-eligibility-risk-title"]');
  await riskCard.getByText('2.7%', { exact: true }).waitFor();
  await riskCard.getByText('3.0%', { exact: true }).waitFor();
  await riskCard.getByText('Approaching Threshold', { exact: true }).waitFor();
  await capture(page, 'scene-3-public-service-command-center/images/scene-3-public-service-command-center.png');
  await capture(page, 'scene-3-public-service-command-center/images/command-center-kpis-overview.png', {
    scroll: { css: 'section[aria-labelledby="medicaid-eligibility-risk-title"]', block: 'center' },
    callouts: [
      { css: 'section[aria-labelledby="medicaid-eligibility-risk-title"]', padding: 9 },
      { text: '2.7%', exact: true, padding: 8 },
      { text: '3.0%', exact: true, padding: 8 },
    ],
  });
  await capture(page, 'scene-3-public-service-command-center/images/signal-velocity-and-service-value.png', {
    scroll: { text: 'Agency Workload Velocity', block: 'center' },
    callouts: [
      { text: 'Agency Workload Velocity', ancestorClass: 'glass-card', padding: 8 },
      { text: 'Service Value by Category', ancestorClass: 'glass-card', padding: 8 },
    ],
  });
  await capture(page, 'scene-3-public-service-command-center/images/services-under-pressure.png', {
    scroll: { text: 'Services Under Pressure', last: true, block: 'center' },
    callouts: [{ text: 'Services Under Pressure', last: true, ancestorClass: 'glass-card', padding: 8 }],
  });
  await sceneAudit(page, activeGroup, 'dashboard');
}

async function captureSignals(page) {
  activeGroup = 'signals';
  await goto(page, 'social', 'Resident Demand Signals');
  await capture(page, 'scene-4-resident-demand-signals/images/scene-4-resident-demand-signals.png');
  const query = 'benefits eligibility appointment backlog';
  const input = page.getByRole('textbox', { name: 'Describe the service signal to match...', exact: true });
  await input.fill(query);
  const searchResponse = page.waitForResponse((response) => (
    apiPath(response.url()) === '/api/resident-signals/semantic-search'
      && response.request().headers()['x-demo-user'] === activeIdentity.username
  ), { timeout: 60000 });
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  assert.strictEqual((await searchResponse).status(), 200, 'Resident vector search failed.');
  await page.getByText('public services matched for', { exact: false }).waitFor();
  await capture(page, 'scene-4-resident-demand-signals/images/public-service-vector-search.png', {
    scroll: { text: 'Public Service Vector Search', ancestorClass: 'glass-card' },
    callouts: [
      { text: 'Public Service Vector Search', ancestorClass: 'glass-card', padding: 8 },
      { css: 'input[aria-label="Describe the service signal to match..."]', padding: 7 },
    ],
  });
  await capture(page, 'scene-4-resident-demand-signals/images/resident-signal-summary.png', {
    scroll: { css: 'section[aria-labelledby="resident-signal-summary-title"]' },
    callouts: [{ css: 'section[aria-labelledby="resident-signal-summary-title"]', padding: 8 }],
  });
  await capture(page, 'scene-4-resident-demand-signals/images/resident-signal-momentum.png', {
    scroll: { css: '.signal-card-actions', block: 'center' },
    callouts: [{ css: '.signal-card-actions', ancestorClass: 'glass-card', padding: 8 }],
  });
  await sceneAudit(page, activeGroup, 'social');
}

async function ensurePartnerProgramRelationships(page) {
  const relationshipHeading = page.getByText('Public Program Relationships', { exact: false }).first();
  if (await relationshipHeading.isVisible().catch(() => false)) return;

  const partnerHeading = page.getByText(/^Community Partners(?:\s*\(\d+\))?$/).first();
  await partnerHeading.waitFor({ state: 'visible' });
  const partnerCard = partnerHeading.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " glass-card ")][1]');
  const partnerButtons = partnerCard.locator('button');
  const attempts = Math.min(await partnerButtons.count(), 12);
  for (let index = 0; index < attempts; index += 1) {
    await partnerButtons.nth(index).click();
    await waitForStable(page, 650);
    if (await relationshipHeading.isVisible().catch(() => false)) return;
  }
  throw new Error('No visible community partner exposed Public Program Relationships after 12 deterministic selections.');
}

async function captureGraph(page) {
  activeGroup = 'graph';
  await goto(page, 'graph', 'Community Partner Network Graph');
  await page.getByRole('button', { name: '2 Hops', exact: true }).click();
  await waitForStable(page, 1000);
  await capture(page, 'scene-5-community-partner-network/images/scene-5-community-partner-network.png');
  await capture(page, 'scene-5-community-partner-network/images/partner-graph-workspace.png', {
    scroll: { text: 'Graph Depth (Hops)', ancestorClass: 'glass-card' },
    callouts: [
      { text: 'Graph Depth (Hops)', ancestorClass: 'glass-card', padding: 8 },
      { text: '2 Hops', exact: true, padding: 7 },
    ],
  });
  await ensurePartnerProgramRelationships(page);
  await capture(page, 'scene-5-community-partner-network/images/partner-program-relationships.png', {
    scroll: { text: 'Public Program Relationships', block: 'center' },
    callouts: [{ text: 'Public Program Relationships', ancestorClass: 'glass-card', padding: 8 }],
  });
  await page.getByRole('button', { name: 'Community Service Hub Detection', exact: false }).click();
  const serviceDomainLabel = page.getByText('Service Domain (optional)', { exact: true });
  await serviceDomainLabel.waitFor({ state: 'visible' });
  const serviceDomainInput = serviceDomainLabel.locator('xpath=following-sibling::input[1]');
  await serviceDomainInput.fill('Benefits Eligibility');
  const graphResponse = page.waitForResponse((response) => (
    apiPath(response.url()) === '/api/graph/run-example'
      && response.request().headers()['x-demo-user'] === activeIdentity.username
  ), { timeout: 60000 });
  await page.getByRole('button', { name: 'Run Query', exact: true }).click();
  const graphResultResponse = await graphResponse;
  assert.strictEqual(graphResultResponse.status(), 200, 'Graph example query failed.');
  const graphResult = await graphResultResponse.json();
  assert(Number(graphResult?.rowCount) > 0, 'Benefits Eligibility graph query returned no coordination rows.');
  await page.getByText('rows returned', { exact: false }).waitFor();
  await page.getByText('Executed SQL/PGQ', { exact: true }).waitFor();
  await capture(page, 'scene-5-community-partner-network/images/graph-query-explorer.png', {
    scroll: { text: 'Executed SQL/PGQ', block: 'center' },
    callouts: [
      { text: 'Community Service Hub Detection', ancestorClass: 'glass-card', padding: 8 },
      { text: 'Executed SQL/PGQ', padding: 8 },
    ],
  });
  await sceneAudit(page, activeGroup, 'graph');
}

async function captureCoverage(page) {
  activeGroup = 'coverage';
  await goto(page, 'fulfillment', 'Colorado Service Access & Coverage Map');
  await currentSwitcherButton(page, IDENTITIES.admin).waitFor({ state: 'visible' });
  const adminCenters = await page.evaluate(async (username) => {
    const response = await fetch('/api/fulfillment/centers?_capture=1', { headers: { 'X-Demo-User': username } });
    if (!response.ok) throw new Error(`centers returned HTTP ${response.status}`);
    return response.json();
  }, IDENTITIES.admin.username);
  assert.strictEqual(adminCenters.length, EXPECTED_ADMIN_CENTERS, 'Unexpected global center count.');
  await assertCoverageIdentity(page, IDENTITIES.admin, adminCenters);
  await ensureMapLayer(page, 'Service Sites');
  await ensureMapLayer(page, 'Public Service Demand Regions');
  audit.roleMatrix.admin_jess = adminCenters.length;

  await capture(page, 'scene-6-service-access-and-coverage-map/images/scene-6-service-access-and-coverage-map.png');
  await capture(page, 'scene-6-service-access-and-coverage-map/images/global-vpd-statewide.png', {
    scroll: { text: 'Global VPD Admin', ancestorClass: 'rounded-xl', block: 'center' },
    callouts: [{ text: 'Global VPD Admin', ancestorClass: 'rounded-xl', padding: 9 }],
  });
  await capture(page, 'scene-6-service-access-and-coverage-map/images/service-access-map-layers.png', {
    scroll: { text: 'Map Layers', block: 'center' },
    callouts: [{ css: '.fulfillment-layer-panel', padding: 9 }],
  });
  await capture(page, 'scene-6-service-access-and-coverage-map/images/service-sites-table.png', {
    scroll: { text: 'Colorado Service Sites', ancestorClass: 'glass-card', block: 'center' },
    callouts: [{ text: 'Colorado Service Sites', ancestorClass: 'glass-card', padding: 8 }],
  });
  await capture(page, 'scene-6-service-access-and-coverage-map/images/capacity-and-access-signals.png', {
    scroll: { text: 'Active Centers', block: 'center' },
    callouts: [
      { text: 'Active Centers', ancestorClass: 'fulfillment-stat-card', padding: 7 },
      { text: 'Capacity Alerts', ancestorClass: 'fulfillment-stat-card', padding: 7 },
    ],
  });

  const regionalCenters = await switchIdentity(
    page,
    IDENTITIES.regional,
    '/api/fulfillment/centers',
    COVERAGE_REFETCH_PATHS,
  );
  assert(regionalCenters.length > 0 && regionalCenters.length < adminCenters.length, 'Regional center scope is not narrower than global.');
  await assertCoverageIdentity(page, IDENTITIES.regional, regionalCenters);
  await ensureMapLayer(page, 'Service Sites');
  await ensureMapLayer(page, 'Public Service Demand Regions');
  audit.roleMatrix.fm_west_maria = regionalCenters.length;
  await capture(page, 'scene-6-service-access-and-coverage-map/images/regional-vpd-western-slope.png', {
    scroll: { text: 'Regional VPD Manager', ancestorClass: 'rounded-xl', block: 'center' },
    callouts: [{ text: 'Regional VPD Manager', ancestorClass: 'rounded-xl', padding: 9 }],
  });

  const restrictedCenters = await switchIdentity(
    page,
    IDENTITIES.restricted,
    '/api/fulfillment/centers',
    COVERAGE_REFETCH_PATHS,
  );
  await assertCoverageIdentity(page, IDENTITIES.restricted, restrictedCenters);
  audit.roleMatrix.viewer_sam = restrictedCenters.length;
  await capture(page, 'scene-6-service-access-and-coverage-map/images/restricted-vpd-no-operational-rows.png', {
    scroll: { text: 'Restricted Viewer (VPD)', ancestorClass: 'rounded-xl', block: 'center' },
    callouts: [{ text: 'Restricted Viewer (VPD)', ancestorClass: 'rounded-xl', padding: 9 }],
  });

  const restoredRegionalCenters = await switchIdentity(
    page,
    IDENTITIES.regional,
    '/api/fulfillment/centers',
    COVERAGE_REFETCH_PATHS,
  );
  assert.strictEqual(restoredRegionalCenters.length, regionalCenters.length, 'Regional scope did not restore before Scene 7.');
  await assertCoverageIdentity(page, IDENTITIES.regional, restoredRegionalCenters);
  await sceneAudit(page, activeGroup, 'fulfillment');
}

async function captureRequests(page) {
  activeGroup = 'requests';
  assert.strictEqual(activeIdentity.username, IDENTITIES.regional.username, 'Scene 7 must begin under Maria Santos.');
  await goto(page, 'orders', 'Service Request Workbench');
  // A full application navigation deliberately restores the default global demo user.
  // Re-select Maria so the workbench evidence remains a Western Slope operating slice.
  activeIdentity = IDENTITIES.admin;
  const regionalRequests = await switchIdentity(page, IDENTITIES.regional, '/api/orders');
  assert(Array.isArray(regionalRequests) && regionalRequests.length > 0, 'Maria received no Western Slope requests.');
  await page.getByText('Filtered to Western Slope', { exact: false }).waitFor();
  await capture(page, 'scene-7-service-request-workbench/images/scene-7-service-request-workbench.png');

  const requestTable = page.locator('.glass-card table').first();
  const inProgressRows = requestTable.locator('tbody > tr').filter({ hasText: 'In Progress' });
  await inProgressRows.first().waitFor({ state: 'visible' });
  let inProgressRow = null;
  let requestId = '';
  for (let index = 0; index < await inProgressRows.count(); index += 1) {
    const candidate = inProgressRows.nth(index);
    const candidateId = (await candidate.locator('td').first().innerText()).replace(/[^0-9]/g, '');
    const detailPayload = await page.evaluate(async ({ id, username }) => {
      const response = await fetch(`/api/orders/${id}?_capture=1`, {
        headers: { 'X-Demo-User': username },
      });
      if (!response.ok) return null;
      return response.json();
    }, { id: candidateId, username: activeIdentity.username });
    if (detailPayload?.serviceTask && detailPayload?.items?.length) {
      inProgressRow = candidate;
      requestId = `#${candidateId}`;
      break;
    }
  }
  assert(inProgressRow, 'No visible In Progress Western Slope request has both line items and a service task.');
  audit.selectedRequest = requestId;
  await capture(page, 'scene-7-service-request-workbench/images/service-request-workspace.png', {
    scroll: { text: 'Request Line Items', exact: true, block: 'center' },
    callouts: [
      { text: 'Regional VPD Manager', ancestorClass: 'rounded-lg', padding: 8 },
      { text: 'Request Line Items', exact: true, padding: 7 },
      { text: 'In Progress', exact: true, last: true, padding: 7 },
    ],
  });

  await inProgressRow.click();
  const detail = page.locator('.orders-detail-panel').first();
  await detail.waitFor({ state: 'visible' });
  await detail.getByText('Service Center Location', { exact: true }).waitFor();
  const relationalText = await detail.innerText();
  assert(/Colorado/.test(relationalText), 'Relational request detail does not show Colorado resident and center context.');
  await capture(page, 'scene-7-service-request-workbench/images/service-request-relational-detail.png', {
    scroll: { text: 'Service Center Location', exact: true, block: 'center' },
    callouts: [
      { text: 'Service Center Location', exact: true, ancestorClass: 'rounded-lg', padding: 7 },
      { text: 'Route Cost', exact: true, ancestorClass: 'rounded-lg', padding: 7 },
    ],
  });

  await detail.locator('oj-button').filter({ hasText: 'JSON Duality View' }).click();
  await detail.getByText('JSON Document', { exact: true }).waitFor();
  const jsonText = await detail.locator('pre').first().innerText();
  const document = JSON.parse(jsonText);
  assert(!/\b(?:shipped|delivered)\b/i.test(jsonText), 'JSON Duality leaked a retired physical status.');
  assert(['Submitted', 'Accepted', 'In Review', 'In Progress', 'Completed', 'Needs Follow-Up', 'Cancelled'].includes(document.status), 'JSON Duality returned an unsupported public status.');
  await capture(page, 'scene-7-service-request-workbench/images/service-request-json-duality.png', {
    scroll: { text: 'JSON Document', exact: true, block: 'center' },
    callouts: [{ text: 'JSON Document', exact: true, ancestorClass: 'rounded-lg', padding: 8 }],
  });

  await detail.locator('oj-button').filter({ hasText: 'Service Task Route' }).click();
  await detail.getByText('Service Task Progress', { exact: true }).waitFor();
  await detail.getByText('Field Resolution Underway', { exact: true }).first().waitFor();
  const routeText = await detail.innerText();
  assert(/Colorado/.test(routeText), 'Service Task Route does not show in-state resident and center context.');
  assert(!/\b(?:Shipped|Delivered|Out for Delivery)\b/i.test(routeText), 'Service Task Route contains a retired logistics status.');
  await capture(page, 'scene-7-service-request-workbench/images/service-task-route-progress.png', {
    scroll: { text: 'Service Task Progress', exact: true, block: 'center' },
    callouts: [
      { text: 'Service Task Progress', exact: true, ancestorClass: 'rounded-lg', padding: 8 },
      { text: 'Field Resolution Underway', exact: true, last: true, padding: 7 },
    ],
  });

  await page.getByRole('button', { name: 'Show Oracle Internals' }).click();
  const oraclePanel = page.locator('aside[aria-label="Oracle Internals"]');
  await oraclePanel.waitFor({ state: 'visible' });
  await capture(page, 'scene-7-service-request-workbench/images/service-request-oracle-evidence.png', {
    callouts: [{ css: 'aside[aria-label="Oracle Internals"]', padding: 3 }],
  });
  await page.getByRole('button', { name: 'Collapse Oracle Internals' }).click();

  const restoredGlobalRequests = await switchIdentity(page, IDENTITIES.admin, '/api/orders');
  assert(Array.isArray(restoredGlobalRequests) && restoredGlobalRequests.length > 0, 'Jessica did not regain statewide request rows.');
  await page.getByText('requests visible across Colorado', { exact: false }).waitFor();
  await sceneAudit(page, activeGroup, 'orders');
}

async function captureAnalytics(page) {
  activeGroup = 'analytics';
  assert.strictEqual(activeIdentity.username, IDENTITIES.admin.username, 'Scene 8 must begin under Jessica Chen.');
  await goto(page, 'oml', 'Demand & Capacity Analytics');
  await page.getByText('Services at Demand Risk', { exact: true }).waitFor();
  await capture(page, 'scene-8-demand-and-capacity-analytics/images/scene-8-demand-and-capacity-analytics.png');
  await capture(page, 'scene-8-demand-and-capacity-analytics/images/demand-surge-risk.png', {
    scroll: { text: 'Public Service Demand Risk', exact: true, block: 'center' },
    callouts: [{ text: 'Public Service Demand Risk', exact: true, ancestorTag: 'section', padding: 8 }],
  });

  await page.getByRole('button', { name: 'Need Segments', exact: true }).click();
  await page.getByText('Colorado Resident Need Segments', { exact: true }).waitFor();
  await page.getByText('Scoring resident service profiles in Oracle...', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  await capture(page, 'scene-8-demand-and-capacity-analytics/images/resident-need-segments.png', {
    scroll: { text: 'Colorado Resident Need Segments', exact: true, block: 'center' },
    callouts: [{ text: 'Colorado Resident Need Segments', exact: true, ancestorTag: 'section', padding: 8 }],
  });

  await page.getByRole('button', { name: 'Value Forecast', exact: true }).click();
  await page.getByText('Service Value Forecast - Oracle Linear Regression', { exact: true }).waitFor();
  await page.getByText(/Fitting|Loading service value forecast/i).waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  await capture(page, 'scene-8-demand-and-capacity-analytics/images/service-value-forecast.png', {
    scroll: { text: 'Service Value Forecast - Oracle Linear Regression', exact: true, block: 'center' },
    callouts: [{ text: 'Service Value Forecast - Oracle Linear Regression', exact: true, ancestorTag: 'section', padding: 8 }],
  });

  await page.getByRole('button', { name: 'Vector K-Means', exact: true }).click();
  await page.getByText('Vector K-Means Clustering', { exact: true }).last().waitFor();
  await page.getByText(/Clustering public services|Loading clusters/i).waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  await capture(page, 'scene-8-demand-and-capacity-analytics/images/vector-k-means-clusters.png', {
    scroll: { text: 'Vector K-Means Clustering', exact: true, last: true, block: 'center' },
    callouts: [{ text: 'Vector K-Means Clustering', exact: true, last: true, ancestorTag: 'section', padding: 8 }],
  });

  await page.getByRole('button', { name: 'Capacity by Center', exact: true }).click();
  await page.getByText('Demand Capacity Across Colorado Service Centers', { exact: true }).waitFor();
  await page.getByText('Scoring capacity risk against the demand model...', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  await capture(page, 'scene-8-demand-and-capacity-analytics/images/capacity-intelligence.png', {
    scroll: { text: 'Demand Capacity Across Colorado Service Centers', exact: true, block: 'center' },
    callouts: [{ text: 'Demand Capacity Across Colorado Service Centers', exact: true, ancestorTag: 'section', padding: 8 }],
  });
  await sceneAudit(page, activeGroup, 'oml');
}

async function askData(page, mode, question, endpoint) {
  await page.getByRole('button', { name: mode, exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Ask a State and Local Government data question', exact: true });
  await input.fill(question);
  const responsePromise = page.waitForResponse((response) => (
    apiPath(response.url()) === endpoint
      && response.request().headers()['x-demo-user'] === activeIdentity.username
  ), { timeout: 240000 });
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const response = await responsePromise;
  assert.strictEqual(response.status(), 200, `${mode} returned HTTP ${response.status()}.`);
  await page.getByLabel('Generating response').waitFor({ state: 'hidden', timeout: 240000 }).catch(() => {});
  await waitForStable(page);
}

async function clearAskData(page) {
  const clear = page.getByRole('button', { name: 'Clear', exact: true });
  if (await clear.count()) {
    await clear.click();
    await page.getByText('Queryable State and Local Government schema', { exact: false }).waitFor();
  }
}

async function captureAskData(page) {
  activeGroup = 'askdata';
  await goto(page, 'askdata', 'Ask State and Local Government Data');
  await capture(page, 'scene-9-ask-seer-operations-data/images/scene-9-ask-seer-operations-data.png', {
    callouts: [
      { role: 'button', name: 'Narrate', exact: true, padding: 7 },
      { role: 'button', name: 'Run SQL', exact: true, padding: 7 },
    ],
  });

  const originalQuestion = 'Which benefits eligibility cases need review because resident need is high and response capacity is low?';
  await askData(page, 'Narrate', originalQuestion, '/api/selectai/chat');
  await page.locator('.askdata-response-meta').last().waitFor();
  await capture(page, 'scene-9-ask-seer-operations-data/images/ask-public-service-data-narrate-mode.png', {
    scroll: { text: originalQuestion, exact: true, block: 'center' },
    callouts: [
      { text: originalQuestion, exact: true, padding: 8 },
      { css: '.askdata-response-meta', last: true, padding: 8 },
    ],
  });

  const followUp = 'Which constituent service requests are at risk of breaching service-level agreements this week?';
  await askData(page, 'Chat', followUp, '/api/selectai/chat-mode');
  await page.locator('.askdata-response-meta').last().waitFor();
  await capture(page, 'scene-9-ask-seer-operations-data/images/ask-public-service-data-chat-mode.png', {
    scroll: { text: followUp, exact: true, block: 'center' },
    callouts: [
      { text: followUp, exact: true, padding: 8 },
      { css: '.askdata-response-meta', last: true, padding: 8 },
    ],
  });

  await clearAskData(page);
  await askData(page, 'Show SQL', originalQuestion, '/api/selectai/showsql');
  await page.getByText('SQL not run', { exact: true }).last().waitFor();
  await page.locator('.askdata-sql-copy-button').last().waitFor({ state: 'visible' });
  await capture(page, 'scene-9-ask-seer-operations-data/images/ask-public-service-data-generated-sql.png', {
    scroll: { css: '.askdata-sql-copy-button', last: true, ancestorClass: 'rounded-lg', block: 'center' },
    callouts: [{ css: '.askdata-sql-copy-button', last: true, ancestorClass: 'rounded-lg', padding: 8 }],
  });

  await clearAskData(page);
  await askData(page, 'Run SQL', originalQuestion, '/api/selectai/runsql');
  await page.getByText('rows returned', { exact: false }).waitFor();
  await capture(page, 'scene-9-ask-seer-operations-data/images/ask-public-service-data-run-sql-results.png', {
    scroll: { text: 'rows returned', block: 'center' },
    callouts: [{ text: 'rows returned', ancestorClass: 'rounded-2xl', padding: 8 }],
  });
  await sceneAudit(page, activeGroup, 'askdata');
}

async function captureAgents(page) {
  activeGroup = 'agents';
  await goto(page, 'agents', 'Public Service AI Agent Console');
  await capture(page, 'scene-10-public-service-ai-agent-console/images/scene-10-public-service-ai-agent-console.png');
  await capture(page, 'scene-10-public-service-ai-agent-console/images/agent-console-workspace.png', {
    scroll: { text: 'Chat with AI Agents', ancestorClass: 'glass-card', block: 'center' },
    callouts: [{ text: 'Chat with AI Agents', ancestorClass: 'glass-card', padding: 8 }],
  });

  const question = 'Which public services have low capacity?';
  const input = page.getByRole('textbox', { name: 'Ask an agent runtime question', exact: true });
  await input.fill(question);
  const responsePromise = page.waitForResponse((response) => (
    apiPath(response.url()) === '/api/agents/chat'
      && response.request().headers()['x-demo-user'] === activeIdentity.username
  ), { timeout: 240000 });
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const response = await responsePromise;
  assert.strictEqual(response.status(), 200, `Agent chat returned HTTP ${response.status()}.`);
  await page.getByText(question, { exact: true }).waitFor();
  await page.getByText(/Resident Signal Agent|Service Access Agent|Public Service Operations Agent/).last().waitFor({ state: 'visible', timeout: 240000 });
  await page.getByLabel('Agent thinking').waitFor({ state: 'hidden', timeout: 240000 }).catch(() => {});
  await waitForStable(page, 1000);
  await capture(page, 'scene-10-public-service-ai-agent-console/images/agent-public-service-response.png', {
    scroll: { text: question, exact: true, block: 'center' },
    callouts: [{ text: question, exact: true, ancestorClass: 'glass-card', padding: 8 }],
  });
  await page.getByText('Recent Agent Actions', { exact: true }).waitFor();
  await capture(page, 'scene-10-public-service-ai-agent-console/images/agent-action-audit-trail.png', {
    scroll: { text: 'Recent Agent Actions', exact: true, block: 'center' },
    callouts: [{ text: 'Recent Agent Actions', exact: true, ancestorClass: 'glass-card', padding: 8 }],
  });
  await sceneAudit(page, activeGroup, 'agents');
}

async function captureDataset(page) {
  activeGroup = 'dataset';
  await goto(page, 'welcome', 'Colorado Resident Services Overview');
  await page.getByRole('button', { name: 'Use Your Own Public Service Data', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByText('Active dataset:', { exact: false }).waitFor();
  await capture(page, 'scene-11-use-your-own-public-service-data/images/scene-11-use-your-own-public-service-data.png');
  await capture(page, 'scene-11-use-your-own-public-service-data/images/open-dataset-tool.png', {
    callouts: [
      { role: 'dialog', name: 'Use Your Own Public Service Data', padding: 4 },
      { text: 'Active dataset:', padding: 7 },
    ],
  });
  await capture(page, 'scene-11-use-your-own-public-service-data/images/template-and-upload-workflow.png', {
    scroll: { text: '1. Download Template ZIP', ancestorClass: 'glass-card', block: 'center' },
    callouts: [
      { text: '1. Download Template ZIP', ancestorClass: 'glass-card', padding: 8 },
      { text: '2. Select Completed ZIP', ancestorClass: 'glass-card', padding: 8 },
    ],
  });

  const previewResponse = page.waitForResponse((response) => (
    apiPath(response.url()) === '/api/import/restore-demo/validate'
      && response.request().headers()['x-demo-user'] === activeIdentity.username
  ), { timeout: 120000 });
  await page.getByRole('button', { name: 'Preview Restore', exact: true }).click();
  const response = await previewResponse;
  assert.strictEqual(response.status(), 200, `Preview Restore returned HTTP ${response.status()}.`);
  const preview = await response.json();
  assert.notStrictEqual(preview.valid, false, `Preview Restore reported invalid demo data: ${JSON.stringify(preview)}`);
  await waitForStable(page);
  await capture(page, 'scene-11-use-your-own-public-service-data/images/preview-restore-seeded-dataset.png', {
    scroll: { text: 'Restore Demo Data', exact: true, last: true, block: 'center' },
    callouts: [
      { role: 'button', name: 'Preview Restore', exact: true, padding: 8 },
      { role: 'button', name: 'Restore Demo Data', exact: true, padding: 8 },
    ],
  });
  await sceneAudit(page, activeGroup, 'welcome');
}

function isExpectedAuthorizationDenial(entry) {
  const globalOnlyPaths = new Set([
    '/api/import/dataset',
    '/api/dashboard/inmemory',
    '/api/ml/persistence/status',
    '/api/ml/vector-clusters',
    '/api/ml/models/status',
  ]);
  return entry.status === 403
    && globalOnlyPaths.has(entry.path)
    && entry.username !== IDENTITIES.admin.username;
}

function isEnvironmentalConsoleWarning(message) {
  const text = String(message || '');
  return text.includes('Cross-Origin-Opener-Policy')
    && text.includes('origin was untrustworthy');
}

function isGenericForbiddenConsoleError(message) {
  return /Failed to load resource:\s*the server responded with a status of 403\b/i.test(String(message || ''));
}

function finalizeAudit(error) {
  audit.expectedAuthorizationDenials = audit.apiResponses.filter(isExpectedAuthorizationDenial);
  const hasExpected403 = audit.expectedAuthorizationDenials.length > 0;
  audit.unexpectedApiErrors = audit.apiResponses.filter((entry) => entry.status >= 400 && !isExpectedAuthorizationDenial(entry));
  audit.unexpectedConsoleErrors = audit.consoleErrors.filter((message) => (
    !isEnvironmentalConsoleWarning(message)
      && !(hasExpected403 && isGenericForbiddenConsoleError(message))
  ));
  audit.capturedCount = capturedFiles.size;
  audit.missingCaptures = CAPTURES.map((entry) => entry.file).filter((file) => !capturedFiles.has(file));
  audit.status = error ? 'failed' : 'passed';
  if (error) audit.failure = error.stack || error.message || String(error);
  audit.completedAt = new Date().toISOString();
  ensureParent(AUDIT_OUTPUT);
  fs.writeFileSync(AUDIT_OUTPUT, `${JSON.stringify(audit, null, 2)}\n`);
}

async function main() {
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  page.on('console', (message) => {
    if (message.type() === 'error') audit.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => audit.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/')) {
      audit.requestFailures.push(`${request.failure()?.errorText || 'request failed'} ${request.url()}`);
    }
  });
  page.on('response', (response) => {
    if (!response.url().includes('/api/')) return;
    audit.apiResponses.push({
      path: apiPath(response.url()),
      status: response.status(),
      username: response.request().headers()['x-demo-user'] || null,
      method: response.request().method(),
    });
  });

  let runError = null;
  try {
    await captureWelcome(page);
    await captureFoundation(page);
    await captureDashboard(page);
    await captureSignals(page);
    await captureGraph(page);
    await captureCoverage(page);
    await captureRequests(page);
    await captureAnalytics(page);
    await captureAskData(page);
    await captureAgents(page);
    await captureDataset(page);

    assert.strictEqual(capturedFiles.size, CAPTURES.length, `Expected ${CAPTURES.length} captures, wrote ${capturedFiles.size}.`);
    assert.deepStrictEqual(
      [...capturedFiles].sort(),
      CAPTURES.map((entry) => entry.file).sort(),
      'Captured files do not match the declared 52-image plan.',
    );

    finalizeAudit(null);
    assert.deepStrictEqual(audit.unexpectedApiErrors, [], `Unexpected API errors: ${JSON.stringify(audit.unexpectedApiErrors)}`);
    assert.deepStrictEqual(audit.requestFailures, [], `API request failures: ${audit.requestFailures.join(' | ')}`);
    assert.deepStrictEqual(audit.pageErrors, [], `Browser page errors: ${audit.pageErrors.join(' | ')}`);
    assert.deepStrictEqual(audit.unexpectedConsoleErrors, [], `Unexpected console errors: ${audit.unexpectedConsoleErrors.join(' | ')}`);
    process.stdout.write(`SLED RUNBOOK CAPTURE GREEN: ${capturedFiles.size} selected and ${capturedFiles.size} raw screenshots\n`);
  } catch (error) {
    runError = error;
    finalizeAudit(error);
    throw error;
  } finally {
    await browser.close();
    if (!runError && audit.status !== 'passed') finalizeAudit(new Error('Capture ended without a passing audit.'));
  }
}

main().catch((error) => {
  console.error('SLED runbook capture failed:');
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
