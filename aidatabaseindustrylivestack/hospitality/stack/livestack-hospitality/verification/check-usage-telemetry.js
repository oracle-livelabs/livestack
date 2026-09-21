const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { recordDatasetRefresh } = require('../backend/lib/usageCounterService');

const projectRoot = path.resolve(__dirname, '..');
const originalEnv = {
  enabled: process.env.DEMO_USAGE_COUNTER_ENABLED,
  parUrl: process.env.DEMO_USAGE_COUNTER_PAR_URL,
  prefix: process.env.DEMO_USAGE_COUNTER_PREFIX,
  demoId: process.env.DEMO_USAGE_COUNTER_DEMO_ID,
  timeout: process.env.DEMO_USAGE_COUNTER_TIMEOUT_MS,
};

function restoreEnvironment() {
  const mapping = {
    DEMO_USAGE_COUNTER_ENABLED: originalEnv.enabled,
    DEMO_USAGE_COUNTER_PAR_URL: originalEnv.parUrl,
    DEMO_USAGE_COUNTER_PREFIX: originalEnv.prefix,
    DEMO_USAGE_COUNTER_DEMO_ID: originalEnv.demoId,
    DEMO_USAGE_COUNTER_TIMEOUT_MS: originalEnv.timeout,
  };

  Object.entries(mapping).forEach(([name, value]) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function main() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(req.url.includes('/reject/') ? 503 : 200);
      res.end();
    });
  });

  try {
    const address = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}/objects`;

    process.env.DEMO_USAGE_COUNTER_ENABLED = 'true';
    process.env.DEMO_USAGE_COUNTER_PAR_URL = baseUrl;
    process.env.DEMO_USAGE_COUNTER_PREFIX = 'hospitality-demo-usage/events';
    process.env.DEMO_USAGE_COUNTER_DEMO_ID = 'hospitality';
    process.env.DEMO_USAGE_COUNTER_TIMEOUT_MS = '1000';

    const result = await recordDatasetRefresh({
      jobId: 'restore-check-1',
      operation: 'restore_demo',
      datasetSource: 'demo',
      activeDataset: { source: 'demo', label: 'Demo Data', version: '1' },
      summary: { inserted: { properties: 12, reservations: 2400 } },
    });

    assert.equal(result.ok, true, 'Object Storage PUT should succeed');
    assert.equal(requests.length, 1, 'one telemetry event should be written');
    assert.equal(requests[0].method, 'PUT');
    assert.equal(requests[0].contentType, 'application/json');
    assert.match(
      requests[0].url,
      /^\/objects\/hospitality-demo-usage\/events\/\d{4}-\d{2}-\d{2}\/[^/]+\.json$/,
      'event object should use the dated hospitality prefix',
    );

    const payload = JSON.parse(requests[0].body);
    assert.equal(payload.demo, 'hospitality');
    assert.equal(payload.event, 'dataset_refresh');
    assert.equal(payload.operation, 'restore_demo');
    assert.equal(payload.datasetSource, 'demo');
    assert.equal(payload.jobId, 'restore-check-1');
    assert.deepEqual(payload.activeDataset, { source: 'demo', label: 'Demo Data', version: '1' });
    assert.deepEqual(payload.summary, { inserted: { properties: 12, reservations: 2400 } });
    assert.ok(payload.timestamp, 'event should include a timestamp');

    process.env.DEMO_USAGE_COUNTER_PAR_URL = `${baseUrl}/reject/`;
    const rejected = await recordDatasetRefresh({ operation: 'restore_demo' });
    assert.equal(rejected.ok, false, 'a rejected PUT should be reported');
    assert.equal(rejected.skipped, true, 'a rejected PUT must remain non-blocking');

    process.env.DEMO_USAGE_COUNTER_ENABLED = 'false';
    const disabled = await recordDatasetRefresh({ operation: 'restore_demo' });
    assert.deepEqual(disabled, { ok: true, skipped: true, reason: 'disabled' });

    const workflowSource = fs.readFileSync(
      path.join(projectRoot, 'backend/lib/importWorkflowService.js'),
      'utf8',
    );
    assert.match(workflowSource, /await recordDatasetRefresh\(\{[\s\S]*?operation: kind,[\s\S]*?datasetSource,[\s\S]*?activeDataset,[\s\S]*?summary: result\.summary,/);

    const composePath = path.join(projectRoot, 'compose.yml');
    if (fs.existsSync(composePath)) {
      const composeSource = fs.readFileSync(composePath, 'utf8');
      assert.match(composeSource, /DEMO_USAGE_COUNTER_PAR_URL:/);
      assert.match(composeSource, /DEMO_USAGE_COUNTER_PREFIX:.*hospitality-demo-usage\/events/);
      assert.match(composeSource, /DEMO_USAGE_COUNTER_DEMO_ID:.*hospitality/);
    }

    console.log('Hospitality Restore Demo Data telemetry verification passed.');
  } finally {
    restoreEnvironment();
    if (server.listening) await close(server);
  }
}

main().catch((err) => {
  restoreEnvironment();
  console.error(err);
  process.exitCode = 1;
});
