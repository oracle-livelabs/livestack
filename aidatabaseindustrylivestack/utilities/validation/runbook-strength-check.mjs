#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const utilitiesRoot = path.join(repoRoot, 'utilities');
const healthcareRoot = path.join(repoRoot, 'healthcare');

const failures = [];

function fail(message) {
  failures.push(message);
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function walk(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, out);
    } else if (predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function rel(file) {
  return path.relative(repoRoot, file);
}

function parseManifest(variant) {
  const file = path.join(utilitiesRoot, 'workshops', variant, 'manifest.json');
  return JSON.parse(readText(file));
}

function assertFile(relativePath) {
  if (!exists(relativePath)) {
    fail(`Missing required file: ${relativePath}`);
  }
}

function assertNoFile(relativePath) {
  if (exists(relativePath)) {
    fail(`File should be removed for healthcare parity: ${relativePath}`);
  }
}

function assertMarkdownReferences(markdownPath, imageName) {
  const markdown = readText(path.join(repoRoot, markdownPath));
  if (!markdown.includes(`images/${imageName}`)) {
    fail(`${markdownPath} must reference images/${imageName}`);
  }
}

function assertManifestTitles(variant, expectedTitles) {
  const manifest = parseManifest(variant);
  const actualTitles = manifest.tutorials.map((tutorial) => tutorial.title);
  const actual = JSON.stringify(actualTitles);
  const expected = JSON.stringify(expectedTitles);
  if (actual !== expected) {
    fail(
      `utilities/workshops/${variant}/manifest.json tutorial titles differ.\n` +
        `  Expected: ${expectedTitles.join(' | ')}\n` +
        `  Actual:   ${actualTitles.join(' | ')}`
    );
  }

  for (const tutorial of manifest.tutorials) {
    if (/conclusion/i.test(tutorial.title) || /conclusion/i.test(tutorial.filename)) {
      fail(`utilities/workshops/${variant}/manifest.json must not include conclusion lab entries`);
    }
  }
}

function assertLocalMarkdownLinks() {
  const markdownFiles = walk(utilitiesRoot, (file) => file.endsWith('.md'));
  const linkPattern = /(!?)\[[^\]]*]\(([^)]+)\)/g;

  for (const file of markdownFiles) {
    const text = readText(file);
    for (const match of text.matchAll(linkPattern)) {
      const target = match[2].split('#')[0];
      if (!target || /^(https?:|mailto:|youtube:)/.test(target)) continue;
      const targetPath = path.normalize(path.join(path.dirname(file), target));
      if (!fs.existsSync(targetPath)) {
        fail(`${rel(file)} references missing local target: ${target}`);
      }
    }
  }
}

function assertNoHealthcareResidue() {
  const forbidden = [
    'patient',
    'clinical',
    'provider',
    'care plan',
    'diagnosis',
    'hospital',
    'clinic',
    'medication',
    'healthcare',
    'claims',
    'encounter',
    'physician',
    'nurse',
    'lab result',
    'ehr',
    'seer health',
    'care logistics',
    'care site',
    'care request',
  ];
  const markdownFiles = walk(utilitiesRoot, (file) => file.endsWith('.md'));

  for (const file of markdownFiles) {
    const lower = readText(file).toLowerCase();
    for (const term of forbidden) {
      if (lower.includes(term)) {
        fail(`${rel(file)} contains healthcare residue term: ${term}`);
      }
    }
  }
}

function assertHealthcareParityShape() {
  if (!fs.existsSync(healthcareRoot)) {
    fail('Healthcare reference folder is missing');
    return;
  }

  assertNoFile('utilities/conclusion/conclusion.md');
  assertNoFile('utilities/conclusion/images/scene-10-agent-console.png');

  const healthcareMarkdownCount = walk(healthcareRoot, (file) => file.endsWith('.md')).length;
  const utilitiesMarkdownCount = walk(utilitiesRoot, (file) => file.endsWith('.md')).length;
  if (utilitiesMarkdownCount !== healthcareMarkdownCount) {
    fail(
      `Utilities should match healthcare markdown count after removing conclusion: ` +
        `expected ${healthcareMarkdownCount}, found ${utilitiesMarkdownCount}`
    );
  }
}

