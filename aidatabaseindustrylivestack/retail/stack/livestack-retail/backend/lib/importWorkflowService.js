const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { parse: parseCsvSync } = require('csv-parse/sync');
const db = require('../config/database');
const {
  IMPORT_VERSION,
  TABLE_BY_NAME,
  INSERT_ORDER,
  DELETE_ORDER,
  REQUIRED_TABLE_NAMES,
  OPTIONAL_TABLE_NAMES,
  TABLES,
  buildManifest,
} = require('./importCatalog');
const {
  createJobWithRequestedIntentAndLease,
  updateJob,
  failJobWithIntent,
  appendJobWarnings,
  getJob,
} = require('./importJobs');
const { getBundledDemoArchive } = require('./demoDatasetBundle');
const { getStoredDatasetState, saveDatasetState } = require('./datasetStateStore');
const {
  beginOperation,
  updateOperation,
  startOperationHeartbeat,
  endOperation,
  getActiveOperation,
  DatasetLeaseOwnershipLostError,
} = require('./datasetOperationLock');
const {
  registerCandidateOmlInventoryBeforeTraining,
  stageCandidateTrainingRows,
  stageCandidateOmlModels,
  validateCandidateOmlModels,
  activateCandidateOmlModels,
} = require('./omlModelService');
const {
  cleanupSupersededOmlAssets,
  markOmlGenerationFailedAndCleanup,
} = require('./omlAssetLifecycleService');
const { refreshDemoDateWindow } = require('./demoDataFreshnessService');
const {
  fingerprintCandidate,
  proveInMemoryOnConnection,
} = require('./inMemoryEvidenceService');
const {
  proveFeaturePlansOnConnection,
} = require('./featurePlanEvidenceService');
const {
  VectorEvidenceError,
  assertVectorEvidence,
  readVectorEvidence,
} = require('./vectorEvidenceService');
const {
  eventIdFor,
  enqueueOnConnection,
  deliverPendingDatasetEvents,
} = require('./datasetEventOutbox');
const {
  failAtPhase,
  resolveFailurePhase,
} = require('./retailFailureInjection');
const {
  resolveObjectStorageFailure,
} = require('./retailObjectStorageFailureInjection');

let ollamaAssistant = null;
try {
  // Optional: only used to flush Ask Data schema/entity caches after import.
  ollamaAssistant = require('./ollamaAssistant');
} catch (_) {
  ollamaAssistant = null;
}

const MAX_ARCHIVE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const MAX_CSV_ROWS = 100000;
const VECTOR_MODEL_NAME = 'ALL_MINILM_L12_V2';
const INSERT_SQL_CACHE = new Map();
let cachedBundledDemoDataset = null;

class ImportError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'ImportError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function isTrueish(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizeZipBaseName(name) {
  return String(name || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .toLowerCase();
}

function normalizeSourceId(value) {
  return String(value == null ? '' : value).trim();
}

function roundTo(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function firstOutBind(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildTemplateReadme() {
  return [
    '# Seer Sporting Goods Import Template',
    '',
    `Version: ${IMPORT_VERSION}`,
    '',
    'Usage',
    '1. Fill the per-table CSV files in this ZIP.',
    '2. Keep manifest.json in the archive.',
    '3. Validate the completed ZIP before running the destructive import.',
    '',
    'Notes',
    '- CSV ID columns are source reference keys. Oracle identity values are regenerated during import.',
    '- app_users are preserved and should not be included in the ZIP.',
    '- Derived columns such as customers.location, fulfillment_centers.location, order_items.line_total, fulfillment_zones, and vector embedding tables are rebuilt by the importer and therefore are not included as editable CSV inputs.',
    '- inventory.csv is required.',
    '- shipments.csv, demand_regions.csv, demand_forecasts.csv, influencer_connections.csv, and brand_influencer_links.csv are optional.',
    '- When optional files are omitted, the importer regenerates fallback data.',
    '- demand_regions.boundary expects WKT polygon text, for example: POLYGON((-122.6 37.2, -121.7 37.2, -121.7 38.0, -122.6 38.0, -122.6 37.2))',
    '- Timestamps should use ISO 8601 values. Dates should use YYYY-MM-DD.',
    '',
  ].join('\n');
}

function buildDatasetState(source, version = IMPORT_VERSION) {
  const normalized = String(source || 'custom').toLowerCase() === 'demo' ? 'demo' : 'custom';
  return {
    source: normalized,
    label: normalized === 'demo' ? 'Demo Data' : 'Custom Dataset',
    version,
  };
}

async function acquireOperationLock(kind, message, ownerId) {
  const acquired = await beginOperation({
    kind,
    message,
    progress: 0,
    status: 'running',
    jobId: ownerId,
  });

  if (acquired) {
    return acquired;
  }

  const activeOperation = await getActiveOperation();
  throw new ImportError(
    `Another dataset operation is already in progress${activeOperation?.kind ? ` (${activeOperation.kind}).` : '.'}`,
    409,
    { activeOperation }
  );
}

function getArchiveBufferFromRequest({ req, body }) {
  if (req?.file?.buffer) {
    if (req.file.size > MAX_ARCHIVE_SIZE_BYTES) {
      throw new ImportError(`ZIP file exceeds ${Math.round(MAX_ARCHIVE_SIZE_BYTES / (1024 * 1024))} MB limit.`);
    }
    return {
      buffer: req.file.buffer,
      fileName: req.file.originalname || 'dataset.zip',
    };
  }

  if (body?.archiveBase64) {
    const buffer = Buffer.from(String(body.archiveBase64), 'base64');
    return {
      buffer,
      fileName: body.fileName || 'dataset.zip',
    };
  }

  throw new ImportError('Upload a ZIP file using multipart/form-data with field name "file".');
}

function loadArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ImportError('Uploaded file is empty or missing.');
  }

  try {
    return new AdmZip(buffer);
  } catch (err) {
    throw new ImportError('Uploaded file is not a valid ZIP archive.', 400, err.message);
  }
}

function listArchiveFiles(zip) {
  const files = new Map();
  const entries = zip.getEntries();
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new ImportError(`ZIP contains more than ${MAX_ARCHIVE_ENTRIES} entries.`, 413);
  }
  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const uncompressedBytes = Number(entry.header?.size || 0);
    const compressedBytes = Math.max(1, Number(entry.header?.compressedSize || 0));
    totalUncompressedBytes += uncompressedBytes;
    if (uncompressedBytes > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      throw new ImportError(`ZIP entry "${entry.entryName}" exceeds the uncompressed-size limit.`, 413);
    }
    if (uncompressedBytes / compressedBytes > MAX_COMPRESSION_RATIO) {
      throw new ImportError(`ZIP entry "${entry.entryName}" exceeds the compression-ratio limit.`, 413);
    }
    if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ImportError('ZIP exceeds the total uncompressed-size limit.', 413);
    }
    const baseName = normalizeZipBaseName(entry.entryName);
    if (!baseName) continue;
    if (files.has(baseName)) {
      throw new ImportError(`ZIP contains duplicate file names for "${baseName}". Keep only one copy of each CSV.`);
    }
    files.set(baseName, entry);
  }
  return files;
}

function parseManifest(files, version) {
  const manifestEntry = files.get('manifest.json');
  if (!manifestEntry) {
    throw new ImportError('ZIP is missing manifest.json.');
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  } catch (err) {
    throw new ImportError('manifest.json is not valid JSON.', 400, err.message);
  }

  const manifestVersion = String(manifest.version || '').trim();
  if (manifestVersion && manifestVersion !== version) {
    throw new ImportError(`manifest.json declares version "${manifestVersion}" but "${version}" was requested.`);
  }

  return manifest;
}

function isRowEmpty(record) {
  return record.every((value) => String(value ?? '').trim() === '');
}

function normalizeIsoDate(rawValue, type, tableName, columnName, lineNumber, errors) {
  const text = String(rawValue || '').trim();
  if (!text) return null;

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    errors.push(`${tableName}.csv line ${lineNumber}: "${columnName}" must be a valid ${type}.`);
    return null;
  }

  return parsed;
}

