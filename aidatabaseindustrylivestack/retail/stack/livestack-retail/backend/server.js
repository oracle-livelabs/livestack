/**
 * Seer Sporting Goods Retail Operations Intelligence - Express Server
 * Serves API routes and the React frontend in production
 */

require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const db = require('./config/database');
const {
  DEFAULT_DEMO_USER,
  runWithRequestIdentity,
} = require('./lib/requestIdentityContext');
const { recoverOrphanedDatasetJobs } = require('./lib/importJobs');
const { reconcileDatasetOperationLockOnStartup } = require('./lib/datasetOperationLock');
const {
  startDatasetEventReconciler,
  stopDatasetEventReconciler,
} = require('./lib/datasetEventOutbox');
const {
  invalidateRestartSensitiveEvidence,
  reestablishActiveInMemoryEvidence,
  completeRestartSensitiveReadiness,
} = require('./lib/inMemoryEvidenceService');
const {
  reestablishActiveFeaturePlanEvidence,
} = require('./lib/featurePlanEvidenceService');
const {
  reconcileOmlAssetsOnStartup,
} = require('./lib/omlAssetLifecycleService');
const {
  computeRuntimeIdentity,
  setRuntimeIdentityHeaders,
} = require('./lib/runtimeIdentity');
const {
  retailFeatureFailureInjection,
  retailStaleResponseInjection,
} = require('./lib/retailFeatureFailureInjection');

const app = express();
const PORT = process.env.PORT || 3001;
const runtimeIdentity = computeRuntimeIdentity();
const PROCESS_INSTANCE_ID = crypto.randomUUID();

app.set('etag', false);
app.disable('x-powered-by');

function setNoStoreHeaders(res) {
  setRuntimeIdentityHeaders(res, runtimeIdentity);
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
app.use((req, res, next) => {
  setRuntimeIdentityHeaders(res, runtimeIdentity);
  next();
});
app.use(express.json({ limit: '10mb' }));

app.use('/api', (req, res, next) => {
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  setNoStoreHeaders(res);
  next();
});

// ── Demo User Context (VPD) ───────────────────────────────
// Oracle is authoritative for identity, role, region, and access scope.
app.use('/api', async (req, res, next) => {
  const explicit = Object.prototype.hasOwnProperty.call(req.headers, 'x-demo-user');
  const requestedUser = explicit
    ? String(req.headers['x-demo-user'] || '').trim()
    : DEFAULT_DEMO_USER;
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
    if (error?.code === 'DEMO_IDENTITY_FORBIDDEN'
        || /ORA-20080|ORA-20081|unknown or inactive|invalid retail application user/i.test(String(error?.message || ''))) {
      return res.status(403).json({
        error: 'The demo user identity is not recognized',
        code: 'DEMO_IDENTITY_FORBIDDEN',
      });
    }
    console.error('Retail identity validation error:', error);
    return res.status(503).json({
      error: 'Retail identity validation is unavailable',
      code: 'DEMO_IDENTITY_UNAVAILABLE',
    });
  }
});

// A deployed test-mode app owns negative feature responses. Production ignores
// the selector, and browser tooling is never allowed to fabricate HTTP 503s.
app.use('/api', retailFeatureFailureInjection);
app.use('/api', retailStaleResponseInjection);

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
const returnsRoutes = require('./routes/returns');
const returnInvestigationRoutes = require('./routes/returnInvestigations');
const returnDecisionLifecycleRoutes = require('./routes/returnDecisionLifecycle');
const {
  orchestrateReturnInvestigationTurn,
} = require('./lib/returnAskOrchestrator');

returnInvestigationRoutes.configureTurnOrchestrator(orchestrateReturnInvestigationTurn);

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/fulfillment', fulfillmentRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/returns', returnDecisionLifecycleRoutes);
app.use('/api/returns', returnInvestigationRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/selectai', selectaiRoutes);
app.use('/api/import', importRoutes);

// ── App Health Check (container contract) ───────────────────
app.get('/healthz', (req, res) => {
  setNoStoreHeaders(res);
  res.json({
    status: 'ok',
    service: 'sporting-goods-retail-intelligence',
    processInstanceId: PROCESS_INSTANCE_ID,
    runtimeIdentity,
    timestamp: new Date().toISOString(),
  });
});

// ── Health Check ───────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.executeSystem(`
      SELECT 'connected' AS status,
             SYSDATE AS db_time,
             SYS_CONTEXT('RETAIL_APP_CTX', 'USERNAME') AS context_username,
             SYS_CONTEXT('RETAIL_APP_CTX', 'ROLE') AS context_role,
             SYS_CONTEXT('RETAIL_APP_CTX', 'ACCESS_SCOPE') AS context_scope,
             SYS_CONTEXT('RETAIL_APP_CTX', 'AUTHENTICATED') AS context_authenticated,
             identity.schema_generation,
             identity.schema_source_contract,
             identity.reconciled_at AS schema_reconciled_at
      FROM dual
      CROSS JOIN app_livestack_runtime_identity identity
      WHERE identity.identity_id = 1
    `);
    const database = result.rows[0];
    res.json({
      status: 'healthy',
      database,
      databaseRuntimeIdentity: {
        SCHEMA_GENERATION: database.SCHEMA_GENERATION,
        SCHEMA_SOURCE_CONTRACT: database.SCHEMA_SOURCE_CONTRACT,
        RECONCILED_AT: database.SCHEMA_RECONCILED_AT,
      },
      runtimeIdentity,
      processInstanceId: PROCESS_INSTANCE_ID,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message,
      processInstanceId: PROCESS_INSTANCE_ID,
      runtimeIdentity,
    });
  }
});

// ── Serve Frontend (Production and immutable-launcher test mode) ───────────
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
  const noStoreHeaders = (res) => {
    setNoStoreHeaders(res);
  };
  app.use(express.static(path.join(__dirname, '../frontend/dist'), {
    etag: false,
    lastModified: false,
    setHeaders: noStoreHeaders,
  }));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      noStoreHeaders(res);
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
    console.log('Database connection pool ready');
    await recoverOrphanedDatasetJobs();
    await reconcileDatasetOperationLockOnStartup();
    await reconcileOmlAssetsOnStartup();
    await invalidateRestartSensitiveEvidence();
    try {
      const inMemoryProof = await reestablishActiveInMemoryEvidence();
      const featurePlanProofs = await reestablishActiveFeaturePlanEvidence();
      if (!inMemoryProof || !featurePlanProofs) {
        throw new Error('Active generation evidence is incomplete.');
      }
      await completeRestartSensitiveReadiness({
        inMemoryProof,
        featurePlanProofs,
      });
    } catch (err) {
      // Invalidation is committed before re-proof. A failed restart proof
      // therefore remains explicitly unavailable rather than falling back to
      // evidence from the prior process.
      console.warn(`Restart-sensitive Oracle evidence remains unavailable: ${err.message}`);
    }
    startDatasetEventReconciler();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  Seer Sporting Goods Retail Operations Intelligence API`);
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
  stopDatasetEventReconciler();
  await db.closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, shutting down...');
  stopDatasetEventReconciler();
  await db.closePool();
  process.exit(0);
});

start();

module.exports = app;
