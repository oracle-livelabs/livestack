const fs = require('node:fs/promises');
const path = require('node:path');

const directory = process.env.DEMO_SETUP_CONTROL_DIR || path.resolve(__dirname, '../../.demo-setup');
const unavailable = () => ({ status: 'unavailable', message: 'Demo setup status is unavailable. The host setup service must be running.', steps: [] });

async function getDemoSetupStatus() {
  try {
    const status = JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8'));
    const age = Date.now() - Date.parse(status.updatedAt);
    if (!Number.isFinite(age) || age > 30000 || age < -5000
        || !['ready', 'running', 'failed', 'incomplete', 'unavailable'].includes(status.status)) return unavailable();
    try {
      await fs.access(path.join(directory, 'retry.request'));
      if (status.status !== 'unavailable') return { ...status, status: 'running', message: 'Retry requested. Waiting for demo setup to resume…' };
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
    return status;
  } catch { return unavailable(); }
}

async function retryDemoSetup() {
  const status = await getDemoSetupStatus();
  if (status.status === 'unavailable') throw new Error(status.message);
  if (['running', 'ready'].includes(status.status)) return status;
  // Exclusive creation deduplicates simultaneous clicks, including across workers.
  try {
    await fs.writeFile(path.join(directory, 'retry.request'), '', { flag: 'wx', mode: 0o644 });
  } catch (err) { if (err.code !== 'EEXIST') throw err; }
  return { ...status, status: 'running', message: 'Retry requested. Waiting for demo setup to resume…' };
}

module.exports = { getDemoSetupStatus, retryDemoSetup };
