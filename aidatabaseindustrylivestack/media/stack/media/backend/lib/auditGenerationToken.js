'use strict';

const MAX_AUDIT_GENERATION_TOKEN_LENGTH = 60;
const AUDIT_GENERATION_TOKEN_PATTERN = /[^A-Za-z0-9_]/g;

function canonicalAuditGenerationToken(generationId) {
  return String(generationId ?? '')
    .replace(AUDIT_GENERATION_TOKEN_PATTERN, '_')
    .slice(0, MAX_AUDIT_GENERATION_TOKEN_LENGTH);
}

function auditGenerationTokenSql(generationIdExpression) {
  const expression = String(generationIdExpression || '').trim();
  if (!expression) {
    throw new Error('Audit-generation SQL requires a generation-id expression.');
  }
  return `SUBSTR(REGEXP_REPLACE(${expression}, '[^A-Za-z0-9_]', '_'), 1, ${MAX_AUDIT_GENERATION_TOKEN_LENGTH})`;
}

const BOOTSTRAP_AUDIT_GENERATION_TOKEN = canonicalAuditGenerationToken('bootstrap-v1');

module.exports = {
  MAX_AUDIT_GENERATION_TOKEN_LENGTH,
  BOOTSTRAP_AUDIT_GENERATION_TOKEN,
  canonicalAuditGenerationToken,
  auditGenerationTokenSql,
};
