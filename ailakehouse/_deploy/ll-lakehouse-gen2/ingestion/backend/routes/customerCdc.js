const express = require('express');
const {
  clearDemoCustomers,
  getCustomerCdcStatus,
  getCustomerRows,
  simulateCustomerChange,
} = require('../lib/customerCdcSetup');

const router = express.Router();

router.get('/status', async (req, res) => {
  try {
    res.json(await getCustomerCdcStatus());
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

router.get('/customers', async (req, res) => {
  try {
    res.json(await getCustomerRows({ limit: req.query.limit }));
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

router.post('/simulate', async (req, res) => {
  try {
    res.json(await simulateCustomerChange(req.body?.action || 'insert'));
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      error: err.message,
    });
  }
});

router.delete('/demo-customers', async (req, res) => {
  try {
    const result = await clearDemoCustomers();
    res.status(result.ok ? 200 : 500).json(result);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

module.exports = router;
