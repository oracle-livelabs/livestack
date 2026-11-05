const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const selectAiService = require('../lib/selectAiService');
const selectAiRouter = require('../routes/selectai');

async function withServer(callback) {
  const app = express();
  app.use(express.json());
  app.use('/api/selectai', selectAiRouter);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('Ask Data returns an unavailable response instead of local model output', async () => {
  const original = selectAiService.runSelectAiQuestion;
  selectAiService.runSelectAiQuestion = async () => {
    const error = new Error('Oracle Select AI is unavailable.');
    error.statusCode = 503;
    error.runtime = 'unavailable';
    throw error;
  };
  try {
    await withServer(async baseUrl => {
      const response = await fetch(`${baseUrl}/api/selectai/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'Show revenue by category' }),
      });
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.runtime, 'unavailable');
      assert.match(body.error, /Oracle Select AI is unavailable/);
      assert.equal(body.answer, undefined);
    });
  } finally {
    selectAiService.runSelectAiQuestion = original;
  }
});

test('Ask Data exposes no local profile when OCI profile is unavailable', async () => {
  const original = selectAiService.getAvailableProfiles;
  selectAiService.getAvailableProfiles = async () => ({
    profiles: [], activeProfile: null, runtime: { available: false, runtime: 'unavailable' },
  });
  try {
    await withServer(async baseUrl => {
      const response = await fetch(`${baseUrl}/api/selectai/profiles`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.profiles, []);
      assert.equal(body.activeProfile, null);
      assert.equal(body.runtime.runtime, 'unavailable');
    });
  } finally {
    selectAiService.getAvailableProfiles = original;
  }
});
