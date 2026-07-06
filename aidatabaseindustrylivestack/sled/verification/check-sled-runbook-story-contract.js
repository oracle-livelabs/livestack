#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const guideRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(
  process.env.SLED_APP_ROOT
    || '/Users/mkowalik/Documents/GitHub/oracle-livelabs/demo-code/livestacks/26ai-industries/sled',
);
const failures = [];

const sceneFiles = [
  'scene-1-sled-operations-brief/scene-1-sled-operations-brief.md',
  'scene-2-seer-26ai-data-foundation/scene-2-seer-26ai-data-foundation.md',
  'scene-3-public-service-command-center/scene-3-public-service-command-center.md',
  'scene-4-resident-demand-signals/scene-4-resident-demand-signals.md',
  'scene-5-community-partner-network/scene-5-community-partner-network.md',
  'scene-6-service-access-and-coverage-map/scene-6-service-access-and-coverage-map.md',
  'scene-7-service-request-workbench/scene-7-service-request-workbench.md',
  'scene-8-demand-and-capacity-analytics/scene-8-demand-and-capacity-analytics.md',
  'scene-9-ask-seer-operations-data/scene-9-ask-seer-operations-data.md',
  'scene-10-public-service-ai-agent-console/scene-10-public-service-ai-agent-console.md',
  'scene-11-use-your-own-public-service-data/scene-11-use-your-own-public-service-data.md',
];
const guideFiles = [
  'introduction/introduction.md',
  ...sceneFiles,
  'download-livestack/download-livestack-take-it-home.md',
];

