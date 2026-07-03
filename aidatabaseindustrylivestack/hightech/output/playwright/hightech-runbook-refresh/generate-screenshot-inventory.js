const fs = require('fs');
const path = require('path');

const guideRoot = path.resolve(__dirname, '../../..');
const screenshotRoot = path.join(guideRoot, 'output/guide-screenshots');
const selectedRoot = path.join(screenshotRoot, 'capture-2026-07-02/selected');

function walk(directory, predicate) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath, predicate);
    return predicate(fullPath) ? [fullPath] : [];
  });
}

function titleFromFilename(filename) {
  return path.basename(filename, path.extname(filename))
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const references = new Map();
const markdownFiles = fs.readdirSync(guideRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'output')
  .flatMap((entry) => walk(path.join(guideRoot, entry.name), (file) => file.endsWith('.md')));

for (const markdownFile of markdownFiles) {
  const lines = fs.readFileSync(markdownFile, 'utf8').split(/\r?\n/);
  let scene = '';
  let section = '';
  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      if (heading[1].length === 1) scene = heading[2].trim();
      else section = heading[2].trim();
    }
    for (const image of line.matchAll(/!\[([^\]]*)\]\(([^)]+\.png)\)/g)) {
      const resolved = path.resolve(path.dirname(markdownFile), image[2]);
      const guideRelative = path.relative(guideRoot, resolved).split(path.sep).join('/');
      if (!references.has(guideRelative)) {
        references.set(guideRelative, {
          alt: image[1].trim(),
          view: section ? `${scene} — ${section}` : scene,
        });
      }
    }
  }
}

const selectedFiles = walk(selectedRoot, (file) => file.endsWith('.png'))
  .map((file) => path.relative(selectedRoot, file).split(path.sep).join('/'))
  .sort();

const screenshots = selectedFiles.map((relativeFile) => {
  const reference = references.get(relativeFile);
  const alt = reference?.alt || titleFromFilename(relativeFile);
  return {
    file: `capture-2026-07-02/selected/${relativeFile}`,
    view: reference?.view || relativeFile.split('/')[0],
    caption: alt,
    alt,
    note: 'Selected 1280×1066 live-app capture. Red boxes and numbered badges are deterministic DOM overlays used only where the instruction emphasizes a specific control, value, or result.',
  };
});

const missingReferences = selectedFiles.filter((file) => !references.has(file));
if (missingReferences.length) {
  throw new Error(`Selected screenshots without Markdown references: ${missingReferences.join(', ')}`);
}

const inventory = {
  generatedAt: '2026-07-02',
  sourceApp: 'http://158.101.222.154:8505/',
  viewport: '1280×1066',
  count: screenshots.length,
  screenshots,
};

fs.writeFileSync(path.join(screenshotRoot, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);

const markdown = [
  '# High-Tech Runbook Screenshot Inventory',
  '',
  `- **Captured:** ${inventory.generatedAt}`,
  `- **Source app:** ${inventory.sourceApp}`,
  `- **Viewport:** ${inventory.viewport}`,
  `- **Selected screenshots:** ${inventory.count}`,
  '',
  '| File | View | Caption / alt text | Note |',
  '| --- | --- | --- | --- |',
  ...screenshots.map((item) => `| \`${item.file}\` | ${item.view.replaceAll('|', '\\|')} | ${item.alt.replaceAll('|', '\\|')} | ${item.note.replaceAll('|', '\\|')} |`),
  '',
];

fs.writeFileSync(path.join(screenshotRoot, 'inventory.md'), markdown.join('\n'));
console.log(`Wrote screenshot inventory for ${screenshots.length} selected images.`);