function assertRequiredScreenshotEvidence() {
  const requiredByScene = {
    'utilities/scene-7-service-tickets-and-json-duality/scene-7-service-tickets-and-json-duality.md': [
      'scene-07-service-tickets.png',
      'service-request-workspace.png',
      'utility-request-relational-detail.png',
      'utility-request-json-duality.png',
      'utility-request-logistics-route.png',
    ],
    'utilities/scene-9-ask-your-data/scene-9-ask-your-data.md': [
      'scene-09-ask-data.png',
      'ask-utility-data-initial.png',
      'ask-utility-data-explain-mode.png',
      'ask-utility-data-chat-mode.png',
      'ask-utility-data-generated-sql.png',
      'ask-utility-data-run-sql-results.png',
    ],
    'utilities/scene-10-agent-console-and-operational-actions/scene-10-agent-console-and-operational-actions.md': [
      'scene-10-agent-console.png',
      'agent-utility-operations-response.png',
      'agent-action-audit-trail.png',
    ],
  };

  for (const [markdownPath, imageNames] of Object.entries(requiredByScene)) {
    assertFile(markdownPath);
    const imageDir = path.join(path.dirname(markdownPath), 'images');

    for (const imageName of imageNames) {
      assertFile(path.join(imageDir, imageName));
      assertMarkdownReferences(markdownPath, imageName);
    }
  }
}

function assertScene10IsUiBacked() {
  const scene10Path = 'utilities/scene-10-agent-console-and-operational-actions/scene-10-agent-console-and-operational-actions.md';
  const text = readText(path.join(repoRoot, scene10Path)).toLowerCase();
  const forbiddenPhrases = [
    'endpoint',
    'api',
    'did not consistently render',
    'screenshot-verified',
    'verification note',
  ];

  for (const phrase of forbiddenPhrases) {
    if (text.includes(phrase)) {
      fail(`${scene10Path} should be backed by visible UI screenshots, not caveated with "${phrase}"`);
    }
  }
}

function assertDataRichScreenshotEvidence() {
  const minimumBytesByImage = {
    'utilities/scene-3-command-center-dashboard/images/command-center-kpis-overview.png': 275000,
    'utilities/scene-3-command-center-dashboard/images/signal-velocity-and-operational-value.png': 275000,
    'utilities/scene-3-command-center-dashboard/images/watched-services-and-supplies.png': 250000,
    'utilities/scene-4-outage-signal-trends-and-vector-search/images/signal-feed-overview.png': 290000,
    'utilities/scene-4-outage-signal-trends-and-vector-search/images/matched-load-signal-cards.png': 290000,
    'utilities/scene-5-field-crew-graph/images/graph-workspace-controls.png': 320000,
    'utilities/scene-5-field-crew-graph/images/restoration-risk-node-example.png': 320000,
    'utilities/scene-5-field-crew-graph/images/graph-query-explorer.png': 280000,
    'utilities/scene-6-service-restoration-map/images/logistics-priorities.png': 300000,
    'utilities/scene-6-service-restoration-map/images/field-crew-logistics-map-layers.png': 280000,
    'utilities/scene-6-service-restoration-map/images/field-crew-logistics-sites-table.png': 250000,
    'utilities/scene-8-oml-analytics/images/service-demand-risk.png': 280000,
    'utilities/scene-8-oml-analytics/images/capacity-supply-intelligence.png': 280000,
    'utilities/scene-10-agent-console-and-operational-actions/images/agent-utility-operations-response.png': 240000,
  };

  for (const [relativePath, minimumBytes] of Object.entries(minimumBytesByImage)) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      fail(`Missing data-rich screenshot evidence: ${relativePath}`);
      continue;
    }

    const actualBytes = fs.statSync(absolutePath).size;
    if (actualBytes < minimumBytes) {
      fail(
        `${relativePath} looks too small for the expected populated UI capture: ` +
          `${actualBytes} bytes, expected at least ${minimumBytes}`
      );
    }
  }
}