function read(relativePath) {
  const absolutePath = path.join(guideRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function requireText(relativePath, pattern, description) {
  const content = read(relativePath);
  if (!pattern.test(content)) failures.push(`${relativePath}: missing ${description}`);
}

function forbidText(relativePath, pattern, description) {
  const content = read(relativePath);
  if (pattern.test(content)) failures.push(`${relativePath}: contains ${description}`);
}

const contents = new Map(guideFiles.map((file) => [file, read(file)]));
const allGuideText = [...contents.values()].join('\n');

requireText('introduction/introduction.md', /Colorado State and Local Government Service Operations LiveStack Guide/i, 'Colorado guide title');
requireText('introduction/introduction.md', /Jessica Chen[\s\S]{0,300}statewide/i, 'Jessica Chen statewide operating persona');
requireText('introduction/introduction.md', /Medicaid Eligibility Error Rate/i, 'Medicaid Eligibility Error Rate');
requireText('introduction/introduction.md', /2\.7%/, 'current 2.7% eligibility error rate');
requireText('introduction/introduction.md', /3\.0%/, '3.0% stakeholder-provided threshold');
requireText('introduction/introduction.md', /not a Medicaid-only application/i, 'broader state-services scope clarification');
requireText('introduction/introduction.md', /global[\s\S]{0,100}regional[\s\S]{0,100}restricted/i, 'global, regional, and restricted VPD story');

for (const [index, sceneFile] of sceneFiles.entries()) {
  const expectedScene = index + 1;
  requireText(sceneFile, new RegExp(`^# Scene ${expectedScene}\\b`, 'm'), `Scene ${expectedScene} heading`);
  requireText(sceneFile, /Colorado/i, 'Colorado operating scope');
  requireText(sceneFile, /## Credits & Build Notes/, 'Credits & Build Notes closing section');
}

requireText(sceneFiles[0], /2\.7%[\s\S]{0,220}3\.0%/, 'eligibility-risk decision framing');
requireText(sceneFiles[1], /governed Colorado baseline/i, 'governed Colorado baseline');
requireText(sceneFiles[2], /Approaching Threshold/, 'Approaching Threshold status');
requireText(sceneFiles[2], /Within 3\.0% limit/, 'within-threshold interpretation');
requireText(sceneFiles[2], /potential federal matching-fund exposure/i, 'potential funding exposure explanation');
requireText(sceneFiles[3], /benefits eligibility appointment backlog/i, 'eligibility-related vector-search example');
requireText(sceneFiles[4], /Colorado[\s\S]{0,160}(partner|program)/i, 'Colorado partner-coordination decision');
requireText(sceneFiles[5], /Global VPD/i, 'global VPD state');
requireText(sceneFiles[5], /Regional VPD/i, 'regional VPD state');
requireText(sceneFiles[5], /Restricted VPD/i, 'restricted VPD state');
requireText(sceneFiles[6], /Request Line Items/, 'Request Line Items label');
requireText(sceneFiles[6], /Number of individual service or eligibility items included in the resident request/i, 'Request Line Items definition');
requireText(sceneFiles[6], /Service Task Route/, 'Service Task Route walkthrough');
requireText(sceneFiles[6], /Field Resolution Underway/, 'Field Resolution Underway status');
requireText(sceneFiles[6], /assigned in-state team is actively resolving the request in the resident(?:'|’)s service area/i, 'Field Resolution Underway definition');
requireText(sceneFiles[6], /Submitted[\s\S]{0,180}Accepted[\s\S]{0,180}In Review[\s\S]{0,180}In Progress[\s\S]{0,180}Completed/i, 'request lifecycle');
requireText(sceneFiles[6], /Intake[\s\S]{0,180}Assigned[\s\S]{0,180}Scheduled[\s\S]{0,180}Dispatched[\s\S]{0,180}Field Resolution Underway[\s\S]{0,180}Completed/i, 'service-task lifecycle');
requireText(sceneFiles[7], /Colorado (service regions|service centers)/i, 'Colorado demand-capacity comparison');
requireText(sceneFiles[8], /Colorado/i, 'Colorado-specific Ask Data question');
requireText(sceneFiles[9], /audit trail/i, 'audited agent action');
requireText(sceneFiles[10], /(synthetic|anonymized)/i, 'safe demo-data guidance');
requireText(sceneFiles[10], /Restore Demo Data/i, 'seeded-data restore workflow');

if (/\bline[- ]count\b/i.test(allGuideText)) failures.push('Guide contains unexplained line-count terminology');
if (/\b(?:shipped|delivered)\b/i.test(allGuideText)) failures.push('Guide contains retired logistics lifecycle labels');
if (/\b(?:nationwide|New York|Houston|San Jose|San Diego|Kentucky|California|Florida|Indiana|Albuquerque|Atlanta|Austin|Baltimore|Boston|Charlotte)\b/i.test(allGuideText)) {
  failures.push('Guide contains out-of-state operational examples');
}
if (/#113881\b/.test(allGuideText)) failures.push('Guide hardcodes the stale request ID #113881');
if (/Invalid Date/i.test(allGuideText)) failures.push('Guide contains Invalid Date');

const introTimeMatch = contents.get('introduction/introduction.md').match(/Estimated Demo Time:[^\n]*\*\*(\d+) minutes\*\*/i);
const sceneTimes = sceneFiles.map((file) => {
  const match = contents.get(file).match(/Estimated Time:[^\n]*\*\*(\d+) minutes\*\*/i);
  if (!match) failures.push(`${file}: missing estimated time`);
  return match ? Number(match[1]) : 0;
});
if (sceneTimes.some((minutes) => minutes < 5 || minutes > 12)) failures.push('Scene estimates must stay between 5 and 12 minutes');
const sceneTotal = sceneTimes.reduce((sum, minutes) => sum + minutes, 0);
if (!introTimeMatch || Number(introTimeMatch[1]) !== sceneTotal) {
  failures.push(`Introduction estimate must equal scene total (${sceneTotal} minutes)`);
}

const imageReferences = [];
for (const [file, content] of contents.entries()) {
  for (const match of content.matchAll(/!\[([^\]]+)\]\(([^)]+\.(?:png|jpg|jpeg))\)/gi)) {
    const relativeImage = path.normalize(path.join(path.dirname(file), match[2]));
    imageReferences.push(relativeImage.split(path.sep).join('/'));
    if (!fs.existsSync(path.join(guideRoot, relativeImage))) failures.push(`${file}: missing image ${match[2]}`);
    if (!match[1].trim()) failures.push(`${file}: image ${match[2]} has empty alt text`);
  }
}
if (new Set(imageReferences).size !== imageReferences.length) failures.push('Each selected guide image must be referenced exactly once');
if (imageReferences.length < 49) failures.push(`Expected at least 49 current guide images, found ${imageReferences.length}`);

for (const variant of ['sandbox', 'desktop', 'tenancy']) {
  const manifestPath = `workshops/${variant}/manifest.json`;
  const manifestText = read(manifestPath);
  if (!manifestText) continue;
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    failures.push(`${manifestPath}: invalid JSON (${error.message})`);
    continue;
  }
  const filenames = (manifest.tutorials || []).map((tutorial) => tutorial.filename);
  for (const sceneFile of sceneFiles) {
    const expected = `../../${sceneFile}`;
    if (!filenames.includes(expected)) failures.push(`${manifestPath}: missing ${expected}`);
  }
  if (!filenames.includes('../../introduction/introduction.md')) failures.push(`${manifestPath}: missing introduction`);
  if (!filenames.includes('../../download-livestack/download-livestack-take-it-home.md')) failures.push(`${manifestPath}: missing Take It Home lab`);
}

const inventoryPath = 'output/guide-screenshots/inventory.json';
const inventoryText = read(inventoryPath);
if (inventoryText) {
  try {
    const inventory = JSON.parse(inventoryText);
    const screenshots = Array.isArray(inventory) ? inventory : inventory.screenshots;
    if (!Array.isArray(screenshots)) {
      failures.push(`${inventoryPath}: screenshots must be an array`);
    } else {
      if (screenshots.length !== imageReferences.length) failures.push(`${inventoryPath}: count does not match Markdown image references`);
      for (const item of screenshots) {
        for (const key of ['file', 'view', 'caption', 'alt', 'note']) {
          if (!String(item?.[key] || '').trim()) failures.push(`${inventoryPath}: screenshot entry missing ${key}`);
        }
        if (item?.file && !fs.existsSync(path.join(guideRoot, 'output/guide-screenshots', item.file))) {
          failures.push(`${inventoryPath}: missing captured file ${item.file}`);
        }
      }
    }
    if (!String(inventory.sourceApp || '').includes('158.178.146.34:8505')) failures.push(`${inventoryPath}: sourceApp must be the SLED OCI VM`);
  } catch (error) {
    failures.push(`${inventoryPath}: invalid JSON (${error.message})`);
  }
}
read('output/guide-screenshots/inventory.md');

const storyPath = path.join(appRoot, 'frontend/src/components/StateLocalGovernmentStory.jsx');
if (!fs.existsSync(storyPath)) {
  failures.push(`Missing app story source: ${storyPath}`);
} else {
  const storySource = fs.readFileSync(storyPath, 'utf8');
  const stageValues = [...storySource.matchAll(/stage:\s*'([0-9]+)'/g)].map((match) => Number(match[1]));
  if (JSON.stringify(stageValues) !== JSON.stringify([2, 3, 4, 5, 6, 7, 8, 9, 10])) {
    failures.push(`App story rail stages must align to guide Scenes 2-10; found ${stageValues.join(', ')}`);
  }
  for (let scene = 2; scene <= 10; scene += 1) {
    if (!storySource.includes(`Scene ${scene} -`)) failures.push(`App story source missing Scene ${scene} label`);
  }
  for (const required of ['Colorado', '2.7%', '3.0%', 'Field Resolution Underway', 'Request Line Items']) {
    if (!storySource.includes(required)) failures.push(`App story source missing ${required}`);
  }
}

if (fs.existsSync(path.join(guideRoot, 'workshops/.DS_Store'))) failures.push('Guide contains workshops/.DS_Store');

if (failures.length) {
  console.error(`SLED runbook story contract RED: ${failures.length} issue(s)`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log(`SLED runbook story contract GREEN: 11 scenes, ${imageReferences.length} images, ${sceneTotal} minutes`);
