const db = require('../config/database');

async function readActiveGeneration() {
  const result = await db.executeSystem(`
    SELECT readiness.status, readiness.job_id,
           job.candidate_generation_id generation_id
    FROM app_dataset_readiness readiness
    LEFT JOIN app_dataset_jobs job ON job.job_id = readiness.job_id
    WHERE readiness.readiness_id = 1
  `);
  return result.rows?.[0] || {};
}

async function requireActiveGeneration(req, res, next) {
  try {
    const state = await readActiveGeneration();
    if (state.STATUS === 'ACTIVE' && state.GENERATION_ID) {
      const activeGenerationId = state.GENERATION_ID;
      req.activeGenerationId = activeGenerationId;
      res.setHeader('X-Media-Generation', activeGenerationId);

      // Route work can span several Oracle statements and connections. Fence
      // the response after that work so an activation committed in between
      // cannot pair rows from one generation with the other's evidence label.
      const originalJson = res.json.bind(res);
      let responseFenceStarted = false;
      res.json = (body) => {
        if (responseFenceStarted) return res;
        responseFenceStarted = true;
        Promise.resolve()
          .then(readActiveGeneration)
          .then((current) => {
            if (current.STATUS !== 'ACTIVE'
                || current.GENERATION_ID !== activeGenerationId) {
              res.status(503);
              return originalJson({
                feature: 'ACTIVE_MEDIA_GENERATION',
                available: false,
                code: 'DATASET_GENERATION_CHANGED',
                expectedGenerationId: activeGenerationId,
                generationId: current.GENERATION_ID || null,
                status: current.STATUS || 'UNKNOWN',
                message: 'The active Media generation changed while this response was being prepared.',
              });
            }
            if (body && typeof body === 'object' && !Array.isArray(body)
                && !Object.prototype.hasOwnProperty.call(body, 'generationId')) {
              return originalJson({ ...body, generationId: activeGenerationId });
            }
            return originalJson(body);
          })
          .catch((error) => {
            console.error('Active generation response fence error:', error);
            if (res.headersSent) return;
            res.status(503);
            originalJson({
              feature: 'ACTIVE_MEDIA_GENERATION',
              available: false,
              code: 'DATASET_GENERATION_STATUS_UNAVAILABLE',
              message: 'The active Media generation could not be re-verified.',
            });
          });
        return res;
      };
      return next();
    }
    return res.status(503).json({
      feature: 'ACTIVE_MEDIA_GENERATION',
      available: false,
      code: state.STATUS === 'STABILIZING'
        ? 'DATASET_GENERATION_STABILIZING'
        : 'DATASET_GENERATION_UNAVAILABLE',
      status: state.STATUS || 'UNKNOWN',
      jobId: state.JOB_ID || null,
      generationId: state.GENERATION_ID || null,
      message: state.STATUS === 'STABILIZING'
        ? 'The committed generation is completing post-commit feature stabilization.'
        : 'No fully verified Media generation is active.',
    });
  } catch (error) {
    console.error('Active generation guard error:', error);
    return res.status(503).json({
      feature: 'ACTIVE_MEDIA_GENERATION',
      available: false,
      code: 'DATASET_GENERATION_STATUS_UNAVAILABLE',
      message: 'The active Media generation could not be verified.',
    });
  }
}

module.exports = { requireActiveGeneration };