function assertTargetedScreenshotContent() {
  const python = String.raw`
import json
import sys
from pathlib import Path
from PIL import Image

repo_root = Path(sys.argv[1])
failures = []

def open_image(relative_path):
    path = repo_root / relative_path
    if not path.exists():
        failures.append(f"Missing targeted screenshot: {relative_path}")
        return None
    return Image.open(path).convert("RGB")

def stats(image, box):
    crop = image.crop(box)
    pixels = list(crop.getdata())
    total = len(pixels)
    dark = sum(1 for r, g, b in pixels if r < 105 and g < 105 and b < 105)
    nonwhite = sum(1 for r, g, b in pixels if min(255 - r, 255 - g, 255 - b) > 20)
    saturated = sum(
        1
        for r, g, b in pixels
        if max(r, g, b) - min(r, g, b) > 35 and max(r, g, b) > 90
    )
    return {
        "total": total,
        "dark": dark,
        "nonwhite": nonwhite,
        "saturated": saturated,
        "saturated_ratio": saturated / max(1, total),
    }

def horizontal_rule_count(image, box):
    crop = image.crop(box)
    width, height = crop.size
    pixels = crop.load()
    line_rows = []

    for y in range(height):
        score = 0
        for x in range(width):
            r, g, b = pixels[x, y]
            if 205 <= r <= 235 and 205 <= g <= 235 and 205 <= b <= 235 and max(r, g, b) - min(r, g, b) < 12:
                score += 1
        if score > width * 0.55:
            line_rows.append(y)

    groups = []
    for y in line_rows:
        if not groups or y > groups[-1][-1] + 1:
            groups.append([y])
        else:
            groups[-1].append(y)
    return len(groups)

scene6_path = "utilities/scene-6-service-restoration-map/images/field-crew-logistics-map-layers.png"
scene6 = open_image(scene6_path)
if scene6:
    if scene6.size != (1280, 1066):
        failures.append(f"{scene6_path} must remain a full UI capture at 1280x1066")

    toggle_boxes = [
        (340, 209, 376, 230),
        (340, 253, 376, 274),
        (340, 297, 376, 318),
        (340, 340, 376, 362),
        (340, 384, 376, 406),
        (340, 429, 376, 450),
    ]
    active_toggles = sum(1 for box in toggle_boxes if stats(scene6, box)["saturated_ratio"] >= 0.40)
    if active_toggles < 5:
        failures.append(
            f"{scene6_path} should show active map layer toggles; found only {active_toggles} visibly colored toggles"
        )

    map_overlay = stats(scene6, (605, 300, 895, 594))
    if map_overlay["saturated"] < 7000 or map_overlay["nonwhite"] < 50000:
        failures.append(
            f"{scene6_path} should show populated spatial overlays, not a mostly blank base map"
        )

scene9_path = "utilities/scene-9-ask-your-data/images/ask-utility-data-chat-mode.png"
scene9 = open_image(scene9_path)
if scene9:
    if scene9.size != (1280, 1066):
        failures.append(f"{scene9_path} must remain a full UI capture at 1280x1066")

    answer_body = stats(scene9, (352, 431, 774, 668))
    followups = stats(scene9, (352, 685, 777, 759))
    if answer_body["dark"] < 5500 or answer_body["nonwhite"] < 12000:
        failures.append(
            f"{scene9_path} should show a completed Chat answer with visible result text, not a loading state"
        )
    if followups["dark"] < 1500:
        failures.append(
            f"{scene9_path} should show completed Chat follow-up prompts"
        )

scene10_path = "utilities/scene-10-agent-console-and-operational-actions/images/agent-utility-operations-response.png"
scene10 = open_image(scene10_path)
if scene10:
    if scene10.size != (1280, 1066):
        failures.append(f"{scene10_path} must remain a full UI capture at 1280x1066")

    response_region = stats(scene10, (370, 344, 792, 598))
    table_rules = horizontal_rule_count(scene10, (345, 490, 794, 745))
    if response_region["dark"] < 3000 or response_region["nonwhite"] < 9000:
        failures.append(
            f"{scene10_path} should show a populated agent response table, not an empty agent panel"
        )
    if table_rules < 7:
        failures.append(
            f"{scene10_path} should show multiple visible table rows in the agent response; found {table_rules}"
        )

print(json.dumps(failures))
`;

  const result = spawnSync('python3', ['-c', python, repoRoot], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 4,
  });

  if (result.error) {
    fail(`Unable to inspect targeted screenshot content: ${result.error.message}`);
    return;
  }

  if (result.status !== 0) {
    fail(`Unable to inspect targeted screenshot content:\n${result.stderr.trim()}`);
    return;
  }

  const screenshotFailures = JSON.parse(result.stdout);
  for (const screenshotFailure of screenshotFailures) {
    fail(screenshotFailure);
  }
}

function collectTaskImageReferences() {
  const markdownFiles = walk(utilitiesRoot, (file) => file.endsWith('.md'));
  const imageRefs = [];
  const imagePattern = /!\[[^\]]*]\(([^)]+)\)/g;

  for (const file of markdownFiles) {
    const lines = readText(file).split(/\r?\n/);
    let inTask = false;
    let task = '';

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^## Task /.test(line)) {
        inTask = true;
        task = line.replace(/^## /, '');
      } else if (/^## /.test(line)) {
        inTask = false;
        task = '';
      }

      if (!inTask) continue;

      for (const match of line.matchAll(imagePattern)) {
        const target = match[1].split('#')[0];
        if (!target || /^(https?:|mailto:|youtube:)/.test(target)) continue;

        const imagePath = path.normalize(path.join(path.dirname(file), target));
        imageRefs.push({
          markdown: rel(file),
          line: index + 1,
          task,
          image: imagePath,
        });
      }
    }
  }

  return imageRefs;
}

