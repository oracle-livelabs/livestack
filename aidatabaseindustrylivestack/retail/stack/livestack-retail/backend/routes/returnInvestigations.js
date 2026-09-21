'use strict';

const express = require('express');
const requireDemoIdentity = require('../middleware/requireDemoIdentity');
const {
  ReturnInvestigationError,
  createReturnInvestigationService,
} = require('../lib/returnInvestigationService');

function sendError(res, error) {
  const status = Number(error?.statusCode || error?.status || 500);
  const known = error instanceof ReturnInvestigationError;
  if (!known) console.error('Return investigation error:', error);
  return res.status(status).json({
    error: known ? error.message : 'The persisted return investigation could not complete.',
    code: known ? error.code : 'RETURN_INVESTIGATION_FAILED',
    details: known ? error.details || undefined : undefined,
  });
}

function createReturnInvestigationRouter({ service = createReturnInvestigationService() } = {}) {
  const router = express.Router();

  router.get('/investigations', requireDemoIdentity, async (req, res) => {
    try {
      return res.json(await service.listInvestigations({
        returnId: req.query.returnId,
        username: req.demoUser,
      }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/investigations', requireDemoIdentity, async (req, res) => {
    try {
      const investigation = await service.createInvestigation({
        returnId: req.body?.returnId,
        title: req.body?.title,
        username: req.demoUser,
      });
      return res.status(201).json(investigation);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/investigations/:investigationId', requireDemoIdentity, async (req, res) => {
    try {
      return res.json(await service.getInvestigation({
        investigationId: req.params.investigationId,
        username: req.demoUser,
      }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/investigations/:investigationId/turns', requireDemoIdentity, async (req, res) => {
    try {
      const result = await service.runTurn({
        investigationId: req.params.investigationId,
        username: req.demoUser,
        question: req.body?.question,
        clientRequestId: req.body?.clientRequestId,
        expectedVersion: req.body?.expectedVersion,
        explicitReturnId: req.body?.returnId,
      });
      return res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/investigations/:investigationId/archive', requireDemoIdentity, async (req, res) => {
    try {
      return res.json(await service.archiveInvestigation({
        investigationId: req.params.investigationId,
        username: req.demoUser,
        expectedVersion: req.body?.expectedVersion,
      }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.returnInvestigationService = service;
  return router;
}

const router = createReturnInvestigationRouter();
router.createReturnInvestigationRouter = createReturnInvestigationRouter;
router.configureTurnOrchestrator = (orchestrator) => (
  router.returnInvestigationService.setTurnOrchestrator(orchestrator)
);

module.exports = router;
