const test = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const { assertZipEntrySizes } = require('../lib/zipLimits');
const { _private } = require('../lib/importWorkflowService');

test('dataset importer rejects a tiny ZIP declaring an oversized expanded entry', () => {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from('{"version":"v1"}'));
  const archive = zip.toBuffer();
  const centralDirectory = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(centralDirectory >= 0);
  archive.writeUInt32LE(200 * 1024 * 1024, centralDirectory + 24);

  assert.throws(() => _private.parseArchiveDataset(archive, 'v1'), /expanded size limit/);
});

test('ZIP size guard rejects aggregate expansion and malformed size metadata', () => {
  const entry = (size) => ({ isDirectory: false, header: { size } });
  const limits = { maxEntryBytes: 10, maxTotalBytes: 15 };
  assert.doesNotThrow(() => assertZipEntrySizes([entry(8), entry(7)], limits));
  assert.throws(() => assertZipEntrySizes([entry(8), entry(8)], limits), /expanded size limit/);
  assert.throws(() => assertZipEntrySizes([entry(Number.MAX_SAFE_INTEGER + 1)], limits), /expanded size limit/);
});
