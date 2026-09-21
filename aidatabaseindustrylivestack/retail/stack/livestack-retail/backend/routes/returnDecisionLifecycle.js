'use strict';

const express = require('express');
const requireDemoIdentity = require('../middleware/requireDemoIdentity');
const { requireDemoAdmin } = require('../middleware/requireDemoIdentity');
const {
  ReturnDecisionLifecycleError,
  createReturnDecisionLifecycleService,
} = require('../lib/returnDecisionLifecycleService');

const CONFIRMATION_HEADER = 'confirm-return-decision';

function requireDecisionConfirmation(req, res, next) {
  if (String(req.headers['x-return-decision-command'] || '') !== CONFIRMATION_HEADER
      || req.body?.confirmation !== true) {
    return res.status(428).json({
      error: 'Explicit reviewer confirmation is required to finalize a return decision.',
      code: 'RETURN_DECISION_CONFIRMATION_REQUIRED',
    });
  }
  return next();
}

function sendError(res, error) {
  const known = error instanceof ReturnDecisionLifecycleError;
  if (!known) console.error('Return decision lifecycle error:', error);
  return res.status(Number(error?.statusCode || 500)).json({
    error: known ? error.message : 'The governed return decision transaction could not complete.',
    code: known ? error.code : 'RETURN_DECISION_FAILED',
    details: known ? error.details || undefined : undefined,
  });
}

function createReturnDecisionLifecycleRouter({ service = createReturnDecisionLifecycleService() } = {}) {
  const router = express.Router();

  router.get('/requests/:returnId/decision-lifecycle', requireDemoIdentity, async (req, res) => {
    try {
      return res.json(await service.getLifecycle({
        returnId: req.params.returnId,
        identity: req.demoIdentity,
      }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/requests/:returnId/decision-proposals', requireDemoIdentity, requireDemoAdmin, async (req, res) => {
    try {
      const result = await service.createProposal({
        returnId: req.params.returnId,
        identity: req.demoIdentity,
        clientRequestId: req.body?.clientRequestId,
        expectedVersion: req.body?.expectedVersion,
        decisionType: req.body?.decisionType,
        reviewerNotes: req.body?.reviewerNotes,
        customerResponse: req.body?.customerResponse,
      });
      return res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.patch('/requests/:returnId/decision-proposals/:proposalId', requireDemoIdentity, requireDemoAdmin, async (req, res) => {
    try {
      return res.json(await service.updateProposal({
        returnId: req.params.returnId,
        proposalId: req.params.proposalId,
        identity: req.demoIdentity,
        clientRequestId: req.body?.clientRequestId,
        expectedVersion: req.body?.expectedVersion,
        decisionType: req.body?.decisionType,
        reviewerNotes: req.body?.reviewerNotes,
        customerResponse: req.body?.customerResponse,
      }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post(
    '/requests/:returnId/decision-proposals/:proposalId/commit',
    requireDemoIdentity,
    requireDemoAdmin,
    requireDecisionConfirmation,
    async (req, res) => {
      try {
        return res.json(await service.finalizeProposal({
          returnId: req.params.returnId,
          proposalId: req.params.proposalId,
          identity: req.demoIdentity,
          clientRequestId: req.body?.clientRequestId,
          expectedVersion: req.body?.expectedVersion,
        }));
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  return router;
}

const router = createReturnDecisionLifecycleRouter();
router.createReturnDecisionLifecycleRouter = createReturnDecisionLifecycleRouter;
router.requireDecisionConfirmation = requireDecisionConfirmation;

module.exports = router;
