require('dotenv').config();

const db = require('../backend/config/database');
const {
  buildDemoDateValidationChecks,
  runDemoDateValidation,
  summarizeDemoDateValidation,
} = require('../backend/lib/demoDateValidation');

function printFailures(failures) {
  for (const failure of failures) {
    console.error(`- ${failure.id} [${failure.screen}] ${failure.table}${failure.column ? `.${failure.column}` : ''}`);
    console.error(`  expected: ${failure.expected}`);
    console.error(`  actual: ${failure.actual == null ? 'n/a' : failure.actual}`);
    console.error(`  query: ${failure.query}`);
    if (failure.reason) {
      console.error(`  reason: ${failure.reason}`);
    }
  }
}

async function main() {
  const json = process.argv.includes('--json');
  const checks = buildDemoDateValidationChecks();
  const requiredScreens = [
    'Operations Command Center',
    'Quality & Capacity Signals',
    'Care Pathway Graph',
    'Care Logistics Map',
    'Care Service Requests',
    'Risk and Capacity Analytics',
    'Ask Healthcare Data',
    'Healthcare AI Agent Console',
  ];

  for (const screen of requiredScreens) {
    if (!checks.some((check) => check.screen === screen)) {
      throw new Error(`Demo date validation does not cover ${screen}.`);
    }
  }

  let connection;
  try {
    connection = await db.getConnection();
    const validation = await runDemoDateValidation(connection);
    const summary = summarizeDemoDateValidation(validation);

    if (json) {
      console.log(JSON.stringify(summary, null, 2));
    } else if (validation.passed) {
      console.log(
        `Demo date window validation passed: ${summary.passedCount}/${summary.checkCount} checks passed, ` +
        `${summary.skippedCount} optional checks skipped.`
      );
    } else {
      console.error(
        `Demo date window validation failed: ${summary.failedCount}/${summary.checkCount} checks failed.`
      );
      printFailures(summary.failures);
    }

    if (!validation.passed) {
      process.exitCode = 1;
    }
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
    await db.closePool();
  }
}

main().catch(async (err) => {
  console.error(`Demo date window validation could not run: ${err.message}`);
  try { await db.closePool(); } catch (_) {}
  process.exitCode = 1;
});
