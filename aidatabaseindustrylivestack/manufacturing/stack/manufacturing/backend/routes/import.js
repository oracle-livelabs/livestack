/**
 * Import API — template download, dry-run validation, dataset upload, and job status
 *
 * Core import execution is intentionally delegated to an external service.
 * This router only validates request shape and maps HTTP <-> service responses.
 */
const express = require('express');
const multer = require('multer');
const requireDatasetCommand = require('../middleware/requireDatasetCommand');
const requireDemoIdentity = require('../middleware/requireDemoIdentity');
const { requireDemoAdmin } = require('../middleware/requireDemoIdentity');

const router = express.Router();
const protectedJsonParser = express.json({ limit: '10mb' });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

const DEFAULT_VERSION = 'v1';

// Authorization contract:
// - dataset/template are public, read-only bootstrap artifacts;
// - validation, restore preview, and job status require an active demo identity;
// - upload and restore execution require explicit same-origin command intent
//   plus the APP_USERS admin role before parsing content or starting a service action.

function getImportService(req) {
  if (req.app?.locals?.importWorkflowService) {
    return req.app.locals.importWorkflowService;
  }

  try {
    // Preferred integration point once core logic is implemented
    return require('../lib/importWorkflowService');
  } catch (_) {
    return null;
  }
}

function notConfigured(res) {
  return res.status(501).json({
    error: 'Import workflow service is not configured',
    hint: 'Attach `app.locals.importWorkflowService` or provide `backend/lib/importWorkflowService.js`',
  });
}

function uploadSingleFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      ok: false,
      error: err.message || 'File upload failed',
    });
  });
}

function parseProtectedJson(req, res, next) {
  if (!req.is('application/json') && !req.is('application/*+json')) {
    return next();
  }
  return protectedJsonParser(req, res, next);
}

