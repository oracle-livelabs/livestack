#!/usr/bin/env node
/* Direct no-Oracle unit checks for the production dataset serving fence. */
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  createDatasetServingFence,
  getDatasetServingTransition,
  beginDatasetServingTransition,
  endDatasetServingTransition,
  waitForDatasetReadersToDrain,
} = require('../backend/lib/datasetServingFence');

function responseDouble() {
  const response = new EventEmitter();
  response.headers = {};
  response.statusCode = 200;
  response.body = null;
  response.setHeader = (name, value) => { response.headers[name] = value; };
  response.status = (value) => { response.statusCode = value; return response; };
  response.json = (value) => { response.body = value; return response; };
  return response;
}

async function invoke(middleware, { method = 'GET', path = '/dashboard/summary' } = {}) {
  const req = { method, path };
  const res = responseDouble();
  let nextCalls = 0;
  await middleware(req, res, () => { nextCalls += 1; });
  return { req, res, nextCalls };
}

const checks = [
  ['nonterminal Oracle generation returns retryable 503', async () => {
    const middleware = createDatasetServingFence({
      lookupGeneration: async () => ({ generationId: 'gen-1', jobId: 'job-1', status: 'applying' }),
    });
    const result = await invoke(middleware);
    assert.equal(result.nextCalls, 0);
    assert.equal(result.res.statusCode, 503);
    assert.equal(result.res.body.code, 'DATASET_GENERATION_TRANSITION');
    assert.equal(result.res.body.retryable, true);
    assert.equal(result.res.headers['Retry-After'], '2');
  }],
  ['Oracle fence lookup failure returns fail-closed 503', async () => {
    const middleware = createDatasetServingFence({
      lookupGeneration: async () => { throw new Error('lookup unavailable'); },
    });
    const originalError = console.error;
    console.error = () => {};
    let result;
    try {
      result = await invoke(middleware, { path: '/products' });
    } finally {
      console.error = originalError;
    }
    assert.equal(result.nextCalls, 0);
    assert.equal(result.res.statusCode, 503);
    assert.equal(result.res.body.code, 'DATASET_GENERATION_FENCE_UNAVAILABLE');
  }],
  ['exact job polling bypasses the generation lookup', async () => {
    let lookups = 0;
    const middleware = createDatasetServingFence({
      lookupGeneration: async () => { lookups += 1; throw new Error('must not run'); },
    });
    const result = await invoke(middleware, { path: '/import/status/job-1' });
    assert.equal(result.nextCalls, 1);
    assert.equal(lookups, 0);
  }],
  ['health session and identity endpoints remain available', async () => {
    const middleware = createDatasetServingFence({
      lookupGeneration: async () => { throw new Error('must not run'); },
    });
    for (const path of ['/health', '/demo-session', '/users']) {
      const result = await invoke(middleware, { path });
      assert.equal(result.nextCalls, 1);
    }
  }],
  ['transition release requires the exact owner token', async () => {
    const token = beginDatasetServingTransition({ transitionToken: 'owner-token' });
    assert.equal(endDatasetServingTransition({ transitionToken: 'wrong-token' }), false);
    assert.equal(getDatasetServingTransition().transitionToken, token);
    assert.equal(endDatasetServingTransition({ transitionToken: token }), true);
    assert.equal(getDatasetServingTransition(), null);
  }],
  ['worker reader drain waits for an in-flight governed response', async () => {
    const middleware = createDatasetServingFence({ lookupGeneration: async () => null });
    const result = await invoke(middleware, { path: '/orders/1' });
    assert.equal(result.nextCalls, 1);
    const token = beginDatasetServingTransition({ transitionToken: 'drain-token' });
    let drained = false;
    const drain = waitForDatasetReadersToDrain({ transitionToken: token }).then(() => { drained = true; });
    await Promise.resolve();
    assert.equal(drained, false);
    result.res.emit('finish');
    await drain;
    assert.equal(drained, true);
    assert.equal(endDatasetServingTransition({ transitionToken: token }), true);
  }],
  ['transition beginning during asynchronous lookup still fences the request', async () => {
    let finishLookup;
    const lookup = new Promise((resolve) => { finishLookup = resolve; });
    const middleware = createDatasetServingFence({ lookupGeneration: () => lookup });
    const pending = invoke(middleware, { path: '/ml/summary' });
    await Promise.resolve();
    const token = beginDatasetServingTransition({ transitionToken: 'lookup-race-token' });
    finishLookup(null);
    const result = await pending;
    assert.equal(result.nextCalls, 0);
    assert.equal(result.res.body.code, 'DATASET_GENERATION_TRANSITION');
    assert.equal(endDatasetServingTransition({ transitionToken: token }), true);
  }],
  ['stable governed request is admitted as a tracked reader', async () => {
    const middleware = createDatasetServingFence({ lookupGeneration: async () => null });
    const result = await invoke(middleware, { path: '/dashboard/summary' });
    assert.equal(result.nextCalls, 1);
    assert.equal(result.res.statusCode, 200);
    result.res.emit('close');
  }],
];

(async () => {
  const failures = [];
  for (const [name, check] of checks) {
    try {
      await check();
      process.stdout.write(`PASS ${name}\n`);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
      process.stdout.write(`RED  ${name}\n`);
    }
  }
  process.stdout.write(`\nHealthcare dataset serving fence unit: ${checks.length - failures.length}/${checks.length} PASS, ${failures.length} RED\n`);
  if (failures.length) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
  }
})();
