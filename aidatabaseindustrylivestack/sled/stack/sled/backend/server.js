/**
 * State and Local Government Service Operations Demo - Express Server
 * Serves API routes and the React frontend in production
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const db = require('./config/database');
const {
  RESTRICTED_DEMO_USER,
  runWithRequestIdentity,
} = require('./lib/requestIdentityContext');
const {
  createDemoSessionService,
  normalizeActor,
  sameOriginDemoControl,
} = require('./lib/demoSession');
const { createDatasetServingFence } = require('./lib/datasetServingFence');
const { reconcileDatasetLifecycleOnStartup } = require('./lib/datasetGenerationStore');

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

app.use('/api', (req, res, next) => {
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  setNoStoreHeaders(res);
  next();
});

// ── Signed demo identity boundary (VPD) ────────────────────
// The mounted Colorado demo uses a same-origin HttpOnly session. X-Demo-User
// may describe the selected persona but is never authority for Oracle access.
function actorTokens() {
  try {
    const parsed = JSON.parse(process.env.DEMO_ACTOR_TOKENS || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) { return {}; }
}

function resolveBearerActor(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  return match ? normalizeActor(actorTokens()[match[1]]) : null;
}

const demoSessions = createDemoSessionService();

function requestUsesSecureCookie(req) {
  if (req.secure) return true;
  try { return new URL(String(req.headers.origin || '')).protocol === 'https:'; } catch (_) { return false; }
}

function requireSameOriginDemoControl(req, res, next) {
  if (sameOriginDemoControl(req)) return next();
  return res.status(403).json({
    error: 'A same-origin State and Local Government demo-control request is required.',
    code: 'DEMO_CONTROL_FORBIDDEN',
  });
}

function resolveAuthenticatedActor(req) {
  if (Object.prototype.hasOwnProperty.call(req.headers, 'authorization')) {
    const actor = resolveBearerActor(req);
    return actor ? { ok: true, actor, source: 'bearer' } : { ok: false, reason: 'invalid_bearer', source: 'bearer' };
  }
  return { ...demoSessions.readRequest(req), source: 'session' };
}

app.post('/api/demo-session', requireSameOriginDemoControl, async (req, res) => {
  const requestedActor = normalizeActor(req.body?.actor);
  const secure = requestUsesSecureCookie(req);
  if (!requestedActor) {
    res.setHeader('Set-Cookie', demoSessions.clearCookie({ secure }));
    return res.status(403).json({ error: 'The requested demo actor is not recognized.', code: 'DEMO_ACTOR_FORBIDDEN' });
  }
  try {
    const activeActor = await db.resolveActiveActor(requestedActor);
    if (!activeActor) {
      res.setHeader('Set-Cookie', demoSessions.clearCookie({ secure }));
      return res.status(403).json({ error: 'The requested demo actor is not recognized.', code: 'DEMO_ACTOR_FORBIDDEN' });
    }
    const issued = demoSessions.issue(activeActor);
    res.setHeader('Set-Cookie', demoSessions.serializeCookie(issued.token, { secure }));
    return res.status(201).json({ ok: true, actor: issued.actor, expiresAt: new Date(issued.expiresAt).toISOString() });
  } catch (error) {
    console.error('SLED demo-session issue error:', error);
    res.setHeader('Set-Cookie', demoSessions.clearCookie({ secure }));
    return res.status(503).json({ error: 'The governed demo identity service is unavailable.', code: 'DEMO_IDENTITY_UNAVAILABLE' });
  }
});

app.delete('/api/demo-session', requireSameOriginDemoControl, (req, res) => {
  res.setHeader('Set-Cookie', demoSessions.clearCookie({ secure: requestUsesSecureCookie(req) }));
  return res.json({ ok: true });
});

const publicApiPaths = new Set(['/health']);
app.use('/api', async (req, res, next) => {
  if (publicApiPaths.has(req.path)) return next();
  const credential = resolveAuthenticatedActor(req);
  if (!credential.ok) {
    if (credential.source === 'session' && credential.reason !== 'missing') res.setHeader('Set-Cookie', demoSessions.clearCookie({ secure: requestUsesSecureCookie(req) }));
    return res.status(401).json({ error: 'Authentication is required for governed API routes.', code: 'DEMO_SESSION_REQUIRED' });
  }
  const displayedActor = normalizeActor(req.headers['x-demo-user']);
  if (Object.prototype.hasOwnProperty.call(req.headers, 'x-demo-user') && displayedActor !== credential.actor) {
    return res.status(403).json({ error: 'The displayed demo user does not match the authenticated actor.', code: 'DEMO_ACTOR_MISMATCH' });
  }

  try {
    const identity = await db.resolveDemoIdentity(credential.actor);
    req.demoUser = identity.username;
    req.demoIdentity = identity;
    req.authenticatedActor = identity.username;
    return runWithRequestIdentity(identity, next);
  } catch (error) {
    const oracleCode = String(error?.code || '');
    const oracleMessage = String(error?.message || '');
    if (oracleCode === 'DEMO_IDENTITY_FORBIDDEN'
        || /ORA-20080|ORA-20081|unknown or inactive|invalid state and local application user/i.test(oracleMessage)) {
      return res.status(403).json({
      error: 'The authenticated demo actor is not authorized for governed data.',
      code: 'DEMO_ACTOR_FORBIDDEN',
      });
    }
    console.error('State and Local identity validation error:', error);
    return res.status(503).json({
      error: 'State and Local identity validation is unavailable',
      code: 'DEMO_IDENTITY_UNAVAILABLE',
    });
  }
});

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
const evidenceRoutes = require('./routes/evidence');

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/resident-signals', socialRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/public-services', productsRoutes);
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
app.use('/api/evidence', evidenceRoutes);

// ── Health Check ───────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    // Readiness uses the request's already validated identity. It must never
    // elevate an anonymous/restricted probe or inspect protected row counts.
    const result = await db.execute(`
      SELECT 'connected' AS status,
             SYSDATE AS db_time,
             SYS_CONTEXT('SLED_APP_CTX', 'USERNAME') AS context_username,
             SYS_CONTEXT('SLED_APP_CTX', 'ROLE') AS context_role,
             SYS_CONTEXT('SLED_APP_CTX', 'ACCESS_SCOPE') AS context_scope,
             SYS_CONTEXT('SLED_APP_CTX', 'AUTHENTICATED') AS context_authenticated
      FROM dual
    `);
    const databaseStatus = result.rows?.[0] || {};
    const contextUsername = String(databaseStatus.CONTEXT_USERNAME || '');
    const contextRole = String(databaseStatus.CONTEXT_ROLE || '').toLowerCase();
    const contextScope = String(databaseStatus.CONTEXT_SCOPE || '').toUpperCase();
    const contextAuthenticated = String(databaseStatus.CONTEXT_AUTHENTICATED || '').toUpperCase();
    // Unauthenticated health probes are deliberately restricted and cannot
    // select a privileged persona; governed routes always carry a session.
    const expectedIdentity = req.demoIdentity || await db.resolveDemoIdentity(RESTRICTED_DEMO_USER);

    if (contextUsername !== expectedIdentity.username
        || contextRole !== expectedIdentity.role
        || contextScope !== expectedIdentity.accessScope
        || contextAuthenticated !== 'Y') {
      const readinessError = new Error('Oracle application context readiness check failed');
      readinessError.code = 'DATABASE_CONTEXT_NOT_READY';
      throw readinessError;
    }
    res.json({
      status: 'healthy',
      database: databaseStatus,
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

app.use('/api', (req, res) => {
  setNoStoreHeaders(res);
  res.status(404).json({
    error: 'API route not found',
    path: req.originalUrl,
  });
});

// ── Serve Frontend (Production) ────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => setNoStoreHeaders(res),
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
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ── Start Server ───────────────────────────────────────────
async function start() {
  try {
    await db.initialize();
    const recovery = await reconcileDatasetLifecycleOnStartup();
    if (recovery.reconciled) console.warn(`Reconciled ${recovery.reconciled} interrupted SLED dataset generation(s).`);
    console.log('Database connection pool ready');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  State and Local Government Service Operations Demo API`);
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
