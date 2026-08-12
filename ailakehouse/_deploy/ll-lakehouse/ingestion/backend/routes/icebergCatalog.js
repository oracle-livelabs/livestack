const express = require('express');

const router = express.Router();

function trimTrailingSlashes(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isUsablePublicHost(value) {
  const host = String(value || '').trim();
  return host && !host.includes('<html>') && host !== '127.0.0.1' ? host : '';
}

function deriveIcebergRestUrl(environment = process.env) {
  const explicitUrl = trimTrailingSlashes(environment.DATA_TRANSFORMS_ICEBERG_REST_URL);
  if (explicitUrl) return explicitUrl;

  const host = [
    environment.DATA_TRANSFORMS_ICEBERG_PUBLIC_HOST,
    environment.PUBLIC_HOST,
    environment.PUBLIC_IP,
    environment.public_ip,
  ].map(isUsablePublicHost).find(Boolean);
  if (!host) return '';

  const port = environment.GRAVITINO_REST_PORT || environment.GRAVITINO_HTTP_PORT || '1525';
  const path = String(environment.DATA_TRANSFORMS_ICEBERG_REST_PATH || '/iceberg').trim();
  return `http://${host}:${port}${path.startsWith('/') ? path : `/${path}`}`;
}

function catalogConfig(environment = process.env) {
  return {
    username: 'PG',
    password: environment.DATA_TRANSFORMS_PASSWORD || environment.GRAVITINO_JDBC_PASSWORD || environment.DBPASSWORD || '',
    restUrl: deriveIcebergRestUrl(environment),
    accessKeyId: environment.GRAVITINO_S3_ACCESS_KEY_ID || environment.GRAVITINO_S3_ACCESS_KEY || '',
    secretAccessKey: environment.GRAVITINO_S3_SECRET_ACCESS_KEY || environment.GRAVITINO_S3_SECRET_KEY || '',
  };
}

router.get('/config', (req, res) => {
  res.json(catalogConfig());
});

module.exports = router;
module.exports._private = { catalogConfig, deriveIcebergRestUrl };
