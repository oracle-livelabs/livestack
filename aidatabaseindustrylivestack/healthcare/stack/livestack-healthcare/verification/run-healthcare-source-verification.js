#!/usr/bin/env node
/*
 * Authoritative dependency-complete Healthcare source gate.
 *
 * Runtime-only checks (Oracle date windows, browser contrast, and browser
 * focus/semantics) remain separate because this entrypoint does not start the
 * stack. Everything here is local source/unit/build verification.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const failures = [];

function run(label, command, args) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      ASKDATA_LIVE_BASE_URL: '',
      ASKDATA_PIPELINE_BASE_URL: '',
      ASKDATA_PROMPT_BASE_URL: '',
    },
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    failures.push({
      label,
      detail: result.error?.message || `exit ${result.status ?? 'unknown'}`,
    });
  }
}

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return javascriptFiles(absolute);
      return entry.isFile() && entry.name.endsWith('.js') ? [absolute] : [];
    });
}

run('Frontend production build', npm, ['run', 'build']);

for (const file of javascriptFiles(path.join(root, 'backend'))) {
  run(`Syntax ${path.relative(root, file)}`, process.execPath, ['--check', file]);
}

const contracts = [
  'check-import-contract.js',
  'check-askdata-schema-metadata.js',
  'check-askdata-suggested-prompts.js',
  'check-askdata-pipeline.js',
  'check-brand-colors.js',
  'check-demo-date-reanchor.js',
  'check-healthcare-demo-session-contract.js',
  'check-healthcare-admin-package-contract.js',
  'check-healthcare-demo-route-contract.js',
  'check-healthcare-credential-surface-contract.js',
  'check-healthcare-durable-restore-recovery-contract.js',
  'check-healthcare-atomic-generation-lifecycle-contract.js',
  'check-healthcare-vpd-feature-lifecycle-hc4-contract.js',
  'check-healthcare-dataset-serving-fence-unit.js',
  'check-healthcare-feature-red-baseline-contract.js',
  'check-healthcare-feature-truth-contract.js',
  'check-healthcare-oml-lifecycle-contract.js',
  'check-healthcare-ui-integration-contract.js',
  'check-healthcare-comparator-runtime-ui-parity-contract.js',
];

for (const contract of contracts) {
  run(contract, process.execPath, [path.join(root, 'verification', contract)]);
}

if (failures.length) {
  process.stderr.write('\nHealthcare source verification failed:\n');
  for (const failure of failures) {
    process.stderr.write(`- ${failure.label}: ${failure.detail}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write('\nHealthcare source verification passed.\n');
}
