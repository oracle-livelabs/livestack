const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { IMPORT_VERSION, TABLES, buildManifest } = require('./importCatalog');

const DEMO_DATASET_DIR = path.join(__dirname, '../../verification/demo-dataset');

let cachedArchive = null;

function getDatasetFiles() {
  return TABLES.map((table) => {
    const folder = table.required ? 'required' : 'optional';
    return {
      table,
      archivePath: `${folder}/${table.name}.csv`,
      filePath: path.join(DEMO_DATASET_DIR, folder, `${table.name}.csv`),
    };
  });
}

function assertFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Bundled demo dataset file is missing: ${filePath}`);
  }
}

function getDatasetSignature() {
  return getDatasetFiles()
    .map(({ filePath, archivePath }) => {
      assertFileExists(filePath);
      const stat = fs.statSync(filePath);
      return `${archivePath}:${stat.size}:${stat.mtimeMs}`;
    })
    .join('|');
}

function buildReadme() {
  return [
    '# Bundled Hospitality Performance Demo Dataset',
    '',
    'This archive restores the canonical seeded demo dataset for the application.',
    'It is owned by the application and is used for validate-preview and restore-demo flows.',
    '',
  ].join('\n');
}

function createArchive(signature = getDatasetSignature()) {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(`${JSON.stringify(buildManifest(), null, 2)}\n`, 'utf8'));
  zip.addFile('README.md', Buffer.from(buildReadme(), 'utf8'));

  for (const { archivePath, filePath } of getDatasetFiles()) {
    assertFileExists(filePath);
    zip.addFile(archivePath, fs.readFileSync(filePath));
  }

  return {
    version: IMPORT_VERSION,
    fileName: `hospitality-demo-dataset-${IMPORT_VERSION}.zip`,
    buffer: zip.toBuffer(),
    signature,
  };
}

function getBundledDemoArchive() {
  const signature = getDatasetSignature();
  if (!cachedArchive || cachedArchive.signature !== signature) {
    cachedArchive = createArchive(signature);
  }
  return cachedArchive;
}

module.exports = {
  DEMO_DATASET_DIR,
  getDatasetSignature,
  getBundledDemoArchive,
};
