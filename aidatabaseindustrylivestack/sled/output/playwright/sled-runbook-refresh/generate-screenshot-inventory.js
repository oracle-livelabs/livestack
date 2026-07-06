#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CAPTURE_DATE, CAPTURES, VIEWPORT } = require('./capture-plan');

const guideRoot = path.resolve(__dirname, '..', '..', '..');
const screenshotRoot = path.resolve(
  process.env.SLED_SCREENSHOT_ROOT || path.join(guideRoot, 'output', 'guide-screenshots'),
);
const captureFolder = `capture-${CAPTURE_DATE}`;
const captureRoot = path.join(screenshotRoot, captureFolder);
const rawRoot = path.join(captureRoot, 'raw');
const selectedRoot = path.join(captureRoot, 'selected');
const auditPath = path.join(screenshotRoot, 'live-audit.json');
const sourceApp = process.env.SLED_SOURCE_APP_URL || 'http://158.178.146.34:8505/';

function walk(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath, predicate);
    return predicate(fullPath) ? [fullPath] : [];
  });
}

function posixPath(value) {
  return value.split(path.sep).join('/');
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function pngDimensions(filePath) {
  const header = Buffer.alloc(24);
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    if (bytesRead < header.length || header.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
      throw new Error(`${filePath} is not a valid PNG file.`);
    }
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } finally {
    fs.closeSync(descriptor);
  }
}

function markdownReferences() {
  const markdownFiles = [
    path.join(guideRoot, 'introduction', 'introduction.md'),
    ...fs.readdirSync(guideRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^scene-\d+-/.test(entry.name))
      .sort((a, b) => Number(a.name.match(/^scene-(\d+)/)[1]) - Number(b.name.match(/^scene-(\d+)/)[1]))
      .flatMap((entry) => walk(path.join(guideRoot, entry.name), (file) => file.endsWith('.md'))),
  ];

  const references = [];
  for (const markdownFile of markdownFiles) {
    const content = fs.readFileSync(markdownFile, 'utf8');
    for (const match of content.matchAll(/!\[([^\]]+)\]\(([^)]+\.png)\)/gi)) {
      const absoluteImage = path.resolve(path.dirname(markdownFile), match[2]);
      references.push({
        file: posixPath(path.relative(guideRoot, absoluteImage)),
        alt: match[1].trim(),
        markdown: posixPath(path.relative(guideRoot, markdownFile)),
      });
    }
  }
  return references;
}

function validatePlanAgainstMarkdown() {
  const references = markdownReferences();
  const expectedFiles = CAPTURES.map((entry) => entry.file).sort();
  const referencedFiles = references.map((entry) => entry.file).sort();
  if (references.length !== 52) {
    throw new Error(`Expected exactly 52 Markdown screenshot references; found ${references.length}.`);
  }
  if (new Set(referencedFiles).size !== referencedFiles.length) {
    throw new Error('Every selected guide screenshot must be referenced exactly once in Markdown.');
  }
  if (JSON.stringify(referencedFiles) !== JSON.stringify(expectedFiles)) {
    const missing = expectedFiles.filter((file) => !referencedFiles.includes(file));
    const unexpected = referencedFiles.filter((file) => !expectedFiles.includes(file));
    throw new Error(`Capture plan and Markdown differ. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}.`);
  }

  const altByFile = new Map(references.map((entry) => [entry.file, entry.alt]));
  for (const entry of CAPTURES) {
    const markdownAlt = altByFile.get(entry.file);
    if (markdownAlt !== entry.alt) {
      throw new Error(`${entry.file} alt text differs between capture plan and Markdown. Plan: ${entry.alt}. Markdown: ${markdownAlt}.`);
    }
  }
}

function validateAudit() {
  if (!fs.existsSync(auditPath)) throw new Error(`Missing live capture audit: ${auditPath}`);
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  if (audit.status !== 'passed') throw new Error(`Live capture audit is not passing: ${audit.status || 'unknown'}`);
  if (audit.capturedCount !== 52 || audit.expectedCaptures !== 52) {
    throw new Error(`Live capture audit must report 52/52 captures; found ${audit.capturedCount}/${audit.expectedCaptures}.`);
  }
  for (const key of ['unexpectedApiErrors', 'unexpectedConsoleErrors', 'pageErrors', 'requestFailures', 'missingCaptures']) {
    if (!Array.isArray(audit[key]) || audit[key].length) {
      throw new Error(`Live capture audit field ${key} must be an empty array.`);
    }
  }
  if (!Array.isArray(audit.scenes) || audit.scenes.length !== 11) {
    throw new Error(`Live capture audit must contain 11 scene groups; found ${audit.scenes?.length || 0}.`);
  }
  return audit;
}

