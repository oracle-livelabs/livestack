const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const {
  IMPORT_VERSION,
  TABLES,
  getTableCsvFileName,
  getTableAcceptedCsvFileNames,
  buildManifest,
} = require('./importCatalog');

const DEMO_DATASET_DIR = path.join(__dirname, '../../verification/demo-dataset');

let cachedArchive = null;

function assertFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Bundled demo dataset file is missing: ${filePath}`);
  }
}

function resolveDemoDatasetFile(folder, table) {
  for (const fileName of getTableAcceptedCsvFileNames(table)) {
    const filePath = path.join(DEMO_DATASET_DIR, folder, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return path.join(DEMO_DATASET_DIR, folder, getTableCsvFileName(table));
}

function buildReadme() {
  return [
    '# Bundled Utilities Demo Dataset',
    '',
    'This archive restores the canonical seeded demo dataset for the application.',
    'It is owned by the application and is used for validate-preview and restore-demo flows.',
    '',
  ].join('\n');
}

function createArchive() {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(`${JSON.stringify(buildManifest(), null, 2)}\n`, 'utf8'));
  zip.addFile('README.md', Buffer.from(buildReadme(), 'utf8'));

  for (const table of TABLES) {
    const folder = table.required ? 'required' : 'optional';
    const filePath = resolveDemoDatasetFile(folder, table);
    assertFileExists(filePath);
    zip.addFile(`${folder}/${getTableCsvFileName(table)}`, fs.readFileSync(filePath));
  }

  return {
    version: IMPORT_VERSION,
    fileName: `utilities-demo-dataset-${IMPORT_VERSION}.zip`,
    buffer: zip.toBuffer(),
  };
}

function getBundledDemoArchive() {
  if (!cachedArchive) {
    cachedArchive = createArchive();
  }
  return cachedArchive;
}

module.exports = {
  DEMO_DATASET_DIR,
  getBundledDemoArchive,
};
