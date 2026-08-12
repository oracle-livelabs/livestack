#!/usr/bin/env node
/*
 * Wave 2 parity and clean-package inventory contract for HC4-04.
 *
 * This is intentionally a parity gate, not a claim that the comparator union
 * is credential-clean. Manufacturing and accepted High Tech both retain the
 * same OCI PAR pattern in their runtime source. The frozen Healthcare Compose
 * occurrence is therefore a shared, non-blocking hardening advisory. No
 * Healthcare-only occurrence may remain outside that immutable file.
 *
 * The clean-package inventory must contain both `.env` and `.env.example`.
 * This contract proves their presence but never opens `.env`, never prints
 * configuration values, and does not create an archive.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const expectedComposeSha = 'ab792ab1c08ef0c87be5a97df3e53733d9baf08c57eb0ea808143ec4c016bf8e';
const parPattern = /https?:\/\/[^\s"'<>]+\/p\/[A-Za-z0-9_-]{16,}\/n\/[^\s"'<>]+/gi;

const checks = [];
async function check(id, requirement, test) {
  try {
    await test();
    checks.push({ id, requirement, status: 'PASS' });
  } catch (error) {
    checks.push({ id, requirement, status: 'RED', observed: error.message });
  }
}

function normalize(relativePath) {
  return String(relativePath).split(path.sep).join('/').replace(/^\.\//, '');
}

function isExcluded(relativePath, isDirectory = false) {
  const normalized = normalize(relativePath);
  const parts = normalized.split('/');
  const base = parts.at(-1);
  if (parts.some((part) => (
    part === '.git'
    || part === '.data'
    || part === '.playwright-cli'
    || part === 'node_modules'
    || part === '__MACOSX'
  ))) return true;
  if (normalized === 'frontend/dist' || normalized.startsWith('frontend/dist/')) return true;
  if (normalized === 'frontend/public/jet' || normalized.startsWith('frontend/public/jet/')) return true;
  if (base === '.DS_Store' || base.startsWith('._')) return true;
  if (!isDirectory && base.startsWith('.env') && base !== '.env' && base !== '.env.example') return true;
  if (!isDirectory && (base.endsWith('.zip') || base.endsWith('.log'))) return true;
  return false;
}

function candidateInventory() {
  const files = [];
  function walk(absoluteDirectory, relativeDirectory = '') {
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const relativePath = normalize(path.join(relativeDirectory, entry.name));
      if (isExcluded(relativePath, entry.isDirectory())) continue;
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) walk(absolutePath, relativePath);
      else if (entry.isFile()) files.push(relativePath);
    }
  }
  walk(root);
  return files.sort();
}

function credentialFindings(inventory) {
  const findings = [];
  for (const relativePath of inventory) {
    const buffer = fs.readFileSync(path.join(root, relativePath));
    if (buffer.includes(0)) continue;
    const source = buffer.toString('utf8');
    const matches = source.match(parPattern) || [];
    if (matches.length > 0) findings.push({ path: relativePath, count: matches.length });
  }
  return findings;
}

function sha256(relativePath) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(root, relativePath)))
    .digest('hex');
}

async function main() {
  const inventory = candidateInventory();
  const scannableInventory = inventory.filter((relativePath) => path.basename(relativePath) !== '.env');
  const findings = credentialFindings(scannableInventory);
  const envLike = inventory.filter((relativePath) => path.basename(relativePath).startsWith('.env'));

  await check('HC-CRED-01', 'Clean-package selection includes exactly .env and .env.example while the contract never opens .env.', () => {
    assert.equal(isExcluded('.env'), false);
    assert.equal(isExcluded('.env.example'), false);
    assert.equal(isExcluded('.env.local'), true);
    assert.equal(isExcluded('nested/.env.production'), true);
    assert.deepEqual(envLike, ['.env', '.env.example']);
    assert.ok(inventory.includes('.env'));
    assert.ok(!scannableInventory.includes('.env'));
  });

  await check('HC-CRED-02', 'The inert .env.example remains in the distributable source inventory.', () => {
    assert.ok(inventory.includes('.env.example'));
  });

  await check('HC-CRED-03', 'Source-control and container-build guards remain independent of the explicit clean-ZIP include list.', () => {
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
    assert.match(gitignore, /^\.env$/m);
    assert.match(gitignore, /^\.env\.\*$/m);
    assert.match(gitignore, /^!\.env\.example$/m);
    assert.match(dockerignore, /^\.env$/m);
    assert.match(dockerignore, /^\.env\.\*$/m);
    assert.match(dockerignore, /^!\.env\.example$/m);
  });

  await check('HC-CRED-04', 'Credential scanning covers every non-.env file in the complete clean-package candidate inventory.', () => {
    assert.ok(scannableInventory.length > 100, `unexpectedly narrow inventory (${scannableInventory.length} files)`);
    assert.equal(scannableInventory.length, inventory.length - 1);
    assert.ok(scannableInventory.includes('compose.yml'));
    assert.ok(scannableInventory.includes('scripts/bootstrap_db.sh'));
    assert.ok(scannableInventory.includes('db/schema/04_vector.sql'));
    assert.ok(scannableInventory.includes('.env.example'));
  });

  await check('HC-CRED-05', 'No Healthcare-only credential-shaped OCI PAR remains outside the immutable Compose surface shared by both comparators.', () => {
    assert.deepEqual(
      findings.filter(({ path: findingPath }) => findingPath !== 'compose.yml'),
      [],
      `Healthcare-only credential-shaped PAR material remains in: ${findings
        .filter(({ path: findingPath }) => findingPath !== 'compose.yml')
        .map(({ path: findingPath }) => findingPath)
        .join(', ')}`,
    );
  });

  await check('HC-CRED-06', 'The sole shared advisory is the byte-exact frozen compose.yml invariant.', () => {
    assert.deepEqual(findings.map(({ path: findingPath }) => findingPath), ['compose.yml']);
    assert.equal(sha256('compose.yml'), expectedComposeSha);
  });

  const passed = checks.filter(({ status }) => status === 'PASS').length;
  const failed = checks.length - passed;
  for (const entry of checks) {
    process.stdout.write(`${entry.status.padEnd(4)} ${entry.id} — ${entry.requirement}`);
    if (entry.observed) process.stdout.write(`\n     ${entry.observed}`);
    process.stdout.write('\n');
  }
  process.stdout.write(
    `Candidate inventory: ${inventory.length} files including .env and .env.example; .env content not opened; scanned credential finding paths: ${findings.map(({ path: findingPath }) => findingPath).join(', ') || 'none'}.\n`,
  );
  process.stdout.write(
    'ADVISORY (non-blocking): frozen compose.yml retains the same credential-shaped OCI PAR pattern present in Manufacturing and accepted High Tech.\n',
  );
  process.stdout.write(`\nHealthcare parity/package contract: ${passed}/${checks.length} PASS, ${failed} RED\n`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