function normalizeGeometryText(rawValue, tableName, lineNumber, columnName, errors) {
  const text = String(rawValue || '').trim();
  if (!text) return null;

  if (/^(polygon|multipolygon)\s*\(/i.test(text)) {
    return text;
  }

  if (/^sdo_geometry\s*\(/i.test(text)) {
    const ordMatch = text.match(/SDO_ORDINATE_ARRAY\s*\(([^)]+)\)/i);
    if (!ordMatch) {
      errors.push(`${tableName}.csv line ${lineNumber}: "${columnName}" SDO_GEOMETRY value does not contain SDO_ORDINATE_ARRAY(...).`);
      return null;
    }

    const ordinates = ordMatch[1]
      .split(',')
      .map((part) => Number(String(part).trim()))
      .filter((value) => Number.isFinite(value));

    if (ordinates.length < 6 || ordinates.length % 2 !== 0) {
      errors.push(`${tableName}.csv line ${lineNumber}: "${columnName}" must contain an even number of ordinates.`);
      return null;
    }

    const pairs = [];
    for (let index = 0; index < ordinates.length; index += 2) {
      pairs.push(`${ordinates[index]} ${ordinates[index + 1]}`);
    }
    return `POLYGON((${pairs.join(', ')}))`;
  }

  errors.push(`${tableName}.csv line ${lineNumber}: "${columnName}" must be WKT polygon text or an SDO_GEOMETRY polygon literal.`);
  return null;
}

function parseSourceIdList(rawValue) {
  const text = String(rawValue || '').trim();
  if (!text) return null;
  return text
    .split(',')
    .map((part) => normalizeSourceId(part))
    .filter(Boolean);
}

function normalizeEnumValue(rawValue, values) {
  const text = String(rawValue || '').trim();
  if (!text) return null;
  const normalized = text.toLowerCase();
  const match = values.find((value) => String(value).toLowerCase() === normalized);
  return match || null;
}

function normalizeFlagValue(rawValue) {
  const text = String(rawValue || '').trim().toLowerCase();
  if (!text) return null;
  if (['1', 'true', 'yes', 'y'].includes(text)) return 1;
  if (['0', 'false', 'no', 'n'].includes(text)) return 0;
  return Number.isInteger(Number(text)) ? Number(text) : null;
}

function parseColumnValue(table, column, rawValue, lineNumber, errors) {
  const text = String(rawValue ?? '');
  const trimmed = text.trim();

  if (!trimmed) {
    if (column.required) {
      errors.push(`${table.name}.csv line ${lineNumber}: "${column.name}" is required.`);
    }
    return null;
  }

  switch (column.type) {
    case 'id':
      return trimmed;
    case 'string':
      return trimmed;
    case 'number': {
      const value = Number(trimmed);
      if (!Number.isFinite(value)) {
        errors.push(`${table.name}.csv line ${lineNumber}: "${column.name}" must be numeric.`);
        return null;
      }
      return value;
    }
    case 'integer': {
      const value = Number(trimmed);
      if (!Number.isInteger(value)) {
        errors.push(`${table.name}.csv line ${lineNumber}: "${column.name}" must be an integer.`);
        return null;
      }
      return value;
    }
    case 'flag': {
      const value = normalizeFlagValue(trimmed);
      if (value == null || ![0, 1].includes(value)) {
        errors.push(`${table.name}.csv line ${lineNumber}: "${column.name}" must be 0/1, true/false, or yes/no.`);
        return null;
      }
      return value;
    }
    case 'enum': {
      const value = normalizeEnumValue(trimmed, column.values || []);
      if (!value) {
        errors.push(`${table.name}.csv line ${lineNumber}: "${column.name}" must be one of ${column.values.join(', ')}.`);
        return null;
      }
      return value;
    }
    case 'date':
      return normalizeIsoDate(trimmed, 'date', table.name, column.name, lineNumber, errors);
    case 'timestamp':
      return normalizeIsoDate(trimmed, 'timestamp', table.name, column.name, lineNumber, errors);
    case 'geometry_wkt':
      return normalizeGeometryText(trimmed, table.name, lineNumber, column.name, errors);
    case 'source_id_list':
      return parseSourceIdList(trimmed);
    default:
      return trimmed;
  }
}

function parseCsvTable(table, csvText, errors) {
  let records;
  try {
    records = parseCsvSync(csvText, {
      bom: true,
      relax_quotes: true,
      skip_empty_lines: true,
    });
  } catch (err) {
    errors.push(`${table.name}.csv could not be parsed as CSV: ${err.message}`);
    return { header: [], rows: [], sourceIds: new Set() };
  }

  if (!records.length) {
    errors.push(`${table.name}.csv is empty.`);
    return { header: [], rows: [], sourceIds: new Set() };
  }
  if (records.length - 1 > MAX_CSV_ROWS) {
    errors.push(`${table.name}.csv exceeds the ${MAX_CSV_ROWS.toLocaleString()} row limit.`);
    return { header: [], rows: [], sourceIds: new Set() };
  }

  const expectedHeader = table.columns.map((column) => column.name);
  const actualHeader = records[0].map((value) => String(value ?? '').trim());

  if (actualHeader.length !== expectedHeader.length || actualHeader.some((value, index) => value !== expectedHeader[index])) {
    errors.push(
      `${table.name}.csv header mismatch. Expected "${expectedHeader.join(',')}" but received "${actualHeader.join(',')}".`
    );
    return { header: actualHeader, rows: [], sourceIds: new Set() };
  }

  const rows = [];
  const sourceIds = new Set();

  for (let rowIndex = 1; rowIndex < records.length; rowIndex += 1) {
    const record = records[rowIndex];
    const lineNumber = rowIndex + 1;

    if (isRowEmpty(record)) continue;
    if (record.length !== expectedHeader.length) {
      errors.push(`${table.name}.csv line ${lineNumber}: expected ${expectedHeader.length} columns but received ${record.length}.`);
      continue;
    }

    const row = { __lineNumber: lineNumber };
    for (let columnIndex = 0; columnIndex < table.columns.length; columnIndex += 1) {
      const column = table.columns[columnIndex];
      row[column.name] = parseColumnValue(table, column, record[columnIndex], lineNumber, errors);
    }

    row.__sourceId = normalizeSourceId(row[table.pk]);

    if (sourceIds.has(row.__sourceId)) {
      errors.push(`${table.name}.csv line ${lineNumber}: duplicate source ID "${row.__sourceId}".`);
    } else {
      sourceIds.add(row.__sourceId);
    }

    rows.push(row);
  }

  return { header: actualHeader, rows, sourceIds };
}

function validateUniqueKeys(table, tableData, errors) {
  for (const keyColumns of table.uniqueKeys || []) {
    const seen = new Map();

    for (const row of tableData.rows) {
      const values = keyColumns.map((columnName) => row[columnName]);
      if (values.some((value) => value == null || value === '')) continue;

      const key = values.map((value) => Array.isArray(value) ? value.join('|') : String(value)).join('::');
      const previous = seen.get(key);
      if (previous) {
        errors.push(
          `${table.name}.csv lines ${previous} and ${row.__lineNumber}: duplicate unique key on (${keyColumns.join(', ')}).`
        );
      } else {
        seen.set(key, row.__lineNumber);
      }
    }
  }
}

function validateCrossTableReferences(dataset, errors, warnings) {
  const sourceIdsByTable = Object.fromEntries(
    Object.entries(dataset.tables).map(([tableName, tableData]) => [tableName, tableData.sourceIds])
  );

  for (const table of TABLES) {
    const tableData = dataset.tables[table.name];
    if (!tableData?.provided) continue;

    validateUniqueKeys(table, tableData, errors);

    for (const fk of table.foreignKeys || []) {
      const refSourceIds = sourceIdsByTable[fk.refTable] || new Set();
      for (const row of tableData.rows) {
        const value = row[fk.column];
        if (value == null || value === '') {
          if (!fk.allowNull) {
            errors.push(`${table.name}.csv line ${row.__lineNumber}: "${fk.column}" is required.`);
          }
          continue;
        }

        if (!refSourceIds.has(normalizeSourceId(value))) {
          errors.push(
            `${table.name}.csv line ${row.__lineNumber}: "${fk.column}" references missing ${fk.refTable}.${TABLE_BY_NAME[fk.refTable].pk} value "${value}".`
          );
        }
      }
    }

    for (const column of table.columns) {
      if (column.type !== 'source_id_list' || !column.refTable) continue;
      const refSourceIds = sourceIdsByTable[column.refTable] || new Set();
      for (const row of tableData.rows) {
        const values = row[column.name];
        if (!Array.isArray(values)) continue;
        for (const value of values) {
          if (!refSourceIds.has(normalizeSourceId(value))) {
            errors.push(
              `${table.name}.csv line ${row.__lineNumber}: "${column.name}" references missing ${column.refTable}.${TABLE_BY_NAME[column.refTable].pk} value "${value}".`
            );
          }
        }
      }
    }
  }

  const demandRegions = dataset.tables.demand_regions;
  const demandForecasts = dataset.tables.demand_forecasts;
  if (demandForecasts?.provided) {
    if (demandRegions?.provided) {
      const regionNames = new Set(
        demandRegions.rows.map((row) => String(row.region_name || '').trim().toLowerCase()).filter(Boolean)
      );
      for (const row of demandForecasts.rows) {
        const regionName = String(row.region || '').trim();
        if (regionName && !regionNames.has(regionName.toLowerCase())) {
          errors.push(
            `demand_forecasts.csv line ${row.__lineNumber}: region "${regionName}" does not exist in demand_regions.csv.`
          );
        }
      }
    } else {
      warnings.push('demand_forecasts.csv was provided without demand_regions.csv. Region names were not cross-checked.');
    }
  }
}

function parseArchiveDataset(buffer, version) {
  const zip = loadArchive(buffer);
  const files = listArchiveFiles(zip);
  const manifest = parseManifest(files, version);
  const errors = [];
  const warnings = [];
  const tables = {};
  const counts = {};

  for (const requiredTable of REQUIRED_TABLE_NAMES) {
    if (!files.has(`${requiredTable}.csv`)) {
      errors.push(`ZIP is missing required file "${requiredTable}.csv".`);
    }
  }

  for (const optionalTable of OPTIONAL_TABLE_NAMES) {
    if (!files.has(`${optionalTable}.csv`)) {
      warnings.push(`Optional file "${optionalTable}.csv" is missing. The importer will regenerate fallback data.`);
    }
  }

  for (const table of TABLES) {
    const entry = files.get(`${table.name}.csv`);
    if (!entry) {
      tables[table.name] = {
        table,
        provided: false,
        rows: [],
        sourceIds: new Set(),
      };
      counts[table.name] = 0;
      continue;
    }

    const csvText = entry.getData().toString('utf8');
    const parsed = parseCsvTable(table, csvText, errors);
    tables[table.name] = {
      table,
      provided: true,
      rows: parsed.rows,
      sourceIds: parsed.sourceIds,
      header: parsed.header,
      entryName: entry.entryName,
    };
    counts[table.name] = parsed.rows.length;
  }

  const dataset = {
    version: String(manifest.version || version || IMPORT_VERSION),
    manifest,
    tables,
    counts,
  };

  validateCrossTableReferences(dataset, errors, warnings);

  return {
    valid: errors.length === 0,
    message: errors.length
      ? `Validation failed with ${errors.length} issue(s).`
      : `Archive parsed successfully with ${Object.values(tables).filter((tableData) => tableData.provided).length} CSV file(s).`,
    errors,
    warnings,
    counts,
    dataset: errors.length === 0 ? dataset : null,
  };
}

function getBundledDemoDataset(version = IMPORT_VERSION) {
  if (version !== IMPORT_VERSION) {
    throw new ImportError(`Unsupported import template version "${version}".`, 400);
  }

  if (!cachedBundledDemoDataset) {
    const archive = getBundledDemoArchive();
    const parsed = parseArchiveDataset(archive.buffer, version);
    if (!parsed.valid) {
      throw new ImportError('Bundled demo dataset is invalid.', 500, {
        errors: parsed.errors,
        warnings: parsed.warnings,
        counts: parsed.counts,
      });
    }
    cachedBundledDemoDataset = { archive, parsed };
  }

  return cachedBundledDemoDataset;
}

async function execSql(connection, sql, binds = {}, options = {}) {
  return connection.execute(sql, binds, {
    autoCommit: false,
    ...options,
  });
}

function getInsertStatement(table) {
  if (INSERT_SQL_CACHE.has(table.name)) {
    return INSERT_SQL_CACHE.get(table.name);
  }

  const dataColumns = table.columns.filter((column) => !column.sourceId);
  const columnList = dataColumns.map((column) => column.name).join(', ');
  const valueList = dataColumns.map((column) => {
    if (table.name === 'demand_regions' && column.name === 'boundary') {
      return 'SDO_UTIL.FROM_WKTGEOMETRY(:boundary)';
    }
    return `:${column.name}`;
  }).join(', ');

  const sql = [
    `INSERT INTO ${table.name} (${columnList})`,
    `VALUES (${valueList})`,
    `RETURNING ${table.pk} INTO :generatedId`,
  ].join(' ');

  INSERT_SQL_CACHE.set(table.name, sql);
  return sql;
}

function resolveMappedValue(value, refTable, idMaps, tableName, columnName, lineNumber) {
  if (value == null || value === '') return null;
  const refMap = idMaps[refTable];
  const actualId = refMap?.get(normalizeSourceId(value));
  if (actualId == null) {
    throw new ImportError(
      `${tableName}.csv line ${lineNumber}: "${columnName}" could not be mapped to imported ${refTable} row "${value}".`
    );
  }
  return actualId;
}

function resolveInsertValue(table, column, row, idMaps) {
  const value = row[column.name];
  if (value == null) return null;

  const fk = (table.foreignKeys || []).find((item) => item.column === column.name);
  if (fk) {
    return resolveMappedValue(value, fk.refTable, idMaps, table.name, column.name, row.__lineNumber);
  }

  if (column.type === 'source_id_list') {
    const refMap = idMaps[column.refTable];
    return value
      .map((item) => {
        const actualId = refMap?.get(normalizeSourceId(item));
        if (actualId == null) {
          throw new ImportError(
            `${table.name}.csv line ${row.__lineNumber}: "${column.name}" could not map source ID "${item}" to ${column.refTable}.`
          );
        }
        return actualId;
      })
      .join(',');
  }

  return value;
}

async function insertImportedRow(connection, table, row, idMaps) {
  const binds = {};
  for (const column of table.columns) {
    if (column.sourceId) continue;
    binds[column.name] = resolveInsertValue(table, column, row, idMaps);
  }
  binds.generatedId = { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER };

  const result = await execSql(connection, getInsertStatement(table), binds);
  return firstOutBind(result.outBinds.generatedId);
}

function buildSourceRowMap(rows, keyName) {
  return new Map(rows.map((row) => [normalizeSourceId(row[keyName]), row]));
}

function pickOrderTimestamp(row) {
  return row.created_at || row.updated_at || new Date();
}

function hashString(input) {
  let hash = 0;
  const text = String(input || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const inputs = [lat1, lon1, lat2, lon2].map(Number);
  if (inputs.some((value) => !Number.isFinite(value))) return null;
  const [aLat, aLon, bLat, bLon] = inputs;
  const toRad = (degrees) => degrees * Math.PI / 180;
  const earthKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const base =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthKm * Math.atan2(Math.sqrt(base), Math.sqrt(1 - base));
}

const OWNER_SCOPED_RUNTIME_DELETE_ORDER = Object.freeze([
  // Executed for every active owner context:
  // DELETE FROM agent_runtime_telemetry
  // DELETE FROM agent_conversation_turns
  // DELETE FROM agent_conversations
  // DELETE FROM return_investigation_turns
  // DELETE FROM return_investigations
  'agent_runtime_telemetry',
  'agent_conversation_turns',
  'agent_conversations',
  'return_investigation_turns',
  'return_investigations',
]);

async function deleteOwnerScopedRuntimeData(connection) {
  // These tables intentionally use owner-scoped VPD predicates, including for
  // the schema-owner connection used by Restore Demo Data. Cycle through every
  // active application identity so a restore removes each owner's runtime
  // state instead of only Jessica's. Inactive-owner rows remain harmless and
  // inaccessible because every read is also bound to the active generation.
  const ownerResult = await execSql(connection, `
    SELECT username
    FROM app_users
    WHERE is_active = 1
    ORDER BY username
  `);
  const owners = [...new Set([
    'admin_jess',
    ...(ownerResult.rows || []).map((row) => String(row.USERNAME || '').trim()),
  ].filter(Boolean))];

  try {
    for (const username of owners) {
      await db.setSecurityContext(connection, username, { autoCommit: false });
      for (const tableName of OWNER_SCOPED_RUNTIME_DELETE_ORDER) {
        await execSql(connection, `DELETE FROM ${tableName}`);
      }
    }
  } finally {
    // All remaining import work requires the global Admin scope. Context is
    // session state rather than transactional state, so restore it even when a
    // runtime cleanup statement fails and the surrounding import rolls back.
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
  }
}

async function deleteExistingImportData(connection) {
  // Runtime artifacts are not importable CSVs. Clear them before replacing
  // their business-data parents, while retaining the all-or-nothing import
  // transaction and the active-generation activation boundary.
  await deleteOwnerScopedRuntimeData(connection);
  await execSql(connection, 'DELETE FROM return_decision_commands');
  await execSql(connection, 'DELETE FROM return_customer_messages');
  await execSql(connection, 'DELETE FROM return_decision_provenance');
  await execSql(connection, 'DELETE FROM return_decision_proposals');
  for (const tableName of DELETE_ORDER) {
    await execSql(connection, `DELETE FROM ${tableName}`);
  }
}

async function insertProvidedTables(connection, dataset, progress) {
  const idMaps = {};
  const insertedCounts = {};
  const activeTables = INSERT_ORDER.filter((tableName) => dataset.tables[tableName]?.provided);

  for (let tableIndex = 0; tableIndex < activeTables.length; tableIndex += 1) {
    const tableName = activeTables[tableIndex];
    const table = TABLE_BY_NAME[tableName];
    const tableData = dataset.tables[tableName];
    const idMap = new Map();
    idMaps[tableName] = idMap;

    if (progress) {
      await progress({
        status: 'running',
        progress: 20 + Math.round((tableIndex / Math.max(activeTables.length, 1)) * 35),
        message: `Importing ${tableName}.csv...`,
      });
    }

    for (const row of tableData.rows) {
      const generatedId = await insertImportedRow(connection, table, row, idMaps);
      idMap.set(row.__sourceId, generatedId);
    }

    insertedCounts[tableName] = tableData.rows.length;
  }

  return { idMaps, insertedCounts };
}

async function rebuildSpatialLocations(connection) {
  await execSql(connection, `
    UPDATE fulfillment_centers
    SET location = SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE(longitude, latitude, NULL), NULL, NULL)
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
  `);

  await execSql(connection, `
    UPDATE customers
    SET location = SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE(longitude, latitude, NULL), NULL, NULL)
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
  `);
}

async function rebuildFulfillmentZones(connection) {
  await execSql(connection, 'DELETE FROM fulfillment_zones');

  const tiers = [
    { zoneType: 'express', maxHrs: 8, meters: 80000 },
    { zoneType: 'overnight', maxHrs: 16, meters: 160000 },
    { zoneType: 'standard', maxHrs: 24, meters: 250000 },
    { zoneType: 'economy', maxHrs: 72, meters: 500000 },
  ];

  let inserted = 0;
  for (const tier of tiers) {
    const result = await execSql(connection, `
      INSERT INTO fulfillment_zones (center_id, zone_type, max_delivery_hrs, zone_boundary)
      SELECT center_id, :zoneType, :maxHrs,
             SDO_GEOM.SDO_BUFFER(location, :meters, 1, 'unit=METER')
      FROM fulfillment_centers
      WHERE is_active = 1
        AND location IS NOT NULL
    `, tier);
    inserted += result.rowsAffected || 0;
  }

  return inserted;
}

function buildFallbackBrandLinks(dataset) {
  const posts = dataset.tables.social_posts.rows;
  const mentions = dataset.tables.post_product_mentions.rows;
  const productsById = buildSourceRowMap(dataset.tables.products.rows, 'product_id');
  const postsById = buildSourceRowMap(posts, 'post_id');
  const orderItems = dataset.tables.order_items.rows;
  const orders = dataset.tables.orders.rows;

  const mentionsByPost = new Map();
  for (const mention of mentions) {
    const postKey = normalizeSourceId(mention.post_id);
    const existing = mentionsByPost.get(postKey) || [];
    existing.push(mention);
    mentionsByPost.set(postKey, existing);
  }

  const orderItemsByOrderAndBrand = new Map();
  for (const item of orderItems) {
    const product = productsById.get(normalizeSourceId(item.product_id));
    if (!product) continue;
    const key = `${normalizeSourceId(item.order_id)}::${normalizeSourceId(product.brand_id)}`;
    const lineValue = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
    orderItemsByOrderAndBrand.set(key, (orderItemsByOrderAndBrand.get(key) || 0) + lineValue);
  }

  const ordersBySocialSource = new Map();
  for (const order of orders) {
    if (!order.social_source_id) continue;
    const key = normalizeSourceId(order.social_source_id);
    const existing = ordersBySocialSource.get(key) || [];
    existing.push(order);
    ordersBySocialSource.set(key, existing);
  }

  const groups = new Map();
  for (const post of posts) {
    const influencerId = normalizeSourceId(post.influencer_id);
    if (!influencerId) continue;

    const postMentions = mentionsByPost.get(normalizeSourceId(post.post_id)) || [];
    const brandIds = new Set();
    for (const mention of postMentions) {
      const product = productsById.get(normalizeSourceId(mention.product_id));
      if (product?.brand_id) {
        brandIds.add(normalizeSourceId(product.brand_id));
      }
    }

    const engagement = (() => {
      const likes = Number(post.likes_count) || 0;
      const shares = Number(post.shares_count) || 0;
      const comments = Number(post.comments_count) || 0;
      const views = Number(post.views_count) || 0;
      return views > 0 ? roundTo((likes + (shares * 2) + (comments * 2)) / views, 4) : 0;
    })();

    for (const brandId of brandIds) {
      const key = `${brandId}::${influencerId}`;
      const group = groups.get(key) || {
        brandId,
        influencerId,
        postIds: new Set(),
        engagementTotal: 0,
        revenueAttributed: 0,
        firstMention: null,
        lastMention: null,
      };

      group.postIds.add(normalizeSourceId(post.post_id));
      group.engagementTotal += engagement;
      group.firstMention = !group.firstMention || post.posted_at < group.firstMention ? post.posted_at : group.firstMention;
      group.lastMention = !group.lastMention || post.posted_at > group.lastMention ? post.posted_at : group.lastMention;

      const attributedOrders = ordersBySocialSource.get(normalizeSourceId(post.post_id)) || [];
      for (const order of attributedOrders) {
        const revenueKey = `${normalizeSourceId(order.order_id)}::${brandId}`;
        group.revenueAttributed += orderItemsByOrderAndBrand.get(revenueKey) || 0;
      }

      groups.set(key, group);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      brandId: group.brandId,
      influencerId: group.influencerId,
      relationshipType: 'organic',
      postCount: group.postIds.size,
      avgEngagement: group.postIds.size ? roundTo(group.engagementTotal / group.postIds.size, 4) : 0,
      revenueAttributed: roundTo(group.revenueAttributed, 2) || 0,
      firstMention: group.firstMention,
      lastMention: group.lastMention,
    }))
    .filter((row) => row.postCount > 0);
}

function buildFallbackInfluencerConnections(dataset) {
  const influencerRows = dataset.tables.influencers.rows;
  const posts = dataset.tables.social_posts.rows;
  const mentions = dataset.tables.post_product_mentions.rows;
  const productsById = buildSourceRowMap(dataset.tables.products.rows, 'product_id');
  const influencersById = buildSourceRowMap(influencerRows, 'influencer_id');
  const postsById = buildSourceRowMap(posts, 'post_id');

  const brandsByInfluencer = new Map();
  const activityByInfluencer = new Map();

  for (const mention of mentions) {
    const post = postsById.get(normalizeSourceId(mention.post_id));
    const product = productsById.get(normalizeSourceId(mention.product_id));
    if (!post?.influencer_id || !product?.brand_id) continue;

    const influencerId = normalizeSourceId(post.influencer_id);
    const brandId = normalizeSourceId(product.brand_id);

    const brands = brandsByInfluencer.get(influencerId) || new Set();
    brands.add(brandId);
    brandsByInfluencer.set(influencerId, brands);

    const activity = activityByInfluencer.get(influencerId) || { firstSeen: null, lastSeen: null, posts: 0 };
    activity.posts += 1;
    activity.firstSeen = !activity.firstSeen || post.posted_at < activity.firstSeen ? post.posted_at : activity.firstSeen;
    activity.lastSeen = !activity.lastSeen || post.posted_at > activity.lastSeen ? post.posted_at : activity.lastSeen;
    activityByInfluencer.set(influencerId, activity);
  }

  const influencerIds = influencerRows.map((row) => normalizeSourceId(row.influencer_id));
  const edges = [];

  for (let left = 0; left < influencerIds.length; left += 1) {
    for (let right = left + 1; right < influencerIds.length; right += 1) {
      const fromId = influencerIds[left];
      const toId = influencerIds[right];
      const leftBrands = brandsByInfluencer.get(fromId) || new Set();
      const rightBrands = brandsByInfluencer.get(toId) || new Set();
      const sharedBrands = [...leftBrands].filter((brandId) => rightBrands.has(brandId));
      if (!sharedBrands.length) continue;

      const leftActivity = activityByInfluencer.get(fromId) || { posts: 0, firstSeen: null, lastSeen: null };
      const rightActivity = activityByInfluencer.get(toId) || { posts: 0, firstSeen: null, lastSeen: null };

      edges.push({
        fromInfluencer: fromId,
        toInfluencer: toId,
        connectionType: sharedBrands.length > 1 ? 'collaborates' : 'mentioned',
        strength: roundTo(Math.min(0.95, 0.35 + (sharedBrands.length * 0.2)), 3),
        interactionCount: sharedBrands.length + Math.min(leftActivity.posts, rightActivity.posts),
        firstSeen: leftActivity.firstSeen && rightActivity.firstSeen
          ? (leftActivity.firstSeen < rightActivity.firstSeen ? leftActivity.firstSeen : rightActivity.firstSeen)
          : (leftActivity.firstSeen || rightActivity.firstSeen || null),
        lastInteraction: leftActivity.lastSeen && rightActivity.lastSeen
          ? (leftActivity.lastSeen > rightActivity.lastSeen ? leftActivity.lastSeen : rightActivity.lastSeen)
          : (leftActivity.lastSeen || rightActivity.lastSeen || null),
      });
    }
  }

  if (!edges.length && influencerIds.length > 1) {
    const sortedInfluencers = [...influencerRows].sort((a, b) => {
      const scoreDelta = (Number(b.influence_score) || 0) - (Number(a.influence_score) || 0);
      if (scoreDelta !== 0) return scoreDelta;
      return normalizeSourceId(a.influencer_id).localeCompare(normalizeSourceId(b.influencer_id));
    });

    for (let index = 0; index < sortedInfluencers.length - 1; index += 1) {
      const current = sortedInfluencers[index];
      const next = sortedInfluencers[index + 1];
      edges.push({
        fromInfluencer: normalizeSourceId(current.influencer_id),
        toInfluencer: normalizeSourceId(next.influencer_id),
        connectionType: 'follows',
        strength: 0.4,
        interactionCount: 1,
        firstSeen: current.created_at || next.created_at || null,
        lastInteraction: current.created_at || next.created_at || null,
      });
    }
  }

  return edges.slice(0, 500);
}

function buildFallbackDemandRegions(dataset) {
  const customers = dataset.tables.customers.rows;
  const orders = dataset.tables.orders.rows;
  const customersById = buildSourceRowMap(customers, 'customer_id');
  const groups = new Map();

  for (const customer of customers) {
    if (!Number.isFinite(Number(customer.latitude)) || !Number.isFinite(Number(customer.longitude))) continue;

    const city = String(customer.city || '').trim();
    const state = String(customer.state_province || '').trim();
    const country = String(customer.country || 'US').trim();
    const key = city && state ? `${city}|${state}|${country}` : `${state || country}|${country}`;
    const label = city && state ? `${city}, ${state}` : `${state || country} Region`;

    const group = groups.get(key) || {
      regionName: label,
      regionType: 'metro',
      minLat: Number(customer.latitude),
      maxLat: Number(customer.latitude),
      minLon: Number(customer.longitude),
      maxLon: Number(customer.longitude),
      customerCount: 0,
      lifetimeValueTotal: 0,
      orderCount: 0,
      socialOrderCount: 0,
      revenue: 0,
    };

    group.customerCount += 1;
    group.lifetimeValueTotal += Number(customer.lifetime_value) || 0;
    group.minLat = Math.min(group.minLat, Number(customer.latitude));
    group.maxLat = Math.max(group.maxLat, Number(customer.latitude));
    group.minLon = Math.min(group.minLon, Number(customer.longitude));
    group.maxLon = Math.max(group.maxLon, Number(customer.longitude));
    groups.set(key, group);
  }

  for (const order of orders) {
    const customer = customersById.get(normalizeSourceId(order.customer_id));
    if (!customer) continue;
    const city = String(customer.city || '').trim();
    const state = String(customer.state_province || '').trim();
    const country = String(customer.country || 'US').trim();
    const key = city && state ? `${city}|${state}|${country}` : `${state || country}|${country}`;
    const group = groups.get(key);
    if (!group) continue;

    group.orderCount += 1;
    if (order.social_source_id) group.socialOrderCount += 1;
    group.revenue += Number(order.order_total) || 0;
  }

  return [...groups.values()]
    .map((group) => {
      const latPadding = Math.max(0.15, (group.maxLat - group.minLat) * 0.2);
      const lonPadding = Math.max(0.15, (group.maxLon - group.minLon) * 0.2);
      const minLat = Math.max(-89.9, group.minLat - latPadding);
      const maxLat = Math.min(89.9, group.maxLat + latPadding);
      const minLon = Math.max(-179.9, group.minLon - lonPadding);
      const maxLon = Math.min(179.9, group.maxLon + lonPadding);
      const avgLifetimeValue = group.customerCount ? group.lifetimeValueTotal / group.customerCount : 0;

      return {
        regionName: group.regionName,
        regionType: group.regionType,
        boundaryWkt: `POLYGON((${minLon} ${minLat}, ${maxLon} ${minLat}, ${maxLon} ${maxLat}, ${minLon} ${maxLat}, ${minLon} ${minLat}))`,
        population: Math.max(group.customerCount * 10000, group.customerCount),
        avgIncome: roundTo(Math.max(45000, avgLifetimeValue * 8 || 55000), 2),
        socialDensity: roundTo((group.socialOrderCount / Math.max(group.customerCount, 1)) * 100, 2) || 0,
        demandIndex: roundTo(Math.min(99, 45 + (group.orderCount * 4) + (group.socialOrderCount * 6) + (group.revenue / 1000)), 2),
      };
    })
    .sort((left, right) => {
      const indexDelta = (right.demandIndex || 0) - (left.demandIndex || 0);
      if (indexDelta !== 0) return indexDelta;
      return left.regionName.localeCompare(right.regionName);
    })
    .slice(0, 12);
}

function buildFallbackDemandForecasts(dataset, demandRegionRows) {
  if (!demandRegionRows.length) return [];

  const products = dataset.tables.products.rows;
  const orderItems = dataset.tables.order_items.rows;
  const posts = dataset.tables.social_posts.rows;
  const mentions = dataset.tables.post_product_mentions.rows;
  const postsById = buildSourceRowMap(posts, 'post_id');

  const metricsByProduct = new Map();
  for (const product of products) {
    metricsByProduct.set(normalizeSourceId(product.product_id), {
      productId: normalizeSourceId(product.product_id),
      orderedQuantity: 0,
      mentionCount: 0,
      totalVirality: 0,
      socialPostCount: 0,
    });
  }

  for (const item of orderItems) {
    const productId = normalizeSourceId(item.product_id);
    const metrics = metricsByProduct.get(productId);
    if (!metrics) continue;
    metrics.orderedQuantity += Number(item.quantity) || 0;
  }

  for (const mention of mentions) {
    const productId = normalizeSourceId(mention.product_id);
    const metrics = metricsByProduct.get(productId);
    const post = postsById.get(normalizeSourceId(mention.post_id));
    if (!metrics || !post) continue;
    metrics.mentionCount += 1;
    metrics.totalVirality += Number(post.virality_score) || 0;
    metrics.socialPostCount += 1;
  }

  const regions = demandRegionRows.slice(0, Math.min(5, demandRegionRows.length));
  const forecastDate = new Date();
  forecastDate.setHours(0, 0, 0, 0);
  const rows = [];

  for (const metrics of metricsByProduct.values()) {
    const avgVirality = metrics.socialPostCount ? metrics.totalVirality / metrics.socialPostCount : 0;
    const baseDemand = Math.max(5, Math.round((metrics.orderedQuantity * 1.2) + (metrics.mentionCount * 2) + (avgVirality / 8)));
    const socialFactor = roundTo(Math.min(3, 1 + (metrics.mentionCount / 10) + (avgVirality / 100)), 2) || 1;

    for (const region of regions) {
      const regionMultiplier = (Number(region.demandIndex) || 50) / 50;
      const predictedDemand = Math.max(5, Math.round(baseDemand * regionMultiplier));
      rows.push({
        productId: metrics.productId,
        region: region.regionName,
        forecastDate,
        predictedDemand,
        confidenceLow: Math.max(0, Math.round(predictedDemand * 0.8)),
        confidenceHigh: Math.round(predictedDemand * 1.2),
        socialFactor,
        modelVersion: 'import_fallback_v1',
        explanation: JSON.stringify({
          source: 'import_fallback_v1',
          orderedQuantity: metrics.orderedQuantity,
          mentionCount: metrics.mentionCount,
          avgVirality: roundTo(avgVirality, 2),
          regionDemandIndex: region.demandIndex,
        }),
      });
    }
  }

  return rows;
}

async function insertFallbackBrandLinks(connection, rows, idMaps) {
  let inserted = 0;
  for (const row of rows) {
    await execSql(connection, `
      INSERT INTO brand_influencer_links (
        brand_id, influencer_id, relationship_type, post_count,
        avg_engagement, revenue_attributed, first_mention, last_mention
      ) VALUES (
        :brandId, :influencerId, :relationshipType, :postCount,
        :avgEngagement, :revenueAttributed, :firstMention, :lastMention
      )
    `, {
      brandId: resolveMappedValue(row.brandId, 'brands', idMaps, 'brand_influencer_links', 'brand_id', 'fallback'),
      influencerId: resolveMappedValue(row.influencerId, 'influencers', idMaps, 'brand_influencer_links', 'influencer_id', 'fallback'),
      relationshipType: row.relationshipType,
      postCount: row.postCount,
      avgEngagement: row.avgEngagement,
      revenueAttributed: row.revenueAttributed,
      firstMention: row.firstMention,
      lastMention: row.lastMention,
    });
    inserted += 1;
  }
  return inserted;
}

async function insertFallbackInfluencerConnections(connection, rows, idMaps) {
  let inserted = 0;
  for (const row of rows) {
    await execSql(connection, `
      INSERT INTO influencer_connections (
        from_influencer, to_influencer, connection_type, strength,
        interaction_count, first_seen, last_interaction
      ) VALUES (
        :fromInfluencer, :toInfluencer, :connectionType, :strength,
        :interactionCount, :firstSeen, :lastInteraction
      )
    `, {
      fromInfluencer: resolveMappedValue(row.fromInfluencer, 'influencers', idMaps, 'influencer_connections', 'from_influencer', 'fallback'),
      toInfluencer: resolveMappedValue(row.toInfluencer, 'influencers', idMaps, 'influencer_connections', 'to_influencer', 'fallback'),
      connectionType: row.connectionType,
      strength: row.strength,
      interactionCount: row.interactionCount,
      firstSeen: row.firstSeen,
      lastInteraction: row.lastInteraction,
    });
    inserted += 1;
  }
  return inserted;
}

async function insertFallbackDemandRegions(connection, rows) {
  let inserted = 0;
  for (const row of rows) {
    await execSql(connection, `
      INSERT INTO demand_regions (
        region_name, region_type, boundary, population,
        avg_income, social_density, demand_index, updated_at
      ) VALUES (
        :regionName, :regionType, SDO_UTIL.FROM_WKTGEOMETRY(:boundaryWkt), :population,
        :avgIncome, :socialDensity, :demandIndex, SYSTIMESTAMP
      )
    `, row);
    inserted += 1;
  }
  return inserted;
}

async function insertFallbackDemandForecasts(connection, rows, idMaps) {
  let inserted = 0;
  for (const row of rows) {
    await execSql(connection, `
      INSERT INTO demand_forecasts (
        product_id, region, forecast_date, predicted_demand,
        confidence_low, confidence_high, social_factor, model_version,
        explanation, created_at
      ) VALUES (
        :productId, :region, :forecastDate, :predictedDemand,
        :confidenceLow, :confidenceHigh, :socialFactor, :modelVersion,
        :explanation, SYSTIMESTAMP
      )
    `, {
      productId: resolveMappedValue(row.productId, 'products', idMaps, 'demand_forecasts', 'product_id', 'fallback'),
      region: row.region,
      forecastDate: row.forecastDate,
      predictedDemand: row.predictedDemand,
      confidenceLow: row.confidenceLow,
      confidenceHigh: row.confidenceHigh,
      socialFactor: row.socialFactor,
      modelVersion: row.modelVersion,
      explanation: row.explanation,
    });
    inserted += 1;
  }
  return inserted;
}

async function insertFallbackShipments(connection, rows) {
  let inserted = 0;
  for (const row of rows) {
    await execSql(connection, `
      INSERT INTO shipments (
        order_id, center_id, carrier, tracking_number, ship_status,
        distance_km, estimated_hours, ship_cost, shipped_at, delivered_at, created_at
      ) VALUES (
        :orderId, :centerId, :carrier, :trackingNumber, :shipStatus,
        :distanceKm, :estimatedHours, :shipCost, :shippedAt, :deliveredAt, :createdAt
      )
    `, row);
    inserted += 1;
  }
  return inserted;
}

function buildFallbackShipments(dataset, idMaps) {
  const orders = dataset.tables.orders.rows;
  const customersById = buildSourceRowMap(dataset.tables.customers.rows, 'customer_id');
  const centersById = buildSourceRowMap(dataset.tables.fulfillment_centers.rows, 'center_id');
  const carriers = ['FedEx', 'UPS', 'USPS', 'DHL'];
  const shipStatusMap = {
    confirmed: 'preparing',
    processing: 'packed',
    shipped: 'in_transit',
    delivered: 'delivered',
    returned: 'exception',
  };

  const rows = [];
  for (const order of orders) {
    const orderStatus = String(order.order_status || 'pending').toLowerCase();
    const centerSourceId = normalizeSourceId(order.fulfillment_center_id);
    if (!centerSourceId || ['pending', 'cancelled'].includes(orderStatus)) continue;

    const customer = customersById.get(normalizeSourceId(order.customer_id));
    const center = centersById.get(centerSourceId);
    if (!center) continue;

    const shipLat = Number.isFinite(Number(order.shipping_lat)) ? Number(order.shipping_lat) : Number(customer?.latitude);
    const shipLon = Number.isFinite(Number(order.shipping_lon)) ? Number(order.shipping_lon) : Number(customer?.longitude);
    const distanceKm = haversineKm(center.latitude, center.longitude, shipLat, shipLon);
    const estimatedHours = distanceKm == null ? null : roundTo(Math.max(1, distanceKm / 80), 1);
    const createdAt = pickOrderTimestamp(order);
    const shippedAt = createdAt ? new Date(createdAt.getTime() + (6 * 60 * 60 * 1000)) : null;
    const deliveredAt = orderStatus === 'delivered' && shippedAt && estimatedHours != null
      ? new Date(shippedAt.getTime() + (estimatedHours * 60 * 60 * 1000))
      : null;
    const actualOrderId = idMaps.orders.get(normalizeSourceId(order.order_id));
    const actualCenterId = idMaps.fulfillment_centers.get(centerSourceId);
    if (actualOrderId == null || actualCenterId == null) continue;

    rows.push({
      orderId: actualOrderId,
      centerId: actualCenterId,
      carrier: carriers[hashString(order.order_id) % carriers.length],
      trackingNumber: `AUTO-${String(actualOrderId).padStart(8, '0')}`,
      shipStatus: shipStatusMap[orderStatus] || 'preparing',
      distanceKm: distanceKm == null ? null : roundTo(distanceKm, 2),
      estimatedHours,
      shipCost: distanceKm == null ? 9.99 : roundTo(Math.max(4.99, distanceKm * 0.12), 2),
      shippedAt,
      deliveredAt,
      createdAt: createdAt || new Date(),
    });
  }

  return rows;
}

async function applyOptionalFallbacks(connection, dataset, idMaps, warnings, progress) {
  const fallbackSummary = {};
  let generatedDemandRegions = [];

  if (!dataset.tables.brand_influencer_links.provided) {
    const rows = buildFallbackBrandLinks(dataset);
    fallbackSummary.brand_influencer_links = await insertFallbackBrandLinks(connection, rows, idMaps);
    if (!rows.length) warnings.push('No fallback brand_influencer_links could be derived from the uploaded posts and mentions.');
  }

  if (!dataset.tables.influencer_connections.provided) {
    const rows = buildFallbackInfluencerConnections(dataset);
    fallbackSummary.influencer_connections = await insertFallbackInfluencerConnections(connection, rows, idMaps);
    if (!rows.length) warnings.push('No fallback influencer_connections could be derived from the uploaded dataset.');
  }

  if (!dataset.tables.demand_regions.provided) {
    if (progress) {
      await progress({ status: 'running', progress: 65, message: 'Generating fallback demand regions...' });
    }
    generatedDemandRegions = buildFallbackDemandRegions(dataset);
    fallbackSummary.demand_regions = await insertFallbackDemandRegions(connection, generatedDemandRegions);
    if (!generatedDemandRegions.length) warnings.push('No fallback demand_regions could be generated because customer geospatial data was missing.');
  }

  if (!dataset.tables.demand_forecasts.provided) {
    if (progress) {
      await progress({ status: 'running', progress: 70, message: 'Generating fallback demand forecasts...' });
    }
    const regionRows = dataset.tables.demand_regions.provided
      ? dataset.tables.demand_regions.rows.map((row) => ({
          regionName: row.region_name,
          demandIndex: row.demand_index,
        }))
      : generatedDemandRegions.map((row) => ({
          regionName: row.regionName,
          demandIndex: row.demandIndex,
        }));
    const forecastRows = buildFallbackDemandForecasts(dataset, regionRows);
    fallbackSummary.demand_forecasts = await insertFallbackDemandForecasts(connection, forecastRows, idMaps);
    if (!forecastRows.length) warnings.push('No fallback demand_forecasts could be generated.');
  }

  if (!dataset.tables.shipments.provided) {
    if (progress) {
      await progress({ status: 'running', progress: 75, message: 'Generating fallback shipments...' });
    }
    const shipmentRows = buildFallbackShipments(dataset, idMaps);
    fallbackSummary.shipments = await insertFallbackShipments(connection, shipmentRows);
    if (!shipmentRows.length) warnings.push('No fallback shipments were generated because the uploaded orders did not require shipments.');
  }

  return fallbackSummary;
}

async function isVectorModelAvailable(connection) {
  try {
    const result = await execSql(connection, `
      SELECT COUNT(*) AS model_count
      FROM user_mining_models
      WHERE model_name = :modelName
    `, { modelName: VECTOR_MODEL_NAME });
    return Number(result.rows[0]?.MODEL_COUNT || 0) > 0;
  } catch (_) {
    return false;
  }
}

async function regenerateVectorArtifacts(connection, {
  generationId,
  datasetFingerprint,
}) {
  const summary = {};

  const productEmbeddings = await execSql(connection, `
    INSERT INTO product_embeddings (
      product_id, embedding_model, embedding_text, embedding
    )
    SELECT p.product_id,
           'all_MiniLM_L12_v2',
           TO_CLOB(p.product_name) || ' ' || NVL(p.category, '') || ' ' ||
             p.description || ' ' || b.brand_name,
           VECTOR_EMBEDDING(${VECTOR_MODEL_NAME} USING
             TO_CLOB(p.product_name) || ' ' || NVL(p.category, '') || ' ' ||
             p.description || ' ' || b.brand_name AS DATA)
    FROM products p
    JOIN brands b ON b.brand_id = p.brand_id
  `);
  summary.product_embeddings = productEmbeddings.rowsAffected || 0;

  const postEmbeddings = await execSql(connection, `
    INSERT INTO post_embeddings (
      post_id, embedding_model, embedding_text, embedding
    )
    SELECT sp.post_id,
           'all_MiniLM_L12_v2',
           TO_CLOB(DBMS_LOB.SUBSTR(sp.post_text, 500, 1)),
           VECTOR_EMBEDDING(${VECTOR_MODEL_NAME} USING
             TO_CLOB(DBMS_LOB.SUBSTR(sp.post_text, 500, 1)) AS DATA)
    FROM social_posts sp
  `);
  summary.post_embeddings = postEmbeddings.rowsAffected || 0;

  const semanticMatches = await execSql(connection, `
    INSERT INTO semantic_matches (post_id, product_id, similarity_score, match_rank, match_method)
    SELECT post_id, product_id, similarity_score, match_rank, 'vector'
    FROM (
      SELECT pe.post_id,
             pre.product_id,
             ROUND(1 - VECTOR_DISTANCE(pe.embedding, pre.embedding, COSINE), 5) AS similarity_score,
             ROW_NUMBER() OVER (
               PARTITION BY pe.post_id
               ORDER BY VECTOR_DISTANCE(pe.embedding, pre.embedding, COSINE),
                        pre.product_id
             ) AS match_rank
      FROM post_embeddings pe
      JOIN social_posts sp ON sp.post_id = pe.post_id
      CROSS JOIN product_embeddings pre
      WHERE sp.momentum_flag IN ('viral', 'mega_viral')
    )
    WHERE match_rank <= 3
  `);
  summary.semantic_matches = semanticMatches.rowsAffected || 0;

  await execSql(connection, `
    BEGIN
      retail_return_evidence_pkg.rebuild(:generationId);
    END;
  `, { generationId });
  const returnEvidence = await execSql(connection, `
    SELECT COUNT(*) AS evidence_count
    FROM return_evidence_index
    WHERE generation_id = :generationId
  `, { generationId });
  summary.return_evidence_index = Number(
    returnEvidence.rows?.[0]?.EVIDENCE_COUNT || 0
  );

  await execSql(connection, `
    DELETE FROM app_vector_generation_evidence
    WHERE generation_id = :generationId
  `, { generationId });

  await execSql(connection, `
    INSERT INTO app_vector_generation_evidence (
      generation_id, dataset_fingerprint, entity_type, entity_id,
      source_hash, vector_hash, model_name
    )
    SELECT :generationId, :datasetFingerprint, 'PRODUCT', p.product_id,
           RAWTOHEX(
             STANDARD_HASH(
               DBMS_LOB.SUBSTR(
                 TO_CLOB(p.product_name) || ' ' ||
                 NVL(p.category, '') || ' ' ||
                 p.description || ' ' || b.brand_name,
                 32767,
                 1
               ),
               'SHA256'
             )
           ),
           retail_vector_serialization_sha256(pe.embedding),
           :modelName
    FROM products p
    JOIN brands b ON b.brand_id = p.brand_id
    JOIN product_embeddings pe ON pe.product_id = p.product_id
  `, {
    generationId,
    datasetFingerprint,
    modelName: VECTOR_MODEL_NAME,
  });

  await execSql(connection, `
    INSERT INTO app_vector_generation_evidence (
      generation_id, dataset_fingerprint, entity_type, entity_id,
      source_hash, vector_hash, model_name
    )
    SELECT :generationId, :datasetFingerprint, 'POST', sp.post_id,
           RAWTOHEX(
             STANDARD_HASH(
               DBMS_LOB.SUBSTR(sp.post_text, 500, 1),
               'SHA256'
             )
           ),
           retail_vector_serialization_sha256(pe.embedding),
           :modelName
    FROM social_posts sp
    JOIN post_embeddings pe ON pe.post_id = sp.post_id
  `, {
    generationId,
    datasetFingerprint,
    modelName: VECTOR_MODEL_NAME,
  });

  await execSql(connection, `
    INSERT INTO app_vector_generation_evidence (
      generation_id, dataset_fingerprint, entity_type, entity_id,
      source_hash, vector_hash, model_name
    )
    SELECT :generationId, :datasetFingerprint, 'MATCH', sm.match_id,
           RAWTOHEX(
             STANDARD_HASH(
               TO_CHAR(sm.post_id) || ':' || TO_CHAR(sm.product_id) || ':' ||
               TO_CHAR(sm.match_rank) || ':' ||
               TO_CHAR(
                 sm.similarity_score,
                 'FM9999999990D00000',
                 'NLS_NUMERIC_CHARACTERS=''.,'''
               ) || ':' || sm.match_method,
               'SHA256'
             )
           ),
           RAWTOHEX(
             STANDARD_HASH(
               TO_CHAR(sm.post_id) || ':' || TO_CHAR(sm.product_id) || ':' ||
               TO_CHAR(sm.match_rank) || ':' ||
               TO_CHAR(
                 sm.similarity_score,
                 'FM9999999990D00000',
                 'NLS_NUMERIC_CHARACTERS=''.,'''
               ) || ':' || sm.match_method,
               'SHA256'
             )
           ),
           :modelName
    FROM semantic_matches sm
  `, {
    generationId,
    datasetFingerprint,
    modelName: VECTOR_MODEL_NAME,
  });

  const evidence = await readVectorEvidence(
    (sql, binds = {}) => execSql(connection, sql, binds),
    {
      generationId,
      datasetFingerprint,
      validateCurrentModel: true,
    }
  );
  const assessment = assertVectorEvidence(evidence);
  if (assessment.scopedEmpty) {
    throw new VectorEvidenceError(
      'Restore cannot validate native Vector artifacts through an empty scope.',
      evidence
    );
  }
  summary.vector_evidence = {
    products: evidence.sourceProducts,
    product_vectors: evidence.productVectors,
    posts: evidence.sourcePosts,
    post_vectors: evidence.postVectors,
    semantic_matches: evidence.semanticMatches,
    expected_semantic_matches: evidence.expectedMatches,
  };

  return summary;
}

function summarizeCounts(insertedCounts, fallbackCounts, zonesCreated) {
  return {
    inserted: insertedCounts,
    generated: {
      ...fallbackCounts,
      fulfillment_zones: zonesCreated,
    },
  };
}

async function executeImportPlan({
  dataset,
  dryRun = false,
  progress = null,
  refreshDemoDates = false,
  candidateGeneration = null,
  jobId = null,
  datasetSource = null,
  operation = 'dataset_operation',
  completeMessage = 'Dataset activation completed.',
  failurePhase = null,
  objectStorageFailure = null,
  assertLeaseOwned = null,
  verifyLeaseOwned = null,
}) {
  let connection;
  const warnings = [];
  let candidateOml = null;
  const assertOwnership = () => {
    if (typeof assertLeaseOwned === 'function') assertLeaseOwned();
  };
  const verifyOwnership = async () => {
    assertOwnership();
    if (typeof verifyLeaseOwned === 'function') await verifyLeaseOwned();
    assertOwnership();
  };

  try {
    await verifyOwnership();
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    await verifyOwnership();

    if (!dryRun) {
      if (progress) await progress({
        status: 'running', phase: 'INVENTORY_MODELS', progress: 4,
        message: 'Registering the complete candidate OML asset plan...',
      });
      const plannedModels = await registerCandidateOmlInventoryBeforeTraining(
        connection,
        candidateGeneration,
        { failurePhase }
      );
      assertOwnership();
      if (progress) await progress({
        status: 'running', phase: 'STAGING_TRAINING_ROWS', progress: 6,
        message: 'Staging generation-keyed Oracle Machine Learning training rows...',
      });
      const trainingSets = await stageCandidateTrainingRows(
        connection,
        dataset,
        candidateGeneration,
        { failurePhase }
      );
      assertOwnership();
      if (progress) await progress({
        status: 'running', phase: 'STAGING_MODELS', progress: 8,
        message: 'Training generation-specific Oracle Machine Learning models...',
      });
      // Candidate model DDL reads only committed, inactive generation rows and
      // happens before any active-row DML. Its transaction boundary therefore
      // cannot publish or partially commit the replacement dataset.
      candidateOml = await stageCandidateOmlModels(
        connection,
        candidateGeneration,
        trainingSets,
        { failurePhase, plannedModels }
      );
      await verifyOwnership();
    }

    assertOwnership();
    if (progress) await progress({ status: 'running', progress: 10, message: 'Clearing existing importable data...' });
    await deleteExistingImportData(connection);

    if (progress) await progress({ status: 'running', progress: 20, message: 'Loading required and provided optional tables...' });
    const { idMaps, insertedCounts } = await insertProvidedTables(connection, dataset, progress);
    await verifyOwnership();

    if (progress) await progress({ status: 'running', progress: 55, message: 'Rebuilding spatial point geometry...' });
    await rebuildSpatialLocations(connection);

    const fallbackCounts = await applyOptionalFallbacks(connection, dataset, idMaps, warnings, progress);
    await verifyOwnership();

    if (progress) await progress({ status: 'running', progress: 80, message: 'Rebuilding fulfillment zones...' });
    const zonesCreated = await rebuildFulfillmentZones(connection);
    assertOwnership();

    const demoDateRefresh = refreshDemoDates
      ? await refreshDemoDateWindow(connection, { requireDemoDatasetState: false })
      : null;

    const vectorAvailable = await isVectorModelAvailable(connection);
    if (!vectorAvailable) {
      throw new ImportError(`Required Oracle embedding model ${VECTOR_MODEL_NAME} is not available.`, 503);
    }

    const summary = summarizeCounts(insertedCounts, fallbackCounts, zonesCreated);
    if (demoDateRefresh?.shifted) {
      summary.generated = {
        ...summary.generated,
        demo_date_shift_days: demoDateRefresh.shifted_days,
      };
    }

    if (dryRun) {
      await verifyOwnership();
      await connection.rollback();
      return {
        warnings,
        summary,
      };
    }

    const datasetFingerprint = fingerprintCandidate(candidateOml);
    try {
      if (progress) await progress({ status: 'running', phase: 'DERIVING', progress: 88, message: 'Rebuilding required vector artifacts...' });
      await execSql(connection, 'SAVEPOINT import_vectors');
      summary.generated = {
        ...summary.generated,
        ...(await regenerateVectorArtifacts(connection, {
          generationId: candidateGeneration,
          datasetFingerprint,
        })),
      };
    } catch (err) {
      try { await execSql(connection, 'ROLLBACK TO import_vectors'); } catch (_) {}
      throw new ImportError(
        `Required Vector artifact rebuild failed: ${err.message}`,
        503,
        err.details || null
      );
    }

    try {
      failAtPhase(failurePhase, 'OML_BEFORE_VALIDATION', {
        generationId: candidateGeneration,
        jobId,
      });
      if (progress) await progress({ status: 'running', phase: 'VALIDATING', progress: 94, message: 'Validating staged Oracle Machine Learning models against candidate rows...' });
      const omlSummary = await validateCandidateOmlModels(connection, candidateOml);
      failAtPhase(failurePhase, 'OML_AFTER_VALIDATION', {
        generationId: candidateGeneration,
        jobId,
        modelsValidated: omlSummary.modelsValidated,
      });
      await verifyOwnership();
      summary.generated = {
        ...summary.generated,
        oml_models: omlSummary.modelsValidated,
      };
    } catch (err) {
      throw new ImportError(`Required Oracle Machine Learning rebuild failed: ${err.message}`, 503);
    }

    assertOwnership();
    await execSql(connection, `
      MERGE INTO event_stream target
      USING (
        SELECT 'retail-native-json-' || :generationId correlation_id,
               JSON_OBJECT(
                 'domain' VALUE 'retail',
                 'event' VALUE 'dataset_ready',
                 'feature' VALUE 'native_json',
                 'generationId' VALUE :generationId,
                 'jobId' VALUE :jobId,
                 'datasetFingerprint' VALUE :datasetFingerprint
                 RETURNING JSON
               ) event_data
        FROM dual
      ) source
      ON (target.correlation_id = source.correlation_id)
      WHEN MATCHED THEN UPDATE SET
        target.event_type = 'dataset_ready',
        target.event_source = 'dataset_lifecycle',
        target.event_data = source.event_data,
        target.processed = 0
      WHEN NOT MATCHED THEN INSERT (
        event_type, event_source, event_data, correlation_id, processed
      ) VALUES (
        'dataset_ready', 'dataset_lifecycle', source.event_data,
        source.correlation_id, 0
      )
    `, {
      generationId: candidateGeneration,
      jobId,
      datasetFingerprint,
    });
    failAtPhase(failurePhase, 'NATIVE_JSON', {
      generationId: candidateGeneration,
      jobId,
      datasetFingerprint,
    });
    const inmemoryProof = await proveInMemoryOnConnection(connection, {
      generationId: candidateGeneration,
      jobId,
      datasetFingerprint,
    });
    failAtPhase(failurePhase, 'INMEMORY', {
      generationId: candidateGeneration,
      jobId,
      proofId: inmemoryProof?.proofId || null,
    });
    const featurePlanProofs = await proveFeaturePlansOnConnection(connection, {
      generationId: candidateGeneration,
      jobId,
      datasetFingerprint,
    });
    failAtPhase(failurePhase, 'VECTOR', {
      generationId: candidateGeneration,
      jobId,
      sqlId: featurePlanProofs?.vector?.sqlId || null,
      childNumber: featurePlanProofs?.vector?.childNumber ?? null,
    });
    failAtPhase(failurePhase, 'SPATIAL', {
      generationId: candidateGeneration,
      jobId,
      sqlId: featurePlanProofs?.spatial?.sqlId || null,
      childNumber: featurePlanProofs?.spatial?.childNumber ?? null,
    });
    const readiness = await assertRequiredFeatureReadiness(
      connection,
      candidateOml,
      candidateGeneration,
      datasetFingerprint,
      inmemoryProof,
      featurePlanProofs,
      failurePhase
    );
    await verifyOwnership();
    failAtPhase(failurePhase, 'PRE_ACTIVATION', {
      generationId: candidateGeneration,
      jobId,
    });
    await activateCandidateOmlModels(connection, candidateOml, jobId);
    assertOwnership();
    const activeDataset = buildDatasetState(datasetSource, IMPORT_VERSION);

    if (progress) await progress({
      status: 'running', phase: 'ACTIVATING', progress: 98,
      message: 'Atomically activating dataset, model registry, and readiness...',
    });
    await execSql(connection, `
      MERGE INTO app_dataset_state target
      USING (
        SELECT 1 state_id, :source active_source, :label active_label,
               :version active_version, :generationId active_generation_id
        FROM dual
      ) incoming
      ON (target.state_id = incoming.state_id)
      WHEN MATCHED THEN UPDATE SET
        target.active_source = incoming.active_source,
        target.active_label = incoming.active_label,
        target.active_version = incoming.active_version,
        target.active_generation_id = incoming.active_generation_id,
        target.updated_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (
        state_id, active_source, active_label, active_version,
        active_generation_id, updated_at
      ) VALUES (
        incoming.state_id, incoming.active_source, incoming.active_label,
        incoming.active_version, incoming.active_generation_id, SYSTIMESTAMP
      )
    `, {
      source: activeDataset.source,
      label: activeDataset.label,
      version: activeDataset.version,
      generationId: candidateGeneration,
    });
    await execSql(connection, `
      UPDATE app_dataset_readiness
      SET dataset_source = :source, dataset_version = :version, job_id = :jobId,
          status = 'ACTIVE', readiness = :readiness, failure_message = NULL,
          activated_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP
      WHERE readiness_id = 1
    `, {
      source: activeDataset.source,
      version: activeDataset.version,
      jobId,
      readiness: { val: readiness, type: db.oracledb.DB_TYPE_JSON },
    });
    await execSql(connection, `
      UPDATE app_dataset_jobs
      SET status = 'completed', progress = 100, message = :message,
          payload = JSON_MERGEPATCH(
            payload,
            JSON_OBJECT(
              'status' VALUE 'completed',
              'progress' VALUE 100,
              'message' VALUE :message,
              'phase' VALUE 'ACTIVATED',
              'candidateGeneration' VALUE :generationId
              RETURNING JSON
            )
          ),
          completed_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP
      WHERE job_id = :jobId
    `, { message: completeMessage, generationId: candidateGeneration, jobId });
    await enqueueOnConnection(connection, {
      eventId: eventIdFor(jobId, 'completed'),
      jobId,
      operation,
      datasetSource,
      status: 'completed',
      datasetVersion: activeDataset.version,
      objectStorageFailure,
    });

    // The active-generation boundary also persists the terminal outbox record.
    // If the process dies after this commit, startup delivery retries the same
    // deterministic Object Storage object rather than losing or duplicating it.
    await verifyOwnership();
    await connection.commit();
    failAtPhase(failurePhase, 'POST_COMMIT_PRE_DELIVERY', {
      generationId: candidateGeneration,
      jobId,
      completedEventId: eventIdFor(jobId, 'completed'),
    });

    try {
      const omlCleanup = await cleanupSupersededOmlAssets(connection);
      summary.generated = {
        ...summary.generated,
        oml_assets_cleaned: omlCleanup.assetsDropped,
      };
    } catch (cleanupError) {
      // Activation is already committed and must not be relabeled failed.
      // Durable SUPERSEDED inventory makes this cleanup retryable at startup.
      warnings.push(`Superseded OML asset cleanup is pending: ${cleanupError.message}`);
    }

    if (typeof ollamaAssistant?.invalidateMetadataCaches === 'function') {
      try {
        ollamaAssistant.invalidateMetadataCaches();
      } catch (_) {
        // Ignore cache invalidation failures; data import already succeeded.
      }
    }

    return {
      warnings,
      summary,
      readiness,
      activeDataset: {
        ...activeDataset,
        generationId: candidateGeneration,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      if (!dryRun && candidateGeneration) {
        try {
          await markOmlGenerationFailedAndCleanup(connection, candidateGeneration, err);
        } catch (cleanupError) {
          err.omlCleanupError = cleanupError.message;
        }
      }
    }
    if (err instanceof ImportError || err instanceof DatasetLeaseOwnershipLostError) throw err;
    throw new ImportError(err.message || 'Import failed.', 500);
  } finally {
    await db.releaseConnection(connection, { rollback: true, label: 'dataset import' });
  }
}

function formatValidationResult(result) {
  return {
    valid: result.valid,
    isValid: result.valid,
    success: result.valid,
    message: result.message,
    errors: result.errors,
    warnings: result.warnings,
    counts: result.counts,
  };
}

async function inferCurrentDatasetState() {
  const demoDataset = getBundledDemoDataset();
  let connection;

  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    const tableNames = Object.keys(demoDataset.parsed.counts);
    const liveCounts = {};

    for (const tableName of tableNames) {
      const result = await execSql(connection, `SELECT COUNT(*) AS cnt FROM ${tableName}`);
      liveCounts[tableName] = Number(result.rows[0]?.CNT || 0);
    }

    const matchesBundledDemo = tableNames.every(
      (tableName) => Number(demoDataset.parsed.counts[tableName] || 0) === Number(liveCounts[tableName] || 0)
    );

    return buildDatasetState(matchesBundledDemo ? 'demo' : 'custom');
  } finally {
    await db.releaseConnection(connection, { rollback: true, label: 'dataset inference' });
  }
}

async function getActiveDataset() {
  const stored = await getStoredDatasetState();
  if (!stored) {
    throw new ImportError(
      'Active dataset state is unavailable. Complete database bootstrap or recovery before serving dataset status.',
      503
    );
  }

  return {
    activeDataset: stored,
    activeOperation: await getActiveOperation(),
  };
}

async function persistDatasetState(source) {
  return saveDatasetState(buildDatasetState(source));
}

async function runDatasetValidation({ parsed, fileOnly = false, lockKind, lockMessage }) {
  if (!parsed.valid) {
    return formatValidationResult(parsed);
  }

  if (fileOnly) {
    return {
      ...formatValidationResult(parsed),
      message: 'Archive structure validation passed.',
    };
  }

  const validationId = `val_${crypto.randomUUID()}`;
  const validationLease = await acquireOperationLock(
    lockKind,
    lockMessage,
    validationId
  );
  const leaseGuard = startOperationHeartbeat({
    leaseToken: validationLease.leaseToken,
    jobId: validationId,
  });
  try {
    await leaseGuard.pulse();
    leaseGuard.assertOwned();
    const dryRun = await executeImportPlan({
      dataset: parsed.dataset,
      dryRun: true,
      refreshDemoDates: lockKind === 'validate_restore_demo',
      assertLeaseOwned: () => leaseGuard.assertOwned(),
      verifyLeaseOwned: () => leaseGuard.pulse(),
    });
    leaseGuard.assertOwned();

    return {
      ...formatValidationResult(parsed),
      valid: true,
      isValid: true,
      success: true,
      message: 'Validation passed. Dry run completed successfully.',
      warnings: [...parsed.warnings, ...dryRun.warnings],
      summary: dryRun.summary,
    };
  } catch (err) {
    if (err instanceof ImportError) {
      return {
        valid: false,
        isValid: false,
        success: false,
        message: err.message,
        errors: [err.message],
        warnings: parsed.warnings,
        counts: parsed.counts,
      };
    }
    throw err;
  } finally {
    await leaseGuard.stop();
    await endOperation({
      leaseToken: validationLease.leaseToken,
      jobId: validationId,
    });
  }
}

function createJobProgressHandler(jobId, leaseToken, leaseGuard) {
  return async (patch) => {
    leaseGuard.assertOwned();
    const operation = await updateOperation({
      leaseToken,
      jobId,
      progress: patch.progress,
      message: patch.message,
      status: patch.status,
    });
    if (!operation) {
      throw new DatasetLeaseOwnershipLostError(
        `Dataset operation lease ${leaseToken} was replaced during progress update.`
      );
    }
    leaseGuard.assertOwned();
    await updateJob(jobId, patch);
    leaseGuard.assertOwned();
  };
}

function oracleErrorNumber(error) {
  const direct = Number(error?.errorNum || 0);
  if (Number.isFinite(direct) && direct !== 0) return Math.abs(direct);
  const match = String(error?.message || error || '').match(/ORA-(\d+)/i);
  return match ? Number(match[1]) : 0;
}

async function proveVpdReadiness(connection, {
  generationId = null,
} = {}) {
  const admin = await execSql(connection, `
    SELECT
      SYS_CONTEXT('RETAIL_APP_CTX', 'AUTHENTICATED') authenticated,
      SYS_CONTEXT('RETAIL_APP_CTX', 'ROLE') role_name,
      SYS_CONTEXT('RETAIL_APP_CTX', 'ACCESS_SCOPE') access_scope,
      (SELECT COUNT(*) FROM orders) visible_orders,
      retail_vpd_inventory_pkg.protected_object_count()
        expected_protected_object_count,
      retail_vpd_inventory_pkg.installed_policy_count()
        expected_policy_count,
      (SELECT COUNT(*) FROM user_policies
       WHERE policy_name LIKE 'VPD_RT_%'
         AND policy_type = 'CONTEXT_SENSITIVE'
         AND enable = 'YES') policy_count,
      (SELECT COUNT(DISTINCT object_name) FROM user_policies
       WHERE policy_name LIKE 'VPD_RT_%'
         AND policy_type = 'CONTEXT_SENSITIVE'
         AND enable = 'YES') protected_object_count,
      (SELECT COUNT(*) FROM user_policies
       WHERE policy_name LIKE 'VPD_RT_%'
         AND policy_type = 'CONTEXT_SENSITIVE'
         AND enable = 'YES'
         AND sel = 'YES') select_policy_count,
      (SELECT COUNT(*) FROM user_policies
       WHERE policy_name LIKE 'VPD_RT_%'
         AND policy_type = 'CONTEXT_SENSITIVE'
         AND enable = 'YES'
         AND ins = 'YES' AND upd = 'YES' AND del = 'YES'
         AND chk_option = 'YES') checked_write_policy_count
    FROM dual
  `);
  const adminRow = admin.rows?.[0] || {};

  let regionalRow = {};
  let restrictedRow = {};
  try {
    await db.setSecurityContext(connection, 'fm_west_maria', {
      autoCommit: false,
    });
    const regional = await execSql(connection, `
      SELECT COUNT(*) visible_orders,
             NVL(SUM(
               CASE
                 WHEN UPPER(center.state_province) <> 'CALIFORNIA'
                   OR UPPER(customer.state_province) <> 'CALIFORNIA'
                 THEN 1 ELSE 0
               END
             ), 0) out_of_scope_orders
      FROM orders operation
      JOIN fulfillment_centers center
        ON center.center_id = operation.fulfillment_center_id
      JOIN customers customer
        ON customer.customer_id = operation.customer_id
    `);
    regionalRow = regional.rows?.[0] || {};

    await db.setSecurityContext(connection, 'viewer_sam', {
      autoCommit: false,
    });
    const restricted = await execSql(
      connection,
      'SELECT COUNT(*) visible_orders FROM orders'
    );
    restrictedRow = restricted.rows?.[0] || {};
  } finally {
    await db.setSecurityContext(connection, 'admin_jess', {
      autoCommit: false,
    });
  }

  const returnFixture = await execSql(connection, `
    SELECT MIN(return_id) return_id
    FROM return_requests
  `);
  const returnId = Number(returnFixture.rows?.[0]?.RETURN_ID || 0);
  if (!Number.isInteger(returnId) || returnId <= 0) {
    throw new ImportError(
      'A candidate Return request is required for VPD and Unified Audit proof.',
      503
    );
  }

  const auditStartedAt = new Date(Date.now() - 1000);
  const auditNonce = crypto.randomUUID().replace(/-/g, '');
  const allowedClientIdentifier =
    `retail-rst-audit-ok-${auditNonce}`.slice(0, 64);
  const deniedClientIdentifier =
    `retail-rst-audit-denied-${auditNonce}`.slice(0, 64);
  let allowedRows = 0;
  await execSql(connection, 'SAVEPOINT retail_audit_allowed');
  try {
    await db.setSecurityContext(connection, 'admin_jess', {
      autoCommit: false,
    });
    await execSql(
      connection,
      'BEGIN DBMS_SESSION.SET_IDENTIFIER(:clientIdentifier); END;',
      { clientIdentifier: allowedClientIdentifier }
    );
    const allowed = await execSql(connection, `
      INSERT INTO return_decisions (
        return_id, decision_type, decision_summary,
        confidence_score, created_by
      ) VALUES (
        :returnId, 'Request Info', :summary, 0.5, 'admin_jess'
      )
    `, {
      returnId,
      summary: `Restore Unified Audit allowed proof ${generationId || 'candidate'}`,
    });
    allowedRows = Number(allowed.rowsAffected || 0);
  } finally {
    try {
      await execSql(connection, 'ROLLBACK TO retail_audit_allowed');
    } finally {
      await db.setSecurityContext(connection, 'admin_jess', {
        autoCommit: false,
      });
    }
  }
  if (allowedRows !== 1) {
    throw new ImportError(
      'Admin Return decision was not accepted for Unified Audit success proof.',
      503
    );
  }

  let denialReturnCode = 0;
  await execSql(connection, 'SAVEPOINT retail_vpd_denial');
  try {
    await db.setSecurityContext(connection, 'analyst_raj', {
      autoCommit: false,
    });
    await execSql(
      connection,
      'BEGIN DBMS_SESSION.SET_IDENTIFIER(:clientIdentifier); END;',
      { clientIdentifier: deniedClientIdentifier }
    );
    try {
      await execSql(connection, `
        INSERT INTO return_decisions (
          return_id, decision_type, decision_summary,
          confidence_score, created_by
        ) VALUES (
          :returnId, 'Request Info', :summary, 0.5, 'analyst_raj'
        )
      `, {
        returnId,
        summary: `Restore VPD denial proof ${generationId || 'candidate'}`,
      });
    } catch (error) {
      denialReturnCode = oracleErrorNumber(error);
      if (denialReturnCode !== 28115) throw error;
    }
  } finally {
    try {
      await execSql(connection, 'ROLLBACK TO retail_vpd_denial');
    } finally {
      await db.setSecurityContext(connection, 'admin_jess', {
        autoCommit: false,
      });
    }
  }
  if (denialReturnCode !== 28115) {
    throw new ImportError(
      'Analyst Return decision was not denied by VPD update_check with ORA-28115.',
      503
    );
  }

  const proof = {
    authenticated: adminRow.AUTHENTICATED || null,
    role: String(adminRow.ROLE_NAME || '').toLowerCase(),
    accessScope: String(adminRow.ACCESS_SCOPE || '').toUpperCase(),
    policyCount: Number(adminRow.POLICY_COUNT || 0),
    protectedObjectCount: Number(adminRow.PROTECTED_OBJECT_COUNT || 0),
    selectPolicyCount: Number(adminRow.SELECT_POLICY_COUNT || 0),
    checkedWritePolicyCount: Number(
      adminRow.CHECKED_WRITE_POLICY_COUNT || 0
    ),
    expectedProtectedObjectCount: Number(
      adminRow.EXPECTED_PROTECTED_OBJECT_COUNT || 0
    ),
    expectedPolicyCount: Number(adminRow.EXPECTED_POLICY_COUNT || 0),
    adminVisibleOrders: Number(adminRow.VISIBLE_ORDERS || 0),
    regionalVisibleOrders: Number(regionalRow.VISIBLE_ORDERS || 0),
    regionalOutOfScopeOrders: Number(
      regionalRow.OUT_OF_SCOPE_ORDERS || 0
    ),
    restrictedVisibleOrders: Number(restrictedRow.VISIBLE_ORDERS || 0),
    allowedDml: {
      persona: 'admin_jess',
      objectName: 'RETURN_DECISIONS',
      action: 'INSERT',
      rowsAffected: allowedRows,
      returnCode: 0,
      clientIdentifier: allowedClientIdentifier,
      startedAt: auditStartedAt.toISOString(),
    },
    deniedDml: {
      persona: 'analyst_raj',
      objectName: 'RETURN_DECISIONS',
      action: 'INSERT',
      returnCode: denialReturnCode,
      clientIdentifier: deniedClientIdentifier,
      startedAt: auditStartedAt.toISOString(),
    },
  };
  proof.ready = proof.authenticated === 'Y'
    && proof.role === 'admin'
    && proof.accessScope === 'GLOBAL'
    && proof.expectedProtectedObjectCount > 0
    && proof.expectedPolicyCount === proof.expectedProtectedObjectCount * 2
    && proof.policyCount === proof.expectedPolicyCount
    && proof.protectedObjectCount === proof.expectedProtectedObjectCount
    && proof.selectPolicyCount === proof.expectedProtectedObjectCount
    && proof.checkedWritePolicyCount === proof.expectedPolicyCount
    && proof.adminVisibleOrders > proof.regionalVisibleOrders
    && proof.regionalVisibleOrders > 0
    && proof.regionalOutOfScopeOrders === 0
    && proof.restrictedVisibleOrders === 0
    && proof.allowedDml.rowsAffected === 1
    && proof.allowedDml.returnCode === 0
    && proof.deniedDml.returnCode === 28115;
  return {
    ...proof,
    auditStartedAt,
  };
}

async function proveUnifiedAuditReadiness(connection, vpdProof) {
  const deadline = Date.now() + 10000;
  let evidence = {
    policyRows: 0,
    enabledRows: 0,
    allowedRows: 0,
    allowedReturnCode: -1,
    deniedRows: 0,
    deniedReturnCode: 0,
  };
  do {
    const result = await execSql(connection, `
      BEGIN
        SYSTEM.RETAIL_AUDIT_EVIDENCE_PKG.PROVE_DENIAL(
          p_object_owner               => :objectOwner,
          p_allowed_client_identifier  => :allowedClientIdentifier,
          p_denied_client_identifier   => :deniedClientIdentifier,
          p_started_at                 => :startedAt,
          p_policy_rows                => :policyRows,
          p_enabled_rows               => :enabledRows,
          p_allowed_rows               => :allowedRows,
          p_allowed_return_code        => :allowedReturnCode,
          p_denied_rows                => :deniedRows,
          p_denied_return_code         => :deniedReturnCode
        );
      END;
    `, {
      objectOwner: String(process.env.ORACLE_USER || 'LIVESTACK').toUpperCase(),
      allowedClientIdentifier: vpdProof.allowedDml.clientIdentifier,
      deniedClientIdentifier: vpdProof.deniedDml.clientIdentifier,
      startedAt: vpdProof.auditStartedAt,
      policyRows: {
        dir: db.oracledb.BIND_OUT,
        type: db.oracledb.NUMBER,
      },
      enabledRows: {
        dir: db.oracledb.BIND_OUT,
        type: db.oracledb.NUMBER,
      },
      allowedRows: {
        dir: db.oracledb.BIND_OUT,
        type: db.oracledb.NUMBER,
      },
      allowedReturnCode: {
        dir: db.oracledb.BIND_OUT,
        type: db.oracledb.NUMBER,
      },
      deniedRows: {
        dir: db.oracledb.BIND_OUT,
        type: db.oracledb.NUMBER,
      },
      deniedReturnCode: {
        dir: db.oracledb.BIND_OUT,
        type: db.oracledb.NUMBER,
      },
    });
    evidence = {
      policyRows: Number(firstOutBind(result.outBinds?.policyRows) || 0),
      enabledRows: Number(firstOutBind(result.outBinds?.enabledRows) || 0),
      allowedRows: Number(firstOutBind(result.outBinds?.allowedRows) || 0),
      allowedReturnCode: Number(
        firstOutBind(result.outBinds?.allowedReturnCode) ?? -1
      ),
      deniedRows: Number(firstOutBind(result.outBinds?.deniedRows) || 0),
      deniedReturnCode: Number(
        firstOutBind(result.outBinds?.deniedReturnCode) || 0
      ),
    };
    if (evidence.policyRows === 4
        && evidence.enabledRows === 1
        && evidence.allowedRows > 0
        && evidence.allowedReturnCode === 0
        && evidence.deniedRows > 0
        && evidence.deniedReturnCode === 28115) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);

  return {
    policyName: 'RETAIL_OPERATION_AUDIT',
    evidenceBoundary: 'SYSTEM.RETAIL_AUDIT_EVIDENCE_PKG',
    startedAt: vpdProof.auditStartedAt.toISOString(),
    allowedClientIdentifier: vpdProof.allowedDml.clientIdentifier,
    deniedClientIdentifier: vpdProof.deniedDml.clientIdentifier,
    clientIdentifier: vpdProof.deniedDml.clientIdentifier,
    ...evidence,
    returnCode: evidence.deniedReturnCode,
    ready: evidence.policyRows === 4
      && evidence.enabledRows === 1
      && evidence.allowedRows > 0
      && evidence.allowedReturnCode === 0
      && evidence.deniedRows > 0
      && evidence.deniedReturnCode === 28115,
  };
}

async function assertRequiredFeatureReadiness(
  connection,
  candidateOml,
  candidateGeneration = null,
  datasetFingerprint = null,
  inmemoryProof = null,
  featurePlanProofs = null,
  failurePhase = null
) {
  const executeReadiness = (sql, binds = {}) => connection
    ? execSql(connection, sql, binds)
    : db.executeSystem(sql, binds);
  const candidateNames = candidateOml?.models?.map((model) => model.physicalName) || [];
  const candidateBinds = Object.fromEntries(candidateNames.map((name, index) => [`candidate${index}`, name]));
  const candidateList = candidateNames.length
    ? candidateNames.map((_, index) => `:candidate${index}`).join(',')
    : "''";
  let vectorAssessment;
  try {
    vectorAssessment = assertVectorEvidence(
      await readVectorEvidence(executeReadiness, {
        generationId: candidateGeneration,
        datasetFingerprint,
        validateCurrentModel: true,
      })
    );
  } catch (error) {
    throw new ImportError(
      `Required Oracle Vector evidence is incomplete: ${error.message}`,
      503,
      error.details || null
    );
  }
  if (vectorAssessment.scopedEmpty) {
    throw new ImportError(
      'Required Oracle Vector evidence cannot be validated through an empty scope.',
      503,
      vectorAssessment.evidence
    );
  }
  const result = await executeReadiness(`
    SELECT
      (SELECT COUNT(*) FROM user_mining_models
       WHERE model_name = 'ALL_MINILM_L12_V2'
          OR model_name IN (${candidateList})) AS model_count,
      (SELECT COUNT(*) FROM user_json_duality_views
       WHERE view_name IN ('ORDERS_DV','PRODUCTS_INVENTORY_DV')) AS duality_count,
      (SELECT COUNT(*) FROM user_property_graphs
       WHERE graph_name = 'INFLUENCER_NETWORK') AS graph_count,
      (SELECT COUNT(*) FROM user_indexes
       WHERE index_name IN ('IDX_FC_SPATIAL','IDX_CUST_SPATIAL')
         AND status = 'VALID') AS spatial_index_count,
      (SELECT COUNT(*) FROM retail_native_json_evidence_v
       WHERE feature_name = 'native_json' AND has_event = 'YES'
         AND generation_id = :candidateGeneration
         AND dataset_fingerprint = :datasetFingerprint) AS native_json_count,
      (SELECT COUNT(*) FROM user_policies
       WHERE policy_name LIKE 'VPD_RT_%'
         AND policy_type = 'CONTEXT_SENSITIVE'
         AND enable = 'YES') AS vpd_policy_count,
      (SELECT populated_segments FROM app_inmemory_generation_evidence
       WHERE generation_id = :candidateGeneration
         AND dataset_fingerprint = :datasetFingerprint
         AND evidence_status = 'ACTIVE') AS inmemory_table_count,
      (SELECT COUNT(*) FROM app_feature_plan_evidence
       WHERE generation_id = :candidateGeneration
         AND dataset_fingerprint = :datasetFingerprint
         AND (
           (feature_name = 'VECTOR'
             AND object_name = 'PRODUCT_EMBEDDINGS'
             AND index_name = 'IDX_PRODUCT_VEC'
             AND plan_operation LIKE '%VECTOR INDEX%'
             AND plan_hash_value >= 0
             AND REGEXP_LIKE(sql_id, '^[0-9a-z]{13}$', 'c'))
           OR
           (feature_name = 'SPATIAL'
             AND object_name = 'FULFILLMENT_CENTERS'
             AND index_name = 'IDX_FC_SPATIAL'
             AND plan_operation LIKE '%DOMAIN INDEX%'
             AND plan_hash_value >= 0
             AND REGEXP_LIKE(sql_id, '^[0-9a-z]{13}$', 'c'))
         )) AS feature_plan_evidence_count,
      (SELECT COUNT(*) FROM dba_context
       WHERE namespace = 'RETAIL_APP_CTX'
         AND schema = USER
         AND package = 'RETAIL_SECURITY_PKG') AS trusted_context_count,
      (SELECT COUNT(*) FROM product_embeddings) AS product_vector_count,
      (SELECT COUNT(*) FROM products) AS product_count,
      (SELECT COUNT(*) FROM post_embeddings) AS post_vector_count,
      (SELECT COUNT(*) FROM social_posts) AS post_count,
      (SELECT COUNT(*) FROM semantic_matches) AS semantic_match_count,
      (SELECT COUNT(*) FROM return_evidence_index
       WHERE generation_id = :candidateGeneration) AS return_evidence_count,
      ((SELECT COUNT(*) * 2 FROM return_requests) +
       (SELECT COUNT(*) FROM return_documents) +
       (SELECT COUNT(*) FROM return_events) +
       (SELECT COUNT(*) FROM return_decisions) +
       (SELECT COUNT(*)
        FROM return_requests rr
        JOIN return_policy_clauses policy
          ON policy.clause_code = rr.policy_clause)) AS expected_return_evidence_count,
      (SELECT COUNT(*) FROM return_evidence_index evidence
       WHERE evidence.generation_id <> :candidateGeneration
          OR evidence.embedding IS NULL
          OR VECTOR_DIMENSION_COUNT(evidence.embedding) <> 384
          OR UPPER(VECTOR_DIMENSION_FORMAT(evidence.embedding)) <> 'FLOAT32'
          OR evidence.embedding_model <> 'ALL_MINILM_L12_V2'
          OR evidence.embedding_dimensions <> 384
          OR evidence.content_hash IS NULL
          OR LENGTH(evidence.content_hash) <> 64
          OR evidence.evidence_text IS NULL
          OR DBMS_LOB.GETLENGTH(evidence.evidence_text) = 0) AS invalid_return_evidence_count
    FROM dual
  `, { ...candidateBinds, candidateGeneration, datasetFingerprint });
  const row = result.rows?.[0] || {};
  const readiness = {
    generationId: candidateGeneration,
    datasetFingerprint,
    inMemoryProofId: inmemoryProof?.proofId || null,
    vectorAndOmlModels: Number(row.MODEL_COUNT || 0),
    dualityViews: Number(row.DUALITY_COUNT || 0),
    propertyGraphs: Number(row.GRAPH_COUNT || 0),
    spatialIndexes: Number(row.SPATIAL_INDEX_COUNT || 0),
    nativeJsonRows: Number(row.NATIVE_JSON_COUNT || 0),
    vpdPolicies: Number(row.VPD_POLICY_COUNT || 0),
    inmemoryTables: Number(row.INMEMORY_TABLE_COUNT || 0),
    featurePlanEvidence: Number(row.FEATURE_PLAN_EVIDENCE_COUNT || 0),
    auditPolicies: 0,
    trustedContexts: Number(row.TRUSTED_CONTEXT_COUNT || 0),
    productVectors: Number(row.PRODUCT_VECTOR_COUNT || 0),
    products: Number(row.PRODUCT_COUNT || 0),
    postVectors: Number(row.POST_VECTOR_COUNT || 0),
    posts: Number(row.POST_COUNT || 0),
    semanticMatches: Number(row.SEMANTIC_MATCH_COUNT || 0),
    returnEvidenceVectors: Number(row.RETURN_EVIDENCE_COUNT || 0),
    expectedReturnEvidenceVectors: Number(
      row.EXPECTED_RETURN_EVIDENCE_COUNT || 0
    ),
    invalidReturnEvidenceVectors: Number(
      row.INVALID_RETURN_EVIDENCE_COUNT || 0
    ),
    vectorEvidence: vectorAssessment.evidence,
  };
  const executionProofs = await Promise.all([
    executeReadiness(`SELECT DATA FROM orders_dv FETCH FIRST 1 ROW ONLY`),
    executeReadiness(`SELECT DATA FROM products_inventory_dv FETCH FIRST 1 ROW ONLY`),
    executeReadiness(`SELECT COUNT(*) edge_count
                      FROM GRAPH_TABLE (influencer_network
                        MATCH (a IS influencer)-[e IS connects_to]->(b IS influencer)
                        COLUMNS (a.influencer_id AS source_id, b.influencer_id AS target_id))`),
  ]);
  const vpdProofWithBind = await proveVpdReadiness(connection, {
    generationId: candidateGeneration,
  });
  const { auditStartedAt: _auditStartedAt, ...vpdProof } = vpdProofWithBind;
  readiness.vpdProof = vpdProof;
  failAtPhase(failurePhase, 'VPD', {
    generationId: candidateGeneration,
    policyCount: readiness.vpdPolicies,
    trustedContextCount: readiness.trustedContexts,
    deniedReturnCode: vpdProof.deniedDml.returnCode,
  });
  failAtPhase(failurePhase, 'DUALITY', {
    generationId: candidateGeneration,
    viewCount: readiness.dualityViews,
    orderRows: executionProofs[0]?.rows?.length || 0,
    productRows: executionProofs[1]?.rows?.length || 0,
  });
  failAtPhase(failurePhase, 'GRAPH', {
    generationId: candidateGeneration,
    graphCount: readiness.propertyGraphs,
    edgeCount: Number(executionProofs[2]?.rows?.[0]?.EDGE_COUNT || 0),
  });
  const auditProof = await proveUnifiedAuditReadiness(
    connection,
    vpdProofWithBind
  );
  readiness.auditPolicies = Number(auditProof.enabledRows || 0);
  readiness.unifiedAuditProof = auditProof;
  failAtPhase(failurePhase, 'UNIFIED_AUDIT', {
    generationId: candidateGeneration,
    auditPolicyCount: readiness.auditPolicies,
    deniedReturnCode: auditProof.returnCode,
    deniedRows: auditProof.deniedRows,
  });
  if (readiness.vectorAndOmlModels !== 5
      || readiness.dualityViews !== 2
      || readiness.propertyGraphs !== 1
      || readiness.spatialIndexes !== 2
      || readiness.nativeJsonRows < 1
      || readiness.vpdPolicies !== readiness.vpdProof?.expectedPolicyCount
      || readiness.inmemoryTables !== 5
      || readiness.featurePlanEvidence !== 2
      || readiness.auditPolicies < 1
      || readiness.trustedContexts !== 1
      || !readiness.vpdProof?.ready
      || !readiness.unifiedAuditProof?.ready
      || readiness.productVectors !== readiness.products
      || readiness.postVectors !== readiness.posts
      || readiness.semanticMatches
         !== readiness.vectorEvidence.expectedMatches
      || readiness.returnEvidenceVectors
         !== readiness.expectedReturnEvidenceVectors
      || readiness.returnEvidenceVectors < 1
      || readiness.invalidReturnEvidenceVectors !== 0
      || inmemoryProof?.datasetFingerprint !== datasetFingerprint
      || inmemoryProof?.operation !== 'TABLE ACCESS INMEMORY FULL'
      || !Number.isInteger(Number(inmemoryProof?.childNumber))
      || inmemoryProof?.objectName !== 'ORDERS'
      || !inmemoryProof?.proofId
      || featurePlanProofs?.vector?.datasetFingerprint !== datasetFingerprint
      || featurePlanProofs?.vector?.objectName !== 'PRODUCT_EMBEDDINGS'
      || featurePlanProofs?.vector?.indexName !== 'IDX_PRODUCT_VEC'
      || !String(featurePlanProofs?.vector?.operation || '')
        .includes('VECTOR INDEX')
      || !Number.isInteger(Number(
        featurePlanProofs?.vector?.resultRowCount
      ))
      || Number(featurePlanProofs?.vector?.resultRowCount) < 1
      || !Number.isInteger(Number(
        featurePlanProofs?.vector?.planHashValue
      ))
      || Number(featurePlanProofs?.vector?.planHashValue) < 1
      || featurePlanProofs?.spatial?.datasetFingerprint !== datasetFingerprint
      || featurePlanProofs?.spatial?.objectName !== 'FULFILLMENT_CENTERS'
      || featurePlanProofs?.spatial?.indexName !== 'IDX_FC_SPATIAL'
      || !String(featurePlanProofs?.spatial?.operation || '')
        .includes('DOMAIN INDEX')
      || !Number.isInteger(Number(
        featurePlanProofs?.spatial?.resultRowCount
      ))
      || Number(featurePlanProofs?.spatial?.resultRowCount) < 1
      || !Number.isInteger(Number(
        featurePlanProofs?.spatial?.planHashValue
      ))
      || Number(featurePlanProofs?.spatial?.planHashValue) < 1
      || featurePlanProofs?.spatial?.srid !== 4326
      || featurePlanProofs?.spatial?.dimensionCount !== 2
      || executionProofs.some((proof, index) => !proof.rows?.length
        || (index === 2 && Number(proof.rows[0]?.EDGE_COUNT || 0) < 1))) {
    throw new ImportError('Required Oracle feature readiness is incomplete.', 503, readiness);
  }
  failAtPhase(failurePhase, 'READINESS', {
    generationId: candidateGeneration,
    datasetFingerprint,
  });
  return readiness;
}

async function startDatasetJob({
  parsed,
  kind,
  lockMessage,
  queuedMessage,
  startMessage,
  completeMessage,
  datasetSource,
  failurePhase = null,
  objectStorageFailure = null,
}) {
  const accepted = await createJobWithRequestedIntentAndLease({
    operation: kind,
    message: queuedMessage,
    warnings: [...parsed.warnings],
    counts: parsed.counts,
    phase: 'QUEUED',
    datasetSource,
    datasetVersion: IMPORT_VERSION,
    ...(failurePhase ? { testFailurePhase: failurePhase } : {}),
    ...(objectStorageFailure
      ? { testObjectStorageFailure: objectStorageFailure }
      : {}),
  }, {
    generationPrefix: 'retail_',
    operation: kind,
    datasetSource,
    datasetVersion: IMPORT_VERSION,
    objectStorageFailure,
  }, {
    kind,
    message: lockMessage,
    progress: 0,
    status: 'queued',
  });
  if (!accepted) {
    const activeOperation = await getActiveOperation();
    throw new ImportError(
      `Another dataset operation is already in progress${activeOperation?.kind ? ` (${activeOperation.kind}).` : '.'}`,
      409,
      { activeOperation }
    );
  }
  const job = accepted.job;
  const lock = accepted.lease;
  const candidateGeneration = job.candidateGeneration;

  const requested = accepted.requested;
  failAtPhase(failurePhase, 'POST_ACCEPTANCE', {
    jobId: job.jobId,
    candidateGeneration,
    requestedEventId: requested.eventId,
  });
  await deliverPendingDatasetEvents({
    eventIds: [requested.eventId],
    failurePhase,
  }).catch(() => {});

  setImmediate(async () => {
    const leaseGuard = startOperationHeartbeat({
      leaseToken: lock.leaseToken,
      jobId: job.jobId,
    });
    try {
      await leaseGuard.pulse();
      leaseGuard.assertOwned();
      failAtPhase(failurePhase, 'LEASE', {
        jobId: job.jobId,
        candidateGeneration,
      });
      await updateJob(job.jobId, {
        status: 'running',
        progress: 5,
        message: startMessage,
      });
      const startedLease = await updateOperation({
        leaseToken: lock.leaseToken,
        jobId: job.jobId,
        progress: 5,
        message: startMessage,
        status: 'running',
      });
      if (!startedLease) {
        throw new DatasetLeaseOwnershipLostError(
          `Dataset operation lease ${lock.leaseToken} was replaced before worker start.`
        );
      }
      leaseGuard.assertOwned();
      if (failurePhase === 'POST_FAILED_INTENT') {
        // This selector first takes the ordinary worker failure path. The
        // process checkpoint below fires only after the failed job and its
        // deterministic outbox intent share a durable commit.
        throw new Error('Forced Retail worker error before durable failed intent.');
      }

      const result = await executeImportPlan({
        dataset: parsed.dataset,
        dryRun: false,
        progress: createJobProgressHandler(job.jobId, lock.leaseToken, leaseGuard),
        refreshDemoDates: datasetSource === 'demo',
        candidateGeneration,
        jobId: job.jobId,
        datasetSource,
        operation: kind,
        completeMessage,
        failurePhase,
        objectStorageFailure,
        assertLeaseOwned: () => leaseGuard.assertOwned(),
        verifyLeaseOwned: () => leaseGuard.pulse(),
      });
      leaseGuard.assertOwned();

      const warnings = [...result.warnings];
      const activeDataset = result.activeDataset;
      await deliverPendingDatasetEvents({
        eventIds: [eventIdFor(job.jobId, 'completed')],
        failurePhase,
      }).catch(() => {});

      await appendJobWarnings(job.jobId, warnings).catch(() => {});
      await updateJob(job.jobId, {
        status: 'completed',
        progress: 100,
        message: completeMessage,
        summary: result.summary,
        activeDataset,
      }).catch(() => {});
    } catch (err) {
      console.error('Dataset restore worker failed:', {
        jobId: job.jobId,
        candidateGeneration,
        message: err.message,
        details: err.details || null,
      });
      const failure = await failJobWithIntent(job.jobId, {
        status: 'failed',
        progress: 100,
        message: err.message || 'Import failed.',
        errors: [err.message || 'Import failed.'],
        details: err.details || null,
        phase: 'FAILED',
        candidateGeneration,
      }, {
        operation: kind,
        datasetSource,
        datasetVersion: IMPORT_VERSION,
        errorCategory: err instanceof ImportError
          ? 'FEATURE_OR_DATASET_READINESS'
          : 'INTERNAL_RESTORE_FAILURE',
        objectStorageFailure,
      });
      failAtPhase(failurePhase, 'POST_FAILED_INTENT', {
        jobId: job.jobId,
        candidateGeneration,
        failedEventId: failure.failed.eventId,
      });
      await deliverPendingDatasetEvents({
        eventIds: [failure.failed.eventId],
        failurePhase,
      }).catch(() => {});
    } finally {
      await leaseGuard.stop();
      await endOperation({
        jobId: job.jobId,
        leaseToken: lock.leaseToken,
      });
    }
  });

  return {
    jobId: job.jobId,
    message: queuedMessage,
    ...(failurePhase ? { testFailurePhase: failurePhase } : {}),
  };
}

async function generateTemplateArchive({ version = IMPORT_VERSION }) {
  if (version !== IMPORT_VERSION) {
    throw new ImportError(`Unsupported import template version "${version}".`, 400);
  }

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(`${JSON.stringify(buildManifest(), null, 2)}\n`, 'utf8'));
  zip.addFile('README.md', Buffer.from(buildTemplateReadme(), 'utf8'));

  for (const table of TABLES) {
    const folder = table.required ? 'required' : 'optional';
    const header = `${table.columns.map((column) => csvCell(column.name)).join(',')}\n`;
    zip.addFile(`${folder}/${table.name}.csv`, Buffer.from(header, 'utf8'));
  }

  return {
    buffer: zip.toBuffer(),
    fileName: `sporting-goods-retail-import-template-${version}.zip`,
    contentType: 'application/zip',
  };
}

