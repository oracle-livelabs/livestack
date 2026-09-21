/**
 * Hospitality Performance Demo — Express Server
 * Serves API routes and the React frontend in production
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const db = require('./config/database');
const financialAiWorker = require('./lib/financialAiWorker');

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_DIR = path.join(__dirname, '../frontend/dist');
const NO_STORE = 'no-store, no-cache, must-revalidate, proxy-revalidate';
let httpServer = null;
let shuttingDown = false;

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
app.use(express.json({ limit: '10mb' }));

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
// Anonymous demo reads use the deliberately restricted viewer. An explicitly
// supplied unknown/inactive identity is rejected instead of failing open.
const DEFAULT_DEMO_USER = 'corp_sam';
app.use('/api', async (req, res, next) => {
  try {
    const requestedUser = req.headers['x-demo-user'] || DEFAULT_DEMO_USER;
    const identity = await db.validateDemoUser(requestedUser);
    if (!identity) {
      return res.status(403).json({ error: 'Unknown or inactive demo user.' });
    }
    req.demoUser = identity.USERNAME;
    req.demoIdentity = identity;
    return db.runWithDemoUser(req.demoUser, next);
  } catch (error) {
    return next(error);
  }
});

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
const financialValidationRoutes = require('./routes/financialValidation');

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/fulfillment', fulfillmentRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/selectai', selectaiRoutes);
app.use('/api/import', importRoutes);
app.use('/api/financial-validation', financialValidationRoutes);

// ── Health Check ───────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.execute("SELECT 'connected' AS status, SYSDATE AS db_time FROM dual");
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
  app.use(express.static(FRONTEND_DIR, {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      const relativePath = path.relative(FRONTEND_DIR, filePath).split(path.sep).join('/');
      if (relativePath.startsWith('assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (relativePath.startsWith('jet/')) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', NO_STORE);
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
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
    console.log('Database connection pool ready');
    await financialAiWorker.start();

    httpServer = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  Hospitality Performance Demo API`);
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

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down...`);
  const serverClosed = httpServer
    ? new Promise((resolve) => httpServer.close(resolve))
    : Promise.resolve();
  await financialAiWorker.stop();
  await serverClosed;
  await db.closePool();
  process.exit(0);
}

// Graceful shutdown: stop accepting work, let the bounded in-flight generation
// finish, then return Oracle sessions to the pool.
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start();

module.exports = app;
