/**
 * Healthcare Demo — Express Server
 * Serves API routes and the React frontend in production
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const db = require('./config/database');
const { reconcileDatasetLifecycleOnStartup } = require('./lib/importWorkflowService');
const { createDatasetServingFence } = require('./lib/datasetServingFence');
const {
  createDemoSessionService,
  normalizeActor,
  sameOriginDemoControl,
} = require('./lib/demoSession');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('etag', false);

function setNoStoreHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

// ── Middleware ──────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// ── Authenticated actor boundary (VPD) ─────────────────────
// The mounted UI uses a same-origin, HttpOnly signed demo session. Separately
// provisioned bearer mappings remain available to non-browser verification.
// X-Demo-User is only a consistency signal and is never database authority.
function actorTokens() {
  try {
    const parsed = JSON.parse(process.env.DEMO_ACTOR_TOKENS || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function resolveBearerActor(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  if (!match) return null;
  const actor = actorTokens()[match[1]];
  return normalizeActor(actor);
}

const demoSessions = createDemoSessionService();

function requestUsesSecureCookie(req) {
  if (req.secure) return true;
  try {
    return new URL(String(req.headers.origin || '')).protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function requireSameOriginDemoControl(req, res, next) {
  if (!sameOriginDemoControl(req)) {
    return res.status(403).json({
      error: 'A same-origin Healthcare demo-control request is required.',
      code: 'DEMO_CONTROL_FORBIDDEN',
    });
  }
  return next();
}

function resolveAuthenticatedActor(req) {
  const hasAuthorization = Object.prototype.hasOwnProperty.call(req.headers, 'authorization');
  if (hasAuthorization) {
    const actor = resolveBearerActor(req);
    return actor
      ? { ok: true, actor, source: 'bearer' }
      : { ok: false, reason: 'invalid_bearer', source: 'bearer' };
  }
  return { ...demoSessions.readRequest(req), source: 'session' };
}

// Avoid stale API responses and conditional 304 paths for live dashboard/count data.
app.use('/api', (req, res, next) => {
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  setNoStoreHeaders(res);
  next();
});

// The public directory supplies only active actor names. Session creation is
// an isolated-demo control: the server validates the actor, signs the session,
// and exposes no token map or signing secret to browser code.
app.post('/api/demo-session', requireSameOriginDemoControl, async (req, res) => {
  const requestedActor = normalizeActor(req.body?.actor);
  const secure = requestUsesSecureCookie(req);
  if (!requestedActor) {
    res.setHeader('Set-Cookie', demoSessions.clearCookie({ secure }));
    return res.status(403).json({
      error: 'The requested demo actor is not recognized.',
      code: 'DEMO_ACTOR_FORBIDDEN',
    });
  }

  try {
    const activeActor = await db.resolveActiveActor(requestedActor);
    if (!activeActor) {
      res.setHeader('Set-Cookie', demoSessions.clearCookie({ secure }));
      return res.status(403).json({
        error: 'The requested demo actor is not recognized.',
        code: 'DEMO_ACTOR_FORBIDDEN',
      });
    }
    const issued = demoSessions.issue(activeActor);
    res.setHeader('Set-Cookie', demoSessions.serializeCookie(issued.token, { secure }));
    return res.status(201).json({
      ok: true,
      actor: issued.actor,
      expiresAt: new Date(issued.expiresAt).toISOString(),
    });
  } catch (error) {
    console.error('Healthcare demo-session issue error:', error);
    res.setHeader('Set-Cookie', demoSessions.clearCookie({ secure }));
    return res.status(503).json({
      error: 'The governed demo identity service is unavailable.',
      code: 'DEMO_IDENTITY_UNAVAILABLE',
    });
  }
});

app.delete('/api/demo-session', requireSameOriginDemoControl, (req, res) => {
  res.setHeader('Set-Cookie', demoSessions.clearCookie({ secure: requestUsesSecureCookie(req) }));
  return res.json({ ok: true });
});

const publicApiPaths = new Set(['/health', '/users']);
app.use('/api', async (req, res, next) => {
  if (publicApiPaths.has(req.path)) return next();
  const credential = resolveAuthenticatedActor(req);
  if (!credential.ok) {
    if (credential.source === 'session' && credential.reason !== 'missing') {
      res.setHeader('Set-Cookie', demoSessions.clearCookie({ secure: requestUsesSecureCookie(req) }));
    }
    return res.status(401).json({
      error: 'Authentication is required for governed API routes.',
      code: 'DEMO_SESSION_REQUIRED',
    });
  }

  let actor = credential.actor;
  const displayedActor = normalizeActor(req.headers['x-demo-user']);
  if (Object.prototype.hasOwnProperty.call(req.headers, 'x-demo-user')
      && displayedActor !== actor) {
    return res.status(403).json({
      error: 'The displayed demo user does not match the authenticated actor.',
      code: 'DEMO_ACTOR_MISMATCH',
    });
  }

  let activeActor;
  try {
    activeActor = await db.resolveActiveActor(actor);
  } catch (error) {
    console.error('Healthcare governed actor validation error:', error);
    return res.status(503).json({
      error: 'The governed demo identity service is unavailable.',
      code: 'DEMO_IDENTITY_UNAVAILABLE',
    });
  }
  if (!activeActor) {
    if (credential.source === 'session') {
      res.setHeader('Set-Cookie', demoSessions.clearCookie({ secure: requestUsesSecureCookie(req) }));
    }
    return res.status(403).json({
      error: 'The authenticated actor is not authorized for governed data.',
      code: 'DEMO_ACTOR_FORBIDDEN',
    });
  }
  actor = activeActor;
  req.authenticatedActor = actor;
  req.demoUser = actor;
  return db.runAsActor(actor, next);
});

// Shared base tables are updated in place during a journaled generation
// transition. Governed data routes must not observe that partial interval.
// Health, demo-session/identity, and exact import job polling remain available.
app.use('/api', createDatasetServingFence());

// ── API Routes ─────────────────────────────────────────────
const dashboardRoutes = require('./routes/dashboard');
const socialRoutes = require('./routes/social');
const productsRoutes = require('./routes/products');
const fulfillmentRoutes = require('./routes/fulfillment');
const graphRoutes = require('./routes/graph');
const agentRoutes = require('./routes/agents');
const ordersRoutes = require('./routes/orders');
const mlRoutes = require('./routes/ml');
const demoRoutes = require('./routes/demo');
const usersRoutes = require('./routes/users');
const selectaiRoutes = require('./routes/selectai');
const importRoutes = require('./routes/import');

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/fulfillment', fulfillmentRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/service-requests', ordersRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/selectai', selectaiRoutes);
app.use('/api/import', importRoutes);

// ── Health Check ───────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.healthCheck();
    res.json({
      status: 'healthy',
      database: result.rows[0],
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message
    });
  }
});

// Return a clear JSON response for unknown API routes before the frontend catch-all.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// ── Serve Frontend (Production) ────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist'), {
    etag: false,
    lastModified: false,
    setHeaders: setNoStoreHeaders,
  }));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      setNoStoreHeaders(res);
      res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    }
  });
}

// ── Error Handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err?.code === 'AUTHENTICATED_ACTOR_REQUIRED' || /ORA-20001/.test(String(err?.message || ''))) {
    return res.status(403).json({ error: 'The authenticated actor is not authorized for governed data.' });
  }
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ── Start Server ───────────────────────────────────────────
async function start() {
  try {
    await db.initialize();
    console.log('Database connection pool ready');
    // Every lease/job/generation crash state is reconciled before listen().
    // If prior-base replay or any required feature rebuild cannot converge,
    // this throws and the server never becomes ready.
    const recovery = await reconcileDatasetLifecycleOnStartup();
    if (recovery.reconciled) {
      console.warn(`Reconciled ${recovery.reconciled} interrupted dataset lifecycle state(s) before readiness.`);
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  Healthcare Demo API`);
      console.log(`  ─────────────────────────`);
      console.log(`  Local:   http://localhost:${PORT}`);
      console.log(`  Health:  http://localhost:${PORT}/api/health`);
      console.log(`  Env:     ${process.env.NODE_ENV || 'development'}\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await db.closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, shutting down...');
  await db.closePool();
  process.exit(0);
});

start();

module.exports = app;