async function validateDataset({ req, body = {}, version = IMPORT_VERSION }) {
  const fileOnly = isTrueish(req?.query?.fileOnly || body?.fileOnly);
  const archive = getArchiveBufferFromRequest({ req, body });
  const parsed = parseArchiveDataset(archive.buffer, version);

  return runDatasetValidation({
    parsed,
    fileOnly,
    lockKind: 'validate_upload',
    lockMessage: 'Validating uploaded dataset...',
  });
}

async function startImport({ req, body = {}, version = IMPORT_VERSION }) {
  const archive = getArchiveBufferFromRequest({ req, body });
  const parsed = parseArchiveDataset(archive.buffer, version);

  if (!parsed.valid) {
    throw new ImportError('Upload validation failed.', 400, {
      errors: parsed.errors,
      warnings: parsed.warnings,
      counts: parsed.counts,
    });
  }

  return startDatasetJob({
    parsed,
    kind: 'upload',
    lockMessage: 'Replacing dataset with uploaded ZIP...',
    queuedMessage: 'Import started.',
    startMessage: 'Starting dataset replacement...',
    completeMessage: 'Import completed successfully.',
    datasetSource: 'custom',
    failurePhase: resolveFailurePhase(req),
  });
}

async function validateDemoRestore({ version = IMPORT_VERSION }) {
  const demoDataset = getBundledDemoDataset(version);
  return runDatasetValidation({
    parsed: demoDataset.parsed,
    fileOnly: false,
    lockKind: 'validate_restore_demo',
    lockMessage: 'Validating demo dataset restore...',
  });
}

async function startDemoRestore({ req, version = IMPORT_VERSION }) {
  const demoDataset = getBundledDemoDataset(version);
  return startDatasetJob({
    parsed: demoDataset.parsed,
    kind: 'restore_demo',
    lockMessage: 'Restoring the bundled demo dataset...',
    queuedMessage: 'Demo restore started.',
    startMessage: 'Restoring bundled demo dataset...',
    completeMessage: 'Demo dataset restored successfully.',
    datasetSource: 'demo',
    failurePhase: resolveFailurePhase(req),
    objectStorageFailure: resolveObjectStorageFailure(req),
  });
}

async function getImportStatus({ jobId }) {
  return getJob(jobId);
}

module.exports = {
  generateTemplateArchive,
  getActiveDataset,
  validateDataset,
  startImport,
  validateDemoRestore,
  startDemoRestore,
  getImportStatus,

  // Exposed for local verification scripts.
  _private: {
    ImportError,
    buildFallbackBrandLinks,
    buildFallbackDemandForecasts,
    buildFallbackDemandRegions,
    buildFallbackInfluencerConnections,
    buildFallbackShipments,
    deleteOwnerScopedRuntimeData,
    getBundledDemoDataset,
    parseArchiveDataset,
  },
};