function assertTaskScreenshotsHaveRedCallouts() {
  const imageRefs = collectTaskImageReferences();
  if (imageRefs.length === 0) {
    fail('No task-section screenshots were found in utilities markdown');
    return;
  }

  const missingFiles = imageRefs.filter((ref) => !fs.existsSync(ref.image));
  for (const ref of missingFiles) {
    fail(`${ref.markdown}:${ref.line} references missing task screenshot: ${path.relative(repoRoot, ref.image)}`);
  }
  if (missingFiles.length > 0) return;

  const python = String.raw`
import json
import sys
from collections import deque
from PIL import Image

missing = []

def has_callout(path):
    image = Image.open(path).convert("RGB")
    width, height = image.size
    pixels = image.load()
    mask = bytearray(width * height)

    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            if r >= 150 and g <= 95 and b <= 95 and (r - g) >= 70 and (r - b) >= 70:
                mask[y * width + x] = 1

    seen = bytearray(width * height)
    for idx, value in enumerate(mask):
        if not value or seen[idx]:
            continue

        queue = [idx]
        seen[idx] = 1
        min_x = width
        min_y = height
        max_x = 0
        max_y = 0
        count = 0

        while queue:
            current = queue.pop()
            count += 1
            y, x = divmod(current, width)
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)

            for next_x, next_y in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= next_x < width and 0 <= next_y < height:
                    next_idx = next_y * width + next_x
                    if mask[next_idx] and not seen[next_idx]:
                        seen[next_idx] = 1
                        queue.append(next_idx)

        box_width = max_x - min_x + 1
        box_height = max_y - min_y + 1
        fill = count / max(1, box_width * box_height)

        if count >= 1200 and box_width >= 160 and box_height >= 70 and fill <= 0.25:
            return True

    return False

for path in sys.argv[1:]:
    if not has_callout(path):
        missing.append(path)

print(json.dumps(missing))
`;

  const result = spawnSync('python3', ['-c', python, ...imageRefs.map((ref) => ref.image)], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 4,
  });

  if (result.error) {
    fail(`Unable to inspect task screenshot callouts: ${result.error.message}`);
    return;
  }

  if (result.status !== 0) {
    fail(`Unable to inspect task screenshot callouts:\n${result.stderr.trim()}`);
    return;
  }

  const missingCallouts = JSON.parse(result.stdout);
  for (const imagePath of missingCallouts) {
    const ref = imageRefs.find((candidate) => candidate.image === imagePath);
    fail(
      `${path.relative(repoRoot, imagePath)} must include a healthcare-style red callout box` +
        (ref ? ` (${ref.markdown}:${ref.line}, ${ref.task})` : '')
    );
  }
}

const expectedDesktop = [
  'Introduction',
  'Download and Run the LiveStack',
  'Scene 1: Welcome and Demo Orientation',
  'Scene 2: Energy and Utilities Data Foundation',
  'Scene 3: Grid Operations Command Center',
  'Scene 4: Reliability and Load Signal Intelligence',
  'Scene 5: Service Restoration Graph',
  'Scene 6: Field Crew Logistics Map',
  'Scene 7: Utility Service Requests',
  'Scene 8: Asset Risk and Capacity Analytics',
  'Scene 9: Ask Utility Data',
  'Scene 10: Utilities AI Agent Console',
  'Scene 11: Bring Your Own Utility Data',
  'Need Help?',
];

const expectedSandbox = [
  'Get Started',
  'Introduction',
  ...expectedDesktop.slice(2, 13),
  'Take it home',
  'Need Help?',
];

const expectedTenancy = [
  'Introduction',
  'Get Started',
  ...expectedDesktop.slice(2, 13),
  'Download the LiveStack',
  'Need Help?',
];

assertHealthcareParityShape();
assertManifestTitles('desktop', expectedDesktop);
assertManifestTitles('sandbox', expectedSandbox);
assertManifestTitles('tenancy', expectedTenancy);
assertRequiredScreenshotEvidence();
assertScene10IsUiBacked();
assertDataRichScreenshotEvidence();
assertTargetedScreenshotContent();
assertTaskScreenshotsHaveRedCallouts();
assertLocalMarkdownLinks();
assertNoHealthcareResidue();

if (failures.length > 0) {
  console.error(`Runbook strength check failed with ${failures.length} issue(s):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Runbook strength check passed.');
