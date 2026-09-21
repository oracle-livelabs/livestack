const express = require('express');

const router = express.Router();
const DEFAULT_USERNAME = 'PG';

function cleanText(value) {
  return String(value || '').trim();
}

function port(name, defaultValue) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : defaultValue;
}

function publicHost(req) {
  const configuredHost = cleanText(process.env.SOURCE_PUBLIC_HOST);
  const requestHost = cleanText(req.hostname);
  const host = configuredHost || requestHost || 'localhost';

  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function sourcePort(loadBalancerPortName, loadBalancerDefault, directPortName, directDefault) {
  return cleanText(process.env.SOURCE_PUBLIC_HOST)
    ? port(loadBalancerPortName, loadBalancerDefault)
    : port(directPortName, directDefault);
}

function sourcePassword() {
  return cleanText(process.env.DBPASSWORD)
    || cleanText(process.env.ADB_ADMIN_PASSWORD)
    || cleanText(process.env.ADB_STREAM_SCHEMA_PASSWORD)
    || null;
}

router.get('/', (req, res) => {
  const host = publicHost(req);
  const password = sourcePassword();
  const loyaltyDatabase = cleanText(process.env.LOYALTY_MYSQL_DATABASE) || 'loyalty';
  const sources = [
    {
      id: 'loyalty-mysql',
      name: 'Loyalty MySQL source',
      engine: 'MySQL',
      connectionString: `mysql://${host}:${sourcePort('LOYALTY_MYSQL_CATALOG_PORT', 3306, 'LOYALTY_MYSQL_PORT', 8503)}/${loyaltyDatabase}`,
      username: cleanText(process.env.LOYALTY_MYSQL_USER) || DEFAULT_USERNAME,
      password,
    },
  ];

  return res.json({ available: Boolean(password), sources });
});

module.exports = router;
module.exports._private = { cleanText, port, publicHost, sourcePort, sourcePassword };
