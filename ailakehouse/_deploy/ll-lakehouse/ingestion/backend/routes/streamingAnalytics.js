/**
 * GoldenGate Stream Analytics status API.
 *
 * Reports whether OSA is reachable and has the expected ADB connection.
 */
const express = require('express');
const http = require('http');
const https = require('https');

const router = express.Router();

const DEFAULT_OSA_HTTPS_PORT = '8085';
const DEFAULT_OSA_ADMIN_USER = 'osaadmin';
const DEFAULT_OSA_CONNECTION_NAME = 'PeakGear_ADB';
const DEFAULT_TIMEOUT_MS = 5000;

function cleanText(value) {
  return String(value || '').trim();
}

function getOsaHttpsPort() {
  return cleanText(process.env.GGSA_OSA_HTTPS_PORT) || DEFAULT_OSA_HTTPS_PORT;
}

function defaultOsaApiBaseUrl() {
  return `https://ggsa:${getOsaHttpsPort()}/osa/services/v0.1`;
}

function defaultOsaUiUrl() {
  return `https://ggsa:${getOsaHttpsPort()}/osa/index.html`;
}

function normalizeBaseUrl(value) {
  return cleanText(value || defaultOsaApiBaseUrl()).replace(/\/+$/, '');
}

function resolveConfig() {
  return {
    apiBaseUrl: normalizeBaseUrl(process.env.OSA_API_BASE_URL || process.env.GGSA_OSA_API_BASE_URL),
    uiUrl: cleanText(process.env.OSA_PUBLIC_URL || process.env.GGSA_OSA_PUBLIC_URL) || defaultOsaUiUrl(),
    adminUser: cleanText(process.env.OSA_ADMIN_USER) || DEFAULT_OSA_ADMIN_USER,
    adminPassword: process.env.OSA_ADMIN_PASSWORD || process.env.PASSWORD || '',
    connectionName: cleanText(process.env.OSA_ADB_CONNECTION_NAME) || DEFAULT_OSA_CONNECTION_NAME,
    timeoutMs: Number(process.env.OSA_STATUS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };
}

function resolvePublicUiUrl(req, configuredUrl) {
  const value = cleanText(configuredUrl);
  if (value && !/^https?:\/\/ggsa(?::|\/)/i.test(value)) return value;

  const hostHeader = cleanText(req.headers['x-forwarded-host'] || req.headers.host);
  const host = hostHeader.split(',')[0].trim().replace(/:\d+$/, '');
  if (!host) return value || defaultOsaUiUrl();

  const port = getOsaHttpsPort();
  return `https://${host}:${port}/osa/index.html`;
}

function publicCredentials(config) {
  return {
    username: config.adminUser,
    password: config.adminPassword,
  };
}

function getConnectionValue(connection, key) {
  return cleanText(connection?.[key] || connection?.metadata?.[key]);
}

function matchesConnection(connection, expectedName) {
  const expected = cleanText(expectedName);
  if (!expected) return false;

  return [
    getConnectionValue(connection, 'wname'),
    getConnectionValue(connection, 'name'),
    getConnectionValue(connection, 'displayName'),
  ].some((value) => value === expected);
}

function extractCookieHeader(setCookieHeader) {
  const values = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader ? [setCookieHeader] : [];
  return values.map((value) => String(value).split(';')[0]).filter(Boolean).join('; ');
}

function requestRaw(url, { method = 'GET', headers = {}, body = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const agent = parsed.protocol === 'https:'
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;

    const req = transport.request(parsed, {
      method,
      headers,
      agent,
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });

    req.on('timeout', () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)));
    req.on('error', reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function parseJsonResponse(response) {
  if (!response.body) return {};
  try {
    return JSON.parse(response.body);
  } catch {
    return {};
  }
}

async function fetchOsaConnectionStatus(config) {
  if (!config.adminPassword) {
    return {
      ok: true,
      available: false,
      connected: false,
      reason: 'not_configured',
      detail: 'OSA credentials are not configured for status checks',
    };
  }

  const loginBody = JSON.stringify({
    username: config.adminUser,
    password: config.adminPassword,
  });
  const loginResponse = await requestRaw(`${config.apiBaseUrl}/auth/token`, {
    method: 'POST',
    timeoutMs: config.timeoutMs,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginBody),
    },
    body: loginBody,
  });

  if (loginResponse.statusCode < 200 || loginResponse.statusCode >= 300) {
    return {
      ok: true,
      available: true,
      connected: false,
      reason: 'auth_failed',
      detail: 'OSA is reachable, but the status check could not authenticate',
    };
  }

  const cookieHeader = extractCookieHeader(loginResponse.headers['set-cookie']);
  const connectionsResponse = await requestRaw(`${config.apiBaseUrl}/connections/type/DatabaseConnection`, {
    timeoutMs: config.timeoutMs,
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });

  if (connectionsResponse.statusCode < 200 || connectionsResponse.statusCode >= 300) {
    return {
      ok: true,
      available: true,
      connected: false,
      reason: 'connections_unavailable',
      detail: 'OSA is reachable, but database connections could not be read',
    };
  }

  const payload = parseJsonResponse(connectionsResponse);
  const connections = Array.isArray(payload.data) ? payload.data : [];
  const connection = connections.find((item) => matchesConnection(item, config.connectionName));

  return {
    ok: true,
    available: true,
    connected: Boolean(connection),
    reason: connection ? null : 'adb_connection_missing',
    detail: connection
      ? `${config.connectionName} is configured`
      : 'OSA is reachable, but the ADB connection is not configured',
    connectionName: config.connectionName,
    connectionId: connection?.id || null,
  };
}

router.get('/status', async (req, res) => {
  const config = resolveConfig();
  const uiUrl = resolvePublicUiUrl(req, config.uiUrl);

  try {
    const status = await fetchOsaConnectionStatus(config);
    return res.json({
      service: 'GoldenGate Stream Analytics',
      uiUrl,
      credentials: publicCredentials(config),
      checkedAt: new Date().toISOString(),
      ...status,
    });
  } catch (err) {
    return res.json({
      ok: true,
      available: false,
      connected: false,
      service: 'GoldenGate Stream Analytics',
      uiUrl,
      credentials: publicCredentials(config),
      reason: 'osa_unreachable',
      detail: 'GoldenGate Stream Analytics is not reachable',
      checkedAt: new Date().toISOString(),
    });
  }
});

module.exports = router;
