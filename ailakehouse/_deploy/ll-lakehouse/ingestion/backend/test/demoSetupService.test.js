const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('setup status and retries are bounded by host readiness and deduplicated', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'demo-setup-'));
  process.env.DEMO_SETUP_CONTROL_DIR = directory;
  const { getDemoSetupStatus, retryDemoSetup } = require('../lib/demoSetupService');
  const statusFile = path.join(directory, 'status.json');
  const requestFile = path.join(directory, 'retry.request');
  const status = (state, time = Date.now()) => fs.writeFile(statusFile, JSON.stringify({ status: state, updatedAt: new Date(time).toISOString(), steps: [] }));
  try {
    assert.equal((await getDemoSetupStatus()).status, 'unavailable');
    await assert.rejects(retryDemoSetup);
    await status('ready');
    assert.equal((await retryDemoSetup()).status, 'ready');
    await assert.rejects(fs.access(requestFile));
    await status('running');
    assert.equal((await retryDemoSetup()).status, 'running');
    await assert.rejects(fs.access(requestFile));
    await status('failed');
    const requests = await Promise.all(Array.from({ length: 10 }, () => retryDemoSetup()));
    assert.ok(requests.every(item => item.status === 'running'));
    assert.equal(await fs.readFile(requestFile, 'utf8'), '');
    assert.equal((await getDemoSetupStatus()).status, 'running');
    await fs.unlink(requestFile);
    await status('ready', Date.now() - 60000);
    assert.equal((await getDemoSetupStatus()).status, 'unavailable');
    await assert.rejects(retryDemoSetup);
    await fs.writeFile(statusFile, 'broken');
    assert.equal((await getDemoSetupStatus()).status, 'unavailable');
  } finally {
    delete process.env.DEMO_SETUP_CONTROL_DIR;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
