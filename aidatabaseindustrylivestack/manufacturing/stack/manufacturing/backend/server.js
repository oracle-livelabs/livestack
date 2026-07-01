/**
 * Manufacturing Operations Demo — Express Server
 * Serves API routes and the React frontend in production
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const db = require('./config/database');
const { shouldDeferGlobalJsonParser } = require('./lib/requestPathPolicy');
const {
  RESTRICTED_DEMO_USER,
  runWithRequestIdentity,
} = require('./lib/requestIdentityContext');

const app = express();
const PORT = process.env.PORT || 3001;

// API responses are live demo data, not cacheable documents. Disable Express
// generated ETags and strip conditional request headers so API calls never
// return 304 Not Modified to the React fetch helper.
app.set('etag', false);

// ── Middleware ──────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(morgan('dev'));
const globalJsonParser = express.json({ limit: '10mb' });
app.use((req, res, next) => {
  if (shouldDeferGlobalJsonParser(req.method, req.path)) {
    return next();
  }
  return globalJsonParser(req, res, next);
});

app.use('/api', (req, res, next) => {
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// ── Demo User Context (VPD) ───────────────────────────────
// Oracle is the authority for role, region, activity, and access scope.
app.use('/api', async (req, res, next) => {
  const hasExplicitUser = Object.prototype.hasOwnProperty.call(req.headers, 'x-demo-user');
  const requestedUser = hasExplicitUser
    ? String(req.headers['x-demo-user'] || '').trim()
    : RESTRICTED_DEMO_USER;

  if (!requestedUser || !/^[A-Za-z0-9_.-]{1,128}$/.test(requestedUser)) {
    return res.status(403).json({
      error: 'The demo user identity is not recognized',
      code: 'DEMO_IDENTITY_FORBIDDEN',
    });
  }

  try {
    const identity = await db.resolveDemoIdentity(requestedUser);
    req.demoUser = identity.username;
    req.demoIdentity = identity;
    return runWithRequestIdentity(identity, next);
  } catch (error) {
    const oracleCode = String(error?.code || '');
    const oracleMessage = String(error?.message || '');
    if (oracleCode === 'DEMO_IDENTITY_FORBIDDEN'
        || /ORA-20080|ORA-20081|unknown or inactive|invalid manufacturing application user/i.test(oracleMessage)) {
      return res.status(403).json({
        error: 'The demo user identity is not recognized',
        code: 'DEMO_IDENTITY_FORBIDDEN',
      });
    }
    console.error('Manufacturing identity validation error:', error);
    return res.status(503).json({
      error: 'Manufacturing identity validation is unavailable',
      code: 'DEMO_IDENTITY_UNAVAILABLE',
    });
  }
});

// ── API Routes ─────────────────────────────────────────────
const dashboardRoutes = require('./routes/dashboard');
const productionSignalRoutes = require('./routes/productionSignals');
const productsRoutes = require('./routes/products');
const fulfillmentRoutes = require('./routes/fulfillment');
const graphRoutes = require('./routes/graph');
const agentRoutes = require('./routes/agents');
const workOrderRoutes = require('./routes/workOrders');
const mlRoutes = require('./routes/ml');
const demoRoutes = require('./routes/demo');
const usersRoutes = require('./routes/users');
const selectaiRoutes = require('./routes/selectai');
const importRoutes = require('./routes/import');
const manufacturingRoutes = require('./routes/manufacturing');

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/production-signals', productionSignalRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/fulfillment', fulfillmentRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/work-orders', workOrderRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/selectai', selectaiRoutes);
app.use('/api/import', importRoutes);
app.use('/api/manufacturing', manufacturingRoutes);

// ── Health Check ───────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.executeSystem(`
      SELECT
        'connected' AS status,
        SYSDATE AS db_time,
        SYS_CONTEXT('MANUFACTURING_APP_CTX', 'USERNAME') AS context_username,
        SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE') AS context_role,
        SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ACCESS_SCOPE') AS context_scope,
        SYS_CONTEXT('MANUFACTURING_APP_CTX', 'AUTHENTICATED') AS context_authenticated,
        (SELECT COUNT(*) FROM fulfillment_centers) AS protected_row_count
      FROM dual
    `);
    const databaseStatus = result.rows?.[0];
    const contextUsername = String(databaseStatus?.CONTEXT_USERNAME || '').toLowerCase();
    const contextRole = String(databaseStatus?.CONTEXT_ROLE || '').toLowerCase();
    const contextScope = String(databaseStatus?.CONTEXT_SCOPE || '').toLowerCase();
    const contextAuthenticated = String(databaseStatus?.CONTEXT_AUTHENTICATED || '').toUpperCase();
    const protectedRowCount = Number(databaseStatus?.PROTECTED_ROW_COUNT || 0);

    if (contextUsername !== 'admin_jess' || contextRole !== 'admin'
        || contextScope !== 'global' || contextAuthenticated !== 'Y'
        || protectedRowCount <= 0) {
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

// Return a clear JSON response for unknown API routes before the frontend catch-all.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// ── Serve Frontend (Production) ────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    },
  }));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    }
  });
}

// ── Error Handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const parserStatus = Number(err.statusCode || err.status || 0);
  const status = parserStatus === 413 || err.type === 'entity.too.large'
    ? 413
    : (parserStatus === 400 || err.type === 'entity.parse.failed' ? 400 : 500);
  res.status(status).json({
    error: status === 413
      ? 'Request body too large'
      : (status === 400 ? 'Malformed JSON request body' : 'Internal server error'),
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ── Start Server ───────────────────────────────────────────
async function start() {
  try {
    await db.initialize();
    console.log('Database connection pool ready');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  Manufacturing Operations Demo API`);
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
