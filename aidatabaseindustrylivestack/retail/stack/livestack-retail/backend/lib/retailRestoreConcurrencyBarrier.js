'use strict';

const BARRIER_HEADER = 'x-retail-test-restore-barrier';
const DEFAULT_TIMEOUT_MS = 15000;
const barriers = new Map();

function boundedTimeout(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(30000, Math.max(1000, parsed));
}

function barrierToken(req) {
  const value = String(req?.headers?.[BARRIER_HEADER] || '').trim();
  if (!value) return null;
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(value)) {
    const error = new Error('Retail Restore overlap barrier token is malformed.');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function settleBarrier(token, state, method, value) {
  if (barriers.get(token) !== state) return;
  barriers.delete(token);
  clearTimeout(state.timer);
  for (const waiter of state.waiters) waiter[method](value);
}

async function waitForRetailRestoreBarrier(
  req,
  {
    env = process.env,
    timeoutMs = env.RETAIL_TEST_RESTORE_BARRIER_TIMEOUT_MS,
  } = {}
) {
  // Production must ignore the test header entirely. Authentication and
  // dataset-command middleware have already run before the route calls this.
  if (env.NODE_ENV !== 'test') {
    return Object.freeze({ enabled: false, ignored: true });
  }
  const token = barrierToken(req);
  if (!token) return Object.freeze({ enabled: false, ignored: false });

  let state = barriers.get(token);
  if (!state) {
    state = {
      participants: 0,
      waiters: [],
      timer: null,
    };
    state.timer = setTimeout(() => {
      const error = new Error(
        'Retail Restore overlap barrier timed out before two requests arrived.'
      );
      error.statusCode = 504;
      settleBarrier(token, state, 'reject', error);
    }, boundedTimeout(timeoutMs));
    state.timer.unref?.();
    barriers.set(token, state);
  }
  state.participants += 1;
  if (state.participants > 2) {
    const error = new Error(
      'Retail Restore overlap barrier accepts exactly two participants.'
    );
    error.statusCode = 409;
    throw error;
  }

  return new Promise((resolve, reject) => {
    state.waiters.push({ resolve, reject });
    if (state.participants === 2) {
      settleBarrier(
        token,
        state,
        'resolve',
        Object.freeze({ enabled: true, token, participants: 2 })
      );
    }
  });
}

function resetRetailRestoreBarriers(reason = 'Retail Restore barrier reset.') {
  for (const [token, state] of barriers) {
    const error = new Error(reason);
    error.statusCode = 503;
    settleBarrier(token, state, 'reject', error);
  }
}

module.exports = {
  BARRIER_HEADER,
  resetRetailRestoreBarriers,
  waitForRetailRestoreBarrier,
};