function validateCaptureFiles() {
  const expectedFiles = CAPTURES.map((entry) => entry.file).sort();
  const selectedFiles = walk(selectedRoot, (file) => file.endsWith('.png'))
    .map((file) => posixPath(path.relative(selectedRoot, file)))
    .sort();
  const rawFiles = walk(rawRoot, (file) => file.endsWith('.png'))
    .map((file) => posixPath(path.relative(rawRoot, file)))
    .sort();

  if (JSON.stringify(selectedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`Selected capture directory does not match the 52-image plan (${selectedFiles.length} files found).`);
  }
  if (JSON.stringify(rawFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`Raw capture directory does not match the 52-image plan (${rawFiles.length} files found).`);
  }

  for (const entry of CAPTURES) {
    const selectedFile = path.join(selectedRoot, entry.file);
    const rawFile = path.join(rawRoot, entry.file);
    for (const filePath of [selectedFile, rawFile]) {
      const dimensions = pngDimensions(filePath);
      if (dimensions.width !== VIEWPORT.width || dimensions.height !== VIEWPORT.height) {
        throw new Error(`${filePath} is ${dimensions.width}x${dimensions.height}; expected ${VIEWPORT.width}x${VIEWPORT.height}.`);
      }
    }
  }
}

function copySelectedGuideImages() {
  for (const entry of CAPTURES) {
    const source = path.join(selectedRoot, entry.file);
    const destination = path.join(guideRoot, entry.file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    if (sha256(source) !== sha256(destination)) {
      throw new Error(`Guide image checksum mismatch after copy: ${entry.file}`);
    }
  }
}

function writeInventory(audit) {
  const screenshots = CAPTURES.map((entry) => {
    const selectedFile = path.join(selectedRoot, entry.file);
    return {
      file: `${captureFolder}/selected/${entry.file}`,
      view: entry.view,
      caption: entry.caption,
      alt: entry.alt,
      note: entry.note,
      sha256: sha256(selectedFile),
    };
  });

  const inventory = {
    generatedAt: CAPTURE_DATE,
    sourceApp,
    captureBaseUrl: audit.baseUrl,
    viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
    count: screenshots.length,
    screenshots,
  };
  fs.mkdirSync(screenshotRoot, { recursive: true });
  fs.writeFileSync(path.join(screenshotRoot, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);

  const markdown = [
    '# SLED Runbook Screenshot Inventory',
    '',
    `- **Captured:** ${inventory.generatedAt}`,
    `- **Source app:** ${inventory.sourceApp}`,
    `- **Capture URL:** ${inventory.captureBaseUrl}`,
    `- **Viewport:** ${inventory.viewport}`,
    `- **Selected screenshots:** ${inventory.count}`,
    '',
    '| File | View | Caption / alt text | SHA-256 | Note |',
    '| --- | --- | --- | --- | --- |',
    ...screenshots.map((item) => (
      `| \`${item.file}\` | ${item.view.replaceAll('|', '\\|')} | ${item.alt.replaceAll('|', '\\|')} | \`${item.sha256}\` | ${item.note.replaceAll('|', '\\|')} |`
    )),
    '',
  ];
  fs.writeFileSync(path.join(screenshotRoot, 'inventory.md'), markdown.join('\n'));
  return inventory;
}

function main() {
  validatePlanAgainstMarkdown();
  if (process.argv.includes('--check-plan')) {
    process.stdout.write('SLED SCREENSHOT PLAN GREEN: 52 capture entries match 52 Markdown image references.\n');
    return;
  }
  const audit = validateAudit();
  validateCaptureFiles();
  copySelectedGuideImages();
  const inventory = writeInventory(audit);
  process.stdout.write(`SLED SCREENSHOT INVENTORY GREEN: ${inventory.count} guide images copied and inventoried.\n`);
}

try {
  main();
} catch (error) {
  console.error('SLED screenshot inventory generation failed:');
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