// Public read-only bootstrap metadata used before UserContext resolves.
router.get('/dataset', async (req, res) => {
  const service = getImportService(req);
  if (!service?.getActiveDataset) {
    return notConfigured(res);
  }

  try {
    const result = await service.getActiveDataset({
      req,
      demoUser: req.demoUser || null,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const status = Number(err.statusCode || err.status || 500);
    console.error('Import dataset status error:', err);
    return res.status(status).json({
      ok: false,
      error: err.message,
      details: err.details || undefined,
    });
  }
});

// Public read-only schema artifact; it contains no application data.
router.get('/template', async (req, res) => {
  const service = getImportService(req);
  if (!service?.generateTemplateArchive) {
    return notConfigured(res);
  }

  try {
    const version = String(req.query.version || DEFAULT_VERSION);
    const archive = await service.generateTemplateArchive({
      version,
      req,
      demoUser: req.demoUser || null,
    });

    if (!archive) {
      return res.status(500).json({ error: 'Template archive generation returned no result' });
    }

    const fileName = archive.fileName || `manufacturing-operations-import-template-${version}.zip`;
    const contentType = archive.contentType || 'application/zip';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    if (archive.buffer) {
      return res.send(archive.buffer);
    }
    if (archive.stream?.pipe) {
      archive.stream.pipe(res);
      return;
    }

    return res.status(500).json({ error: 'Template archive did not provide a buffer or stream' });
  } catch (err) {
    console.error('Import template error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/import/validate
// Accepts JSON payloads and multipart/form-data requests.
router.post('/validate', requireDemoIdentity, uploadSingleFile, async (req, res) => {
  const service = getImportService(req);
  if (!service?.validateDataset) {
    return notConfigured(res);
  }

  try {
    const result = await service.validateDataset({
      req,
      body: req.body,
      query: req.query,
      headers: req.headers,
      demoUser: req.demoUser || null,
      dryRun: true,
      version: String(req.query.version || req.body?.version || DEFAULT_VERSION),
    });

    return res.json({
      ok: true,
      mode: 'validate',
      ...result,
    });
  } catch (err) {
    const status = Number(err.statusCode || err.status || 400);
    console.error('Import validate error:', err);
    return res.status(status).json({
      ok: false,
      mode: 'validate',
      error: err.message,
      details: err.details || undefined,
    });
  }
});

// POST /api/import/upload
// Starts or executes a full dataset replacement using uploaded data.
router.post('/upload', requireDatasetCommand, requireDemoIdentity, requireDemoAdmin, parseProtectedJson, uploadSingleFile, async (req, res) => {
  const service = getImportService(req);
  if (!service?.startImport) {
    return notConfigured(res);
  }

  try {
    const result = await service.startImport({
      req,
      body: req.body,
      query: req.query,
      headers: req.headers,
      demoUser: req.demoUser || null,
      version: String(req.query.version || req.body?.version || DEFAULT_VERSION),
    });

    if (!result || typeof result !== 'object') {
      return res.status(500).json({ error: 'Import service returned an invalid response' });
    }

    const statusCode = result.statusCode || (result.jobId ? 202 : 200);
    return res.status(statusCode).json({
      ok: true,
      mode: 'upload',
      ...result,
    });
  } catch (err) {
    const status = Number(err.statusCode || err.status || 500);
    console.error('Import upload error:', err);
    return res.status(status).json({
      ok: false,
      mode: 'upload',
      error: err.message,
      details: err.details || undefined,
    });
  }
});

router.post('/restore-demo/validate', requireDemoIdentity, async (req, res) => {
  const service = getImportService(req);
  if (!service?.validateDemoRestore) {
    return notConfigured(res);
  }

  try {
    const result = await service.validateDemoRestore({
      req,
      body: req.body,
      query: req.query,
      headers: req.headers,
      demoUser: req.demoUser || null,
      version: String(req.query.version || req.body?.version || DEFAULT_VERSION),
    });

    return res.json({
      ok: true,
      mode: 'restore_demo_validate',
      ...result,
    });
  } catch (err) {
    const status = Number(err.statusCode || err.status || 400);
    console.error('Restore demo validate error:', err);
    return res.status(status).json({
      ok: false,
      mode: 'restore_demo_validate',
      error: err.message,
      details: err.details || undefined,
    });
  }
});

router.post('/restore-demo', requireDatasetCommand, requireDemoIdentity, requireDemoAdmin, parseProtectedJson, async (req, res) => {
  const service = getImportService(req);
  if (!service?.startDemoRestore) {
    return notConfigured(res);
  }

  try {
    const result = await service.startDemoRestore({
      req,
      body: req.body,
      query: req.query,
      headers: req.headers,
      demoUser: req.demoUser || null,
      version: String(req.query.version || req.body?.version || DEFAULT_VERSION),
    });

    return res.status(result.statusCode || 202).json({
      ok: true,
      mode: 'restore_demo',
      ...result,
    });
  } catch (err) {
    const status = Number(err.statusCode || err.status || 500);
    console.error('Restore demo start error:', err);
    return res.status(status).json({
      ok: false,
      mode: 'restore_demo',
      error: err.message,
      details: err.details || undefined,
    });
  }
});

// GET /api/import/status/:jobId
router.get('/status/:jobId', requireDemoIdentity, async (req, res) => {
  const service = getImportService(req);
  if (!service?.getImportStatus) {
    return notConfigured(res);
  }

  try {
    const { jobId } = req.params;
    if (!jobId || !jobId.trim()) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    const status = await service.getImportStatus({
      jobId: jobId.trim(),
      req,
      demoUser: req.demoUser || null,
    });

    if (!status) {
      return res.status(404).json({ error: 'Import job not found' });
    }

    return res.json({
      ok: true,
      ...status,
    });
  } catch (err) {
    const status = Number(err.statusCode || err.status || 500);
    console.error('Import status error:', err);
    return res.status(status).json({
      ok: false,
      error: err.message,
      details: err.details || undefined,
    });
  }
});

module.exports = router;
