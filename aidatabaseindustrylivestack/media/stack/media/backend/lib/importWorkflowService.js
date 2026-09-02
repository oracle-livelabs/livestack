const AdmZip = require('adm-zip');
const crypto = require('crypto');
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
  createJobWithOperation,
  updateJob,
  appendJobWarnings,
  getJob,
} = require('./importJobs');
const { getBundledDemoArchive } = require('./demoDatasetBundle');
const {
  getStoredDatasetState,
  getDatasetReadiness,
  activateDatasetInTransaction,
  finalizeDatasetActivation,
  markReadinessFailed,
} = require('./datasetStateStore');
const {
  runDemoDateValidation,
  summarizeDemoDateValidation,
} = require('./demoDateValidation');
const {
  DatasetOperationOwnershipLostError,
  assertOperationOwnershipInTransaction,
  beginOperation,
  updateOperation,
  endOperation,
  getActiveOperation,
  startOperationHeartbeat,
} = require('./datasetOperationLock');
const {
  stopHeartbeatBeforeLeaseRelease,
} = require('./durableLifecycleRecovery');
const {
  collectExactInMemorySegmentInventory,
  collectExactSpatialIndexBindings,
  executeWithExactPlanEvidence,
} = require('./exactPlanEvidence');
const {
  collectMediaVectorEvidence,
  assertMediaVectorEvidence,
} = require('./mediaVectorEvidence');
const {
  canonicalAuditGenerationToken,
} = require('./auditGenerationToken');
const {
  FAILURE_PHASES,
  resolveDatasetFailureControl,
  runWithDatasetFailureControl,
  getDatasetFailureControl,
  isDatasetFailurePhaseSelected,
  failureActionFor,
  killProcessForFailureControl,
} = require('./datasetFailureControl');
const {
  verifyMediaCanonicalPolicyInventory,
} = require('./mediaVpdPolicyInventory');
const {
  resolveDatasetEventDeliveryFault,
} = require('./datasetEventDeliveryFault');

let ollamaAssistant = null;
try {
  // Optional: only used to flush Ask Data schema/entity caches after import.
  ollamaAssistant = require('./ollamaAssistant');
} catch (_) {
  ollamaAssistant = null;
}

const MAX_ARCHIVE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const MAX_CSV_ROWS = 100000;
const VECTOR_MODEL_NAME = 'ALL_MINILM_L12_V2';
const INSERT_SQL_CACHE = new Map();
const DEMO_DATE_ANCHOR_TABLE = 'APP_DEMO_DATE_ANCHOR';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
let cachedBundledDemoDataset = null;
const OML_LOGICAL_NAMES = Object.freeze([
  'DEMAND_SURGE_MODEL',
  'CUSTOMER_SEGMENT_MODEL',
  'REVENUE_PREDICT_MODEL',
  'PRODUCT_CLUSTER_MODEL',
]);

async function assertOwnershipBeforeCommit(connection, ownership) {
  if (!ownership) return;
  ownership.assertOwned();
  await assertOperationOwnershipInTransaction(connection, {
    jobId: ownership.jobId,
    leaseToken: ownership.leaseToken,
  });
}

function throwIfOwnershipLost(ownership) {
  ownership?.assertOwned?.();
}

async function updateOwnedOperation(ownership, patch = {}) {
  throwIfOwnershipLost(ownership);
  const updated = await updateOperation({
    jobId: ownership.jobId,
    leaseToken: ownership.leaseToken,
    ...patch,
  });
  if (!updated) {
    throw ownership.loseOwnership(new DatasetOperationOwnershipLostError(
      'Dataset progress update found an expired or replacement lease.',
      { jobId: ownership.jobId, leaseToken: ownership.leaseToken }
    ));
  }
  return updated;
}

function injectSemanticFailure(phase) {
  let control;
  try {
    control = getDatasetFailureControl();
  } catch (error) {
    throw new ImportError(error.message, 500, {
      failurePhase: String(phase || ''),
      injected: false,
    });
  }
  const action = failureActionFor(control, phase);
  if (action === 'sigkill') {
    killProcessForFailureControl();
    return;
  }
  if (action === 'throw') {
    throw new ImportError(`Injected Media Restore failure at ${phase}.`, 503, {
      failurePhase: phase,
      injected: true,
    });
  }
}

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

function utcDateOnly(year, month, day) {
  return new Date(Date.UTC(year, month, day));
}

function startOfUtcDay(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return utcDateOnly(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function parseDemoAnchorDate(rawValue, label = 'DEMO_ANCHOR_DATE') {
  if (rawValue == null || rawValue === '') return null;

  if (rawValue instanceof Date) {
    const anchor = startOfUtcDay(rawValue);
    if (anchor) return anchor;
  }

  const text = String(rawValue).trim();
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const parsed = utcDateOnly(year, month - 1, day);
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed;
    }
    throw new ImportError(`${label} must be a valid date or timestamp.`, 400);
  }

  const parsed = new Date(text);
  const anchor = startOfUtcDay(parsed);
  if (!anchor) {
    throw new ImportError(`${label} must be a valid date or timestamp.`, 400);
  }
  return anchor;
}

function dateToIsoDate(value) {
  const anchor = startOfUtcDay(value);
  return anchor ? anchor.toISOString().slice(0, 10) : null;
}

function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildTemplateReadme() {
  return [
    '# Media and Entertainment Content Intelligence Import Template',
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

async function acquireOperationLock(kind, message, metadata = {}) {
  const acquired = await beginOperation({
    kind,
    message,
    progress: 0,
    status: 'running',
    ...metadata,
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
    throw new ImportError(`ZIP exceeds the ${MAX_ARCHIVE_ENTRIES}-entry safety limit.`, 413);
  }
  let uncompressedTotal = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const uncompressedSize = Number(entry.header?.size || 0);
    const compressedSize = Math.max(1, Number(entry.header?.compressedSize || 1));
    uncompressedTotal += uncompressedSize;
    if (uncompressedSize > MAX_ENTRY_BYTES
        || uncompressedTotal > MAX_UNCOMPRESSED_BYTES
        || uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
      throw new ImportError('ZIP expands beyond the permitted dataset safety limits.', 413);
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
    if (records.length > MAX_CSV_ROWS + 1) {
      throw new ImportError(`${table.name}.csv exceeds the ${MAX_CSV_ROWS}-row safety limit.`, 413);
    }
  } catch (err) {
    errors.push(`${table.name}.csv could not be parsed as CSV: ${err.message}`);
    return { header: [], rows: [], sourceIds: new Set() };
  }

  if (!records.length) {
    errors.push(`${table.name}.csv is empty.`);
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

function cloneImportValue(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(cloneImportValue);
  return value;
}

function cloneImportRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, cloneImportValue(value)])
  );
}

function cloneImportDataset(dataset) {
  const tables = {};

  for (const [tableName, tableData] of Object.entries(dataset.tables || {})) {
    tables[tableName] = {
      ...tableData,
      rows: (tableData.rows || []).map(cloneImportRow),
      sourceIds: new Set(tableData.sourceIds || []),
    };
  }

  return {
    ...dataset,
    counts: { ...(dataset.counts || {}) },
    tables,
  };
}

function getDateColumnEntries() {
  return TABLES.flatMap((table) => (
    table.columns
      .filter((column) => column.type === 'date' || column.type === 'timestamp')
      .map((column) => ({ tableName: table.name, columnName: column.name, type: column.type }))
  ));
}

function getDateValues(dataset, tableName, columnName) {
  return (dataset.tables?.[tableName]?.rows || [])
    .map((row) => row[columnName])
    .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()));
}

function minDate(values) {
  if (!values.length) return null;
  return values.reduce((min, value) => (value < min ? value : min), values[0]);
}

function maxDate(values) {
  if (!values.length) return null;
  return values.reduce((max, value) => (value > max ? value : max), values[0]);
}

function findDemoSeedAnchor(dataset) {
  const forecastStart = minDate(getDateValues(dataset, 'demand_forecasts', 'forecast_date'));
  if (forecastStart) {
    return {
      seedAnchor: startOfUtcDay(forecastStart),
      anchorStrategy: 'forecast_start_to_anchor_date',
    };
  }

  const dateValues = getDateColumnEntries()
    .flatMap(({ tableName, columnName }) => getDateValues(dataset, tableName, columnName));
  const latestSeedDate = maxDate(dateValues);
  if (latestSeedDate) {
    return {
      seedAnchor: startOfUtcDay(latestSeedDate),
      anchorStrategy: 'latest_seed_date_to_anchor_date',
    };
  }

  return {
    seedAnchor: null,
    anchorStrategy: 'no_seed_dates_found',
  };
}

function shiftDatasetDates(dataset, offsetMs) {
  const shiftedColumns = {};
  let shiftedTableCount = 0;
  let shiftedColumnCount = 0;
  let shiftedValueCount = 0;

  for (const { tableName, columnName } of getDateColumnEntries()) {
    const tableData = dataset.tables?.[tableName];
    if (!tableData?.provided) continue;

    let columnShiftCount = 0;
    for (const row of tableData.rows || []) {
      const value = row[columnName];
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) continue;
      row[columnName] = new Date(value.getTime() + offsetMs);
      columnShiftCount += 1;
    }

    if (columnShiftCount > 0) {
      if (!shiftedColumns[tableName]) {
        shiftedColumns[tableName] = {};
        shiftedTableCount += 1;
      }
      shiftedColumns[tableName][columnName] = columnShiftCount;
      shiftedColumnCount += 1;
      shiftedValueCount += columnShiftCount;
    }
  }

  return {
    shiftedColumns,
    shiftedTableCount,
    shiftedColumnCount,
    shiftedValueCount,
  };
}

function reanchorDemoDates(dataset, { targetAnchor, anchorSource = 'database' } = {}) {
  const restoreAnchor = startOfUtcDay(targetAnchor);
  if (!restoreAnchor) {
    throw new ImportError('Demo date refresh requires a valid restore anchor date.', 400);
  }

  const clonedDataset = cloneImportDataset(dataset);
  const { seedAnchor, anchorStrategy } = findDemoSeedAnchor(clonedDataset);
  if (!seedAnchor) {
    return {
      dataset: clonedDataset,
      metadata: {
        enabled: true,
        anchorSource,
        anchorStrategy,
        originalSeedAnchor: null,
        restoreAnchor,
        offsetDays: 0,
        offsetSeconds: 0,
        shiftedTableCount: 0,
        shiftedColumnCount: 0,
        shiftedValueCount: 0,
        shiftedColumns: {},
      },
    };
  }

  const offsetMs = restoreAnchor.getTime() - seedAnchor.getTime();
  const shiftSummary = shiftDatasetDates(clonedDataset, offsetMs);

  return {
    dataset: clonedDataset,
    metadata: {
      enabled: true,
      anchorSource,
      anchorStrategy,
      originalSeedAnchor: seedAnchor,
      restoreAnchor,
      offsetDays: offsetMs / MS_PER_DAY,
      offsetSeconds: offsetMs / 1000,
      ...shiftSummary,
    },
  };
}

function formatDemoDateRefresh(metadata) {
  if (!metadata) return null;
  return {
    enabled: Boolean(metadata.enabled),
    anchorSource: metadata.anchorSource,
    anchorStrategy: metadata.anchorStrategy,
    originalSeedAnchor: metadata.originalSeedAnchor instanceof Date
      ? metadata.originalSeedAnchor.toISOString()
      : null,
    restoreAnchor: metadata.restoreAnchor instanceof Date
      ? metadata.restoreAnchor.toISOString()
      : null,
    originalSeedAnchorDate: dateToIsoDate(metadata.originalSeedAnchor),
    restoreAnchorDate: dateToIsoDate(metadata.restoreAnchor),
    offsetDays: metadata.offsetDays,
    offsetSeconds: metadata.offsetSeconds,
    shiftedTableCount: metadata.shiftedTableCount,
    shiftedColumnCount: metadata.shiftedColumnCount,
    shiftedValueCount: metadata.shiftedValueCount,
    shiftedColumns: metadata.shiftedColumns || {},
  };
}

async function execSql(connection, sql, binds = {}, options = {}) {
  return connection.execute(sql, binds, {
    autoCommit: false,
    ...options,
  });
}

function enforceManualCommitExecution(connection) {
  const originalExecute = connection.execute;
  const originalExecuteMany = connection.executeMany;
  connection.execute = function executeWithoutAutoCommit(sql, binds = {}, options = {}) {
    return originalExecute.call(this, sql, binds, {
      ...options,
      autoCommit: false,
    });
  };
  connection.executeMany = function executeManyWithoutAutoCommit(
    sql,
    binds = [],
    options = {}
  ) {
    return originalExecuteMany.call(this, sql, binds, {
      ...options,
      autoCommit: false,
    });
  };
  return () => {
    connection.execute = originalExecute;
    connection.executeMany = originalExecuteMany;
  };
}

function getConfiguredDemoAnchorRaw({ body = {}, query = {}, headers = {} } = {}) {
  return process.env.DEMO_ANCHOR_DATE ||
    body.demoAnchorDate ||
    body.demo_anchor_date ||
    query.demoAnchorDate ||
    query.demo_anchor_date ||
    headers['x-demo-anchor-date'] ||
    headers['X-Demo-Anchor-Date'] ||
    null;
}

function buildDemoDateRefreshOptions({ body = {}, query = {}, headers = {} } = {}) {
  const rawAnchor = getConfiguredDemoAnchorRaw({ body, query, headers });
  return {
    enabled: true,
    configuredAnchorRaw: rawAnchor ? String(rawAnchor).trim() : null,
    configuredAnchorDate: rawAnchor
      ? parseDemoAnchorDate(rawAnchor, 'DEMO_ANCHOR_DATE')
      : null,
  };
}

async function resolveDemoRestoreAnchor(connection, demoDateRefresh = {}) {
  if (demoDateRefresh.configuredAnchorDate) {
    return {
      targetAnchor: demoDateRefresh.configuredAnchorDate,
      anchorSource: 'configured',
    };
  }

  const result = await execSql(connection, `
    SELECT TO_CHAR(TRUNC(SYSDATE), 'YYYY-MM-DD') AS anchor_date
    FROM dual
  `);
  const anchorDateText = result.rows[0]?.ANCHOR_DATE || result.rows[0]?.anchor_date;
  return {
    targetAnchor: parseDemoAnchorDate(anchorDateText || new Date(), 'database restore date'),
    anchorSource: 'database',
  };
}

function buildDemoDateRefreshSqlPlan() {
  return getDateColumnEntries().map(({ tableName, columnName, type }) => {
    const updateExpression = type === 'date'
      ? `${columnName} + :offsetDays`
      : `${columnName} + NUMTODSINTERVAL(:offsetSeconds, 'SECOND')`;

    return {
      tableName,
      columnName,
      type,
      countSql: `SELECT COUNT(*) AS cnt FROM ${tableName} WHERE ${columnName} IS NOT NULL`,
      updateSql: `UPDATE ${tableName} SET ${columnName} = ${updateExpression} WHERE ${columnName} IS NOT NULL`,
    };
  });
}

async function findDatabaseDemoSeedAnchor(connection) {
  const forecastAnchor = await execSql(connection, `
    SELECT TO_CHAR(TRUNC(MIN(forecast_date)), 'YYYY-MM-DD') AS seed_anchor
    FROM demand_forecasts
    WHERE forecast_date IS NOT NULL
  `);
  const forecastAnchorText = forecastAnchor.rows[0]?.SEED_ANCHOR || forecastAnchor.rows[0]?.seed_anchor;

  if (forecastAnchorText) {
    return {
      seedAnchor: parseDemoAnchorDate(forecastAnchorText, 'database seed anchor'),
      anchorStrategy: 'forecast_start_to_anchor_date',
    };
  }

  const unionSql = getDateColumnEntries()
    .map(({ tableName, columnName }) => (
      `SELECT MAX(TRUNC(CAST(${columnName} AS DATE))) AS seed_date FROM ${tableName} WHERE ${columnName} IS NOT NULL`
    ))
    .join('\nUNION ALL\n');

  const latestAnchor = await execSql(connection, `
    SELECT TO_CHAR(MAX(seed_date), 'YYYY-MM-DD') AS seed_anchor
    FROM (
      ${unionSql}
    )
  `);
  const latestAnchorText = latestAnchor.rows[0]?.SEED_ANCHOR || latestAnchor.rows[0]?.seed_anchor;

  if (latestAnchorText) {
    return {
      seedAnchor: parseDemoAnchorDate(latestAnchorText, 'database seed anchor'),
      anchorStrategy: 'latest_seed_date_to_anchor_date',
    };
  }

  return {
    seedAnchor: null,
    anchorStrategy: 'no_seed_dates_found',
  };
}

async function refreshDemoDatesInDatabase(connection, { targetAnchor, anchorSource = 'database' } = {}) {
  const restoreAnchor = startOfUtcDay(targetAnchor);
  if (!restoreAnchor) {
    throw new ImportError('Demo date refresh requires a valid restore anchor date.', 400);
  }

  const { seedAnchor, anchorStrategy } = await findDatabaseDemoSeedAnchor(connection);
  if (!seedAnchor) {
    return {
      enabled: true,
      anchorSource,
      anchorStrategy,
      originalSeedAnchor: null,
      restoreAnchor,
      offsetDays: 0,
      offsetSeconds: 0,
      shiftedTableCount: 0,
      shiftedColumnCount: 0,
      shiftedValueCount: 0,
      shiftedColumns: {},
    };
  }

  const offsetMs = restoreAnchor.getTime() - seedAnchor.getTime();
  const offsetDays = offsetMs / MS_PER_DAY;
  const offsetSeconds = offsetMs / 1000;
  const shiftedColumns = {};
  let shiftedTableCount = 0;
  let shiftedColumnCount = 0;
  let shiftedValueCount = 0;

  for (const plan of buildDemoDateRefreshSqlPlan()) {
    const countResult = await execSql(connection, plan.countSql);
    const columnValueCount = Number(countResult.rows[0]?.CNT || countResult.rows[0]?.cnt || 0);
    if (columnValueCount <= 0) continue;

    if (offsetSeconds !== 0) {
      const updateBinds = plan.type === 'date'
        ? { offsetDays }
        : { offsetSeconds };
      await execSql(connection, plan.updateSql, updateBinds);
    }

    if (!shiftedColumns[plan.tableName]) {
      shiftedColumns[plan.tableName] = {};
      shiftedTableCount += 1;
    }
    shiftedColumns[plan.tableName][plan.columnName] = columnValueCount;
    shiftedColumnCount += 1;
    shiftedValueCount += columnValueCount;
  }

  return {
    enabled: true,
    anchorSource,
    anchorStrategy,
    originalSeedAnchor: seedAnchor,
    restoreAnchor,
    offsetDays,
    offsetSeconds,
    shiftedTableCount,
    shiftedColumnCount,
    shiftedValueCount,
    shiftedColumns,
  };
}

async function ensureDemoDateAnchorTable(connection) {
  const exists = await execSql(connection, `
    SELECT COUNT(*) AS cnt
    FROM user_tables
    WHERE table_name = :tableName
  `, { tableName: DEMO_DATE_ANCHOR_TABLE });

  if (Number(exists.rows[0]?.CNT || exists.rows[0]?.cnt || 0) > 0) {
    return;
  }
  throw new ImportError(
    'Required APP_DEMO_DATE_ANCHOR lifecycle table is unavailable; runtime DDL is forbidden.',
    503
  );
}

async function persistDemoDateAnchor(connection, metadata) {
  if (!metadata) return null;

  try {
    await ensureDemoDateAnchorTable(connection);
    await execSql(connection, `
      MERGE INTO app_demo_date_anchor target
      USING (
        SELECT
          1 AS anchor_id,
          :anchorSource AS anchor_source,
          :anchorStrategy AS anchor_strategy,
          :originalSeedAnchor AS original_seed_anchor,
          :restoreAnchor AS restore_anchor,
          :offsetDays AS offset_days,
          :offsetSeconds AS offset_seconds,
          :shiftedTableCount AS shifted_table_count,
          :shiftedColumnCount AS shifted_column_count,
          :shiftedValueCount AS shifted_value_count,
          :shiftedColumnsJson AS shifted_columns_json
        FROM dual
      ) incoming
      ON (target.anchor_id = incoming.anchor_id)
      WHEN MATCHED THEN UPDATE SET
        target.anchor_source = incoming.anchor_source,
        target.anchor_strategy = incoming.anchor_strategy,
        target.original_seed_anchor = incoming.original_seed_anchor,
        target.restore_anchor = incoming.restore_anchor,
        target.offset_days = incoming.offset_days,
        target.offset_seconds = incoming.offset_seconds,
        target.shifted_table_count = incoming.shifted_table_count,
        target.shifted_column_count = incoming.shifted_column_count,
        target.shifted_value_count = incoming.shifted_value_count,
        target.shifted_columns_json = incoming.shifted_columns_json,
        target.refreshed_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (
        anchor_id,
        anchor_source,
        anchor_strategy,
        original_seed_anchor,
        restore_anchor,
        offset_days,
        offset_seconds,
        shifted_table_count,
        shifted_column_count,
        shifted_value_count,
        shifted_columns_json,
        refreshed_at
      ) VALUES (
        incoming.anchor_id,
        incoming.anchor_source,
        incoming.anchor_strategy,
        incoming.original_seed_anchor,
        incoming.restore_anchor,
        incoming.offset_days,
        incoming.offset_seconds,
        incoming.shifted_table_count,
        incoming.shifted_column_count,
        incoming.shifted_value_count,
        incoming.shifted_columns_json,
        SYSTIMESTAMP
      )
    `, {
      anchorSource: metadata.anchorSource,
      anchorStrategy: metadata.anchorStrategy,
      originalSeedAnchor: metadata.originalSeedAnchor,
      restoreAnchor: metadata.restoreAnchor,
      offsetDays: metadata.offsetDays,
      offsetSeconds: metadata.offsetSeconds,
      shiftedTableCount: metadata.shiftedTableCount,
      shiftedColumnCount: metadata.shiftedColumnCount,
      shiftedValueCount: metadata.shiftedValueCount,
      shiftedColumnsJson: JSON.stringify(metadata.shiftedColumns || {}),
    });
    return formatDemoDateRefresh(metadata);
  } catch (err) {
    throw new ImportError(`Demo date refresh metadata could not be persisted: ${err.message}`, 500);
  }
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

async function deleteExistingImportData(connection) {
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
      progress({
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
      progress({ status: 'running', progress: 65, message: 'Generating fallback demand regions...' });
    }
    generatedDemandRegions = buildFallbackDemandRegions(dataset);
    fallbackSummary.demand_regions = await insertFallbackDemandRegions(connection, generatedDemandRegions);
    if (!generatedDemandRegions.length) warnings.push('No fallback demand_regions could be generated because customer geospatial data was missing.');
  }

  if (!dataset.tables.demand_forecasts.provided) {
    if (progress) {
      progress({ status: 'running', progress: 70, message: 'Generating fallback demand forecasts...' });
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
      progress({ status: 'running', progress: 75, message: 'Generating fallback shipments...' });
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

async function regenerateVectorArtifacts(connection) {
  const summary = {};

  const productEmbeddings = await execSql(connection, `
    INSERT INTO product_embeddings (
      product_id, embedding_model, embedding_text, embedding
    )
    SELECT p.product_id,
           'all_MiniLM_L12_v2',
           p.product_name || ' ' || NVL(p.category, '') || ' ' ||
             NVL(DBMS_LOB.SUBSTR(p.description, 1000, 1), '') || ' ' ||
             b.brand_name,
           VECTOR_EMBEDDING(${VECTOR_MODEL_NAME} USING
             p.product_name || ' ' || NVL(p.category, '') || ' ' ||
             NVL(DBMS_LOB.SUBSTR(p.description, 1000, 1), '') || ' ' ||
             b.brand_name AS DATA)
    FROM products p
    JOIN brands b ON b.brand_id = p.brand_id
    WHERE p.is_active = 1
  `);
  summary.product_embeddings = productEmbeddings.rowsAffected || 0;

  const postEmbeddings = await execSql(connection, `
    INSERT INTO post_embeddings (
      post_id, embedding_model, embedding_text, embedding
    )
    SELECT sp.post_id,
           'all_MiniLM_L12_v2',
           DBMS_LOB.SUBSTR(sp.post_text, 500, 1),
           VECTOR_EMBEDDING(${VECTOR_MODEL_NAME} USING
             DBMS_LOB.SUBSTR(sp.post_text, 500, 1) AS DATA)
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

  return summary;
}

function candidateRowPayload(row) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !key.startsWith('__'))
      .map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ])
  );
}

function safeOracleIdentifier(value) {
  const normalized = String(value || '').toUpperCase();
  if (!/^[A-Z][A-Z0-9_$#]{0,127}$/.test(normalized)) {
    throw new ImportError('Generated Oracle OML identifier is invalid.', 500);
  }
  return normalized;
}

async function fingerprintTrainingTable(connection, tableName, caseIdColumn) {
  const safeTable = safeOracleIdentifier(tableName);
  const safeCaseId = safeOracleIdentifier(caseIdColumn);
  const result = await execSql(
    connection,
    `SELECT * FROM ${safeTable} ORDER BY ${safeCaseId}`
  );
  const canonicalRows = (result.rows || []).map((row) => Object.fromEntries(
    Object.keys(row).sort().map((key) => [
      key,
      row[key] instanceof Date ? row[key].toISOString() : row[key],
    ])
  ));
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonicalRows))
    .digest('hex');
}

async function protectGenerationAssetAdminOnly(connection, objectName) {
  const safeObject = safeOracleIdentifier(objectName);
  await execSql(connection, `
    BEGIN
      DBMS_RLS.ADD_POLICY(
        object_schema => USER,
        object_name => '${safeObject}',
        policy_name => 'VPD_MEDIA_SELECT',
        function_schema => USER,
        policy_function => 'VPD_MEDIA_ADMIN_ONLY',
        statement_types => 'SELECT',
        update_check => FALSE,
        policy_type => DBMS_RLS.CONTEXT_SENSITIVE,
        enable => TRUE
      );
      DBMS_RLS.ADD_POLICY(
        object_schema => USER,
        object_name => '${safeObject}',
        policy_name => 'VPD_MEDIA_DML',
        function_schema => USER,
        policy_function => 'VPD_MEDIA_DML',
        statement_types => 'INSERT,UPDATE,DELETE',
        update_check => TRUE,
        policy_type => DBMS_RLS.CONTEXT_SENSITIVE,
        enable => TRUE
      );
    END;
  `);
}

async function reconcileGenerationAssetVpdPolicies() {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    const assets = await execSql(connection, `
      SELECT DISTINCT asset.asset_name object_name
      FROM app_oml_generation_assets asset
      JOIN user_objects object_inventory
        ON object_inventory.object_name = asset.asset_name
       AND object_inventory.object_type IN ('TABLE', 'VIEW')
      ORDER BY asset.asset_name
    `);
    let repaired = 0;
    for (const row of assets.rows || []) {
      const objectName = safeOracleIdentifier(row.OBJECT_NAME);
      const installed = await execSql(connection, `
        SELECT policy_name
        FROM user_policies
        WHERE object_name = :objectName
          AND policy_name IN ('VPD_MEDIA_SELECT', 'VPD_MEDIA_DML')
        ORDER BY policy_name
      `, { objectName });
      const policyNames = new Set(
        (installed.rows || []).map((policy) => policy.POLICY_NAME)
      );
      if (policyNames.has('VPD_MEDIA_SELECT')
          && policyNames.has('VPD_MEDIA_DML')) continue;
      for (const policyName of policyNames) {
        await execSql(connection, `
          BEGIN
            DBMS_RLS.DROP_POLICY(
              object_schema => USER,
              object_name => '${objectName}',
              policy_name => '${safeOracleIdentifier(policyName)}'
            );
          END;
        `);
      }
      await protectGenerationAssetAdminOnly(connection, objectName);
      repaired += 1;
    }
    await connection.commit();
    return { checked: assets.rows?.length || 0, repaired };
  } finally {
    if (connection) {
      await db.releaseConnection(connection, {
        rollback: true,
        label: 'Media generation-asset VPD reconciliation',
      });
    }
  }
}

async function markGenerationAssetMaterialized(
  connection,
  generationId,
  assetType,
  assetName
) {
  await execSql(connection, `
    UPDATE app_oml_generation_assets
    SET status = 'created', materialized_at = SYSTIMESTAMP
    WHERE generation_id = :generationId
      AND asset_type = :assetType
      AND asset_name = :assetName
  `, { generationId, assetType, assetName });
}

async function stageCandidateOmlGeneration(
  connection,
  dataset,
  generationId,
  ownership = null
) {
  throwIfOwnershipLost(ownership);
  const fingerprintSource = {};
  for (const tableName of REQUIRED_TABLE_NAMES) {
    fingerprintSource[tableName] = dataset.tables[tableName].rows.map(candidateRowPayload);
  }
  const fingerprint = crypto.createHash('sha256')
    .update(JSON.stringify(fingerprintSource))
    .digest('hex');
  const token = crypto.createHash('sha256').update(generationId).digest('hex').slice(0, 12).toUpperCase();
  const trainingTables = {
    DEMAND_SURGE_MODEL: safeOracleIdentifier(`M2D_${token}`),
    CUSTOMER_SEGMENT_MODEL: safeOracleIdentifier(`M2C_${token}`),
    REVENUE_PREDICT_MODEL: safeOracleIdentifier(`M2R_${token}`),
    PRODUCT_CLUSTER_MODEL: safeOracleIdentifier(`M2P_${token}`),
  };
  const settingsTables = {
    DEMAND_SURGE_MODEL: safeOracleIdentifier(`M2SD_${token}`),
    CUSTOMER_SEGMENT_MODEL: safeOracleIdentifier(`M2SC_${token}`),
    REVENUE_PREDICT_MODEL: safeOracleIdentifier(`M2SR_${token}`),
    PRODUCT_CLUSTER_MODEL: safeOracleIdentifier(`M2SP_${token}`),
  };
  const physicalNames = {
    DEMAND_SURGE_MODEL: safeOracleIdentifier(`M2DM_${token}`),
    CUSTOMER_SEGMENT_MODEL: safeOracleIdentifier(`M2CM_${token}`),
    REVENUE_PREDICT_MODEL: safeOracleIdentifier(`M2RM_${token}`),
    PRODUCT_CLUSTER_MODEL: safeOracleIdentifier(`M2PM_${token}`),
  };

  await execSql(connection,
    'DELETE FROM app_oml_candidate_rows WHERE generation_id = :generationId',
    { generationId });
  for (const tableName of REQUIRED_TABLE_NAMES) {
    const binds = dataset.tables[tableName].rows.map((row) => ({
      generationId,
      entityName: tableName,
      sourceId: normalizeSourceId(row.__sourceId),
      rowData: candidateRowPayload(row),
    }));
    if (!binds.length) continue;
    await connection.executeMany(`
      INSERT INTO app_oml_candidate_rows(
        generation_id, entity_name, source_id, row_data
      ) VALUES(
        :generationId, :entityName, :sourceId, :rowData
      )
    `, binds, {
      bindDefs: {
        generationId: { type: db.oracledb.STRING, maxSize: 100 },
        entityName: { type: db.oracledb.STRING, maxSize: 40 },
        sourceId: { type: db.oracledb.STRING, maxSize: 100 },
        rowData: { type: db.oracledb.DB_TYPE_JSON },
      },
      autoCommit: false,
    });
  }
  await execSql(connection, `
    INSERT INTO app_oml_generations(
      generation_id, source_fingerprint, status, created_at, updated_at
    ) VALUES(
      :generationId, :sourceFingerprint, 'planned', SYSTIMESTAMP, SYSTIMESTAMP
    )
  `, { generationId, sourceFingerprint: fingerprint });
  const plannedAssets = OML_LOGICAL_NAMES.flatMap((logicalName) => ([
    {
      generationId,
      logicalName,
      assetType: 'TRAINING_TABLE',
      assetName: trainingTables[logicalName],
    },
    {
      generationId,
      logicalName,
      assetType: 'SETTINGS_TABLE',
      assetName: settingsTables[logicalName],
    },
    {
      generationId,
      logicalName,
      assetType: 'MODEL',
      assetName: physicalNames[logicalName],
    },
  ]));
  await connection.executeMany(`
    INSERT INTO app_oml_generation_assets(
      generation_id, logical_name, asset_type, asset_name, status, created_at
    ) VALUES(
      :generationId, :logicalName, :assetType, :assetName, 'planned', SYSTIMESTAMP
    )
  `, plannedAssets, {
    bindDefs: {
      generationId: { type: db.oracledb.STRING, maxSize: 100 },
      logicalName: { type: db.oracledb.STRING, maxSize: 40 },
      assetType: { type: db.oracledb.STRING, maxSize: 30 },
      assetName: { type: db.oracledb.STRING, maxSize: 128 },
    },
    autoCommit: false,
  });
  await execSql(connection, `
    UPDATE app_oml_generations
    SET status = 'staging', updated_at = SYSTIMESTAMP
    WHERE generation_id = :generationId
  `, { generationId });
  // Candidate-only staging is committed before model DDL. No active table or
  // pointer has changed. The generation header and complete planned-asset
  // manifest are durable before the first physical DDL boundary.
  await assertOwnershipBeforeCommit(connection, ownership);
  await connection.commit();
  injectSemanticFailure('after_candidate_staging');

  const g = generationId.replace(/'/g, "''");
  await execSql(connection, `
    CREATE TABLE ${trainingTables.DEMAND_SURGE_MODEL} AS
    WITH products_stage AS (
      SELECT TO_NUMBER(source_id) product_id,
             JSON_VALUE(row_data, '$.category') category,
             JSON_VALUE(row_data, '$.unit_price' RETURNING NUMBER) unit_price
      FROM app_oml_candidate_rows
      WHERE generation_id = '${g}' AND entity_name = 'products'
    ), engagement AS (
      SELECT TO_NUMBER(mention.product_id) product_id,
             COUNT(*) total_posts,
             AVG(NVL(post.sentiment_score, .5)) avg_sentiment,
             SUM(NVL(post.likes_count, 0)) total_likes,
             SUM(NVL(post.shares_count, 0)) total_shares,
             SUM(NVL(post.views_count, 0)) total_views,
             AVG(NVL(post.virality_score, 0)) avg_virality,
             SUM(CASE WHEN post.momentum_flag IN ('viral','mega_viral') THEN 1 ELSE 0 END) viral_posts,
             SUM(CASE WHEN post.momentum_flag = 'rising' THEN 1 ELSE 0 END) rising_posts
      FROM (
        SELECT JSON_VALUE(row_data, '$.product_id') product_id,
               JSON_VALUE(row_data, '$.post_id') post_id
        FROM app_oml_candidate_rows
        WHERE generation_id = '${g}' AND entity_name = 'post_product_mentions'
      ) mention
      JOIN (
        SELECT source_id post_id,
               JSON_VALUE(row_data, '$.sentiment_score' RETURNING NUMBER) sentiment_score,
               JSON_VALUE(row_data, '$.likes_count' RETURNING NUMBER) likes_count,
               JSON_VALUE(row_data, '$.shares_count' RETURNING NUMBER) shares_count,
               JSON_VALUE(row_data, '$.views_count' RETURNING NUMBER) views_count,
               JSON_VALUE(row_data, '$.virality_score' RETURNING NUMBER) virality_score,
               JSON_VALUE(row_data, '$.momentum_flag') momentum_flag
        FROM app_oml_candidate_rows
        WHERE generation_id = '${g}' AND entity_name = 'social_posts'
      ) post ON post.post_id = mention.post_id
      GROUP BY TO_NUMBER(mention.product_id)
    ), sales AS (
      SELECT TO_NUMBER(item.product_id) product_id,
             SUM(NVL(item.quantity, 0)) units_sold,
             SUM(NVL(item.line_total, 0)) revenue
      FROM (
        SELECT JSON_VALUE(row_data, '$.product_id') product_id,
               JSON_VALUE(row_data, '$.order_id') order_id,
               JSON_VALUE(row_data, '$.quantity' RETURNING NUMBER) quantity,
               JSON_VALUE(row_data, '$.line_total' RETURNING NUMBER) line_total
        FROM app_oml_candidate_rows
        WHERE generation_id = '${g}' AND entity_name = 'order_items'
      ) item
      JOIN (
        SELECT source_id order_id, JSON_VALUE(row_data, '$.order_status') order_status
        FROM app_oml_candidate_rows
        WHERE generation_id = '${g}' AND entity_name = 'orders'
      ) order_stage ON order_stage.order_id = item.order_id
      WHERE order_stage.order_status NOT IN ('cancelled','returned')
      GROUP BY TO_NUMBER(item.product_id)
    ), features AS (
      SELECT product.product_id, product.category, product.unit_price,
             NVL(engagement.total_posts,0) total_posts,
             NVL(engagement.avg_sentiment,.5) avg_sentiment,
             NVL(engagement.total_likes,0) total_likes,
             NVL(engagement.total_shares,0) total_shares,
             NVL(engagement.total_views,0) total_views,
             NVL(engagement.avg_virality,0) avg_virality,
             NVL(engagement.viral_posts,0) viral_posts,
             NVL(engagement.rising_posts,0) rising_posts,
             NVL(sales.units_sold,0) units_sold,
             NVL(sales.revenue,0) revenue
      FROM products_stage product
      LEFT JOIN engagement ON engagement.product_id = product.product_id
      LEFT JOIN sales ON sales.product_id = product.product_id
    )
    SELECT features.*,
           CASE WHEN NTILE(4) OVER (
             ORDER BY avg_virality DESC, total_posts DESC, units_sold DESC, product_id
           ) = 1 THEN 'SURGE' ELSE 'STABLE' END surge_label
    FROM features
  `);
  await protectGenerationAssetAdminOnly(connection, trainingTables.DEMAND_SURGE_MODEL);
  await markGenerationAssetMaterialized(
    connection, generationId, 'TRAINING_TABLE', trainingTables.DEMAND_SURGE_MODEL
  );

  await execSql(connection, `
    CREATE TABLE ${trainingTables.CUSTOMER_SEGMENT_MODEL} AS
    WITH customers_stage AS (
      SELECT TO_NUMBER(source_id) customer_id,
             JSON_VALUE(row_data, '$.lifetime_value' RETURNING NUMBER) lifetime_value
      FROM app_oml_candidate_rows
      WHERE generation_id = '${g}' AND entity_name = 'customers'
    ), order_stage AS (
      SELECT source_id order_id,
             JSON_VALUE(row_data, '$.customer_id') customer_id,
             JSON_VALUE(row_data, '$.order_total' RETURNING NUMBER) order_total,
             JSON_VALUE(row_data, '$.order_status') order_status
      FROM app_oml_candidate_rows
      WHERE generation_id = '${g}' AND entity_name = 'orders'
    ), item_stage AS (
      SELECT JSON_VALUE(row_data, '$.order_id') order_id,
             JSON_VALUE(row_data, '$.quantity' RETURNING NUMBER) quantity
      FROM app_oml_candidate_rows
      WHERE generation_id = '${g}' AND entity_name = 'order_items'
    )
    SELECT customer.customer_id,
           NVL(customer.lifetime_value,0) lifetime_value,
           0 recency_days,
           COUNT(DISTINCT order_stage.order_id) frequency,
           SUM(NVL(order_stage.order_total,0)) monetary,
           AVG(NVL(order_stage.order_total,0)) avg_order_value,
           SUM(NVL(item_stage.quantity,0)) total_items
    FROM customers_stage customer
    JOIN order_stage ON order_stage.customer_id = TO_CHAR(customer.customer_id)
      AND order_stage.order_status NOT IN ('cancelled','returned')
    LEFT JOIN item_stage ON item_stage.order_id = order_stage.order_id
    GROUP BY customer.customer_id, customer.lifetime_value
  `);
  await protectGenerationAssetAdminOnly(connection, trainingTables.CUSTOMER_SEGMENT_MODEL);
  await markGenerationAssetMaterialized(
    connection, generationId, 'TRAINING_TABLE', trainingTables.CUSTOMER_SEGMENT_MODEL
  );

  await execSql(connection, `
    CREATE TABLE ${trainingTables.REVENUE_PREDICT_MODEL} AS
    WITH order_stage AS (
      SELECT TO_NUMBER(source_id) order_id,
             JSON_VALUE(row_data, '$.customer_id') customer_id,
             JSON_VALUE(row_data, '$.order_status') order_status,
             JSON_VALUE(row_data, '$.order_total' RETURNING NUMBER) order_total,
             JSON_VALUE(row_data, '$.shipping_cost' RETURNING NUMBER) shipping_cost,
             JSON_VALUE(row_data, '$.demand_score' RETURNING NUMBER) demand_score,
             JSON_VALUE(row_data, '$.fulfillment_center_id' RETURNING NUMBER) fulfillment_center_id
      FROM app_oml_candidate_rows
      WHERE generation_id = '${g}' AND entity_name = 'orders'
    ), customer_stage AS (
      SELECT source_id customer_id,
             JSON_VALUE(row_data, '$.customer_tier') customer_tier,
             JSON_VALUE(row_data, '$.lifetime_value' RETURNING NUMBER) lifetime_value
      FROM app_oml_candidate_rows
      WHERE generation_id = '${g}' AND entity_name = 'customers'
    ), item_stage AS (
      SELECT JSON_VALUE(row_data, '$.order_id') order_id,
             JSON_VALUE(row_data, '$.product_id') product_id,
             JSON_VALUE(row_data, '$.quantity' RETURNING NUMBER) quantity,
             JSON_VALUE(row_data, '$.unit_price' RETURNING NUMBER) unit_price
      FROM app_oml_candidate_rows
      WHERE generation_id = '${g}' AND entity_name = 'order_items'
    )
    SELECT orders_row.order_id, customer.customer_tier, orders_row.order_status,
           NVL(customer.lifetime_value,0) lifetime_value,
           NVL(orders_row.shipping_cost,0) shipping_cost,
           NVL(orders_row.demand_score,0) demand_score,
           NVL(orders_row.fulfillment_center_id,0) fulfillment_center_id,
           0 order_age_days,
           SUM(NVL(item.quantity,0)) item_count,
           COUNT(DISTINCT item.product_id) distinct_products,
           AVG(NVL(item.unit_price,0)) avg_item_price,
           MAX(NVL(item.unit_price,0)) max_item_price,
           NVL(orders_row.order_total,0) target_revenue
    FROM order_stage orders_row
    JOIN customer_stage customer ON customer.customer_id = orders_row.customer_id
    LEFT JOIN item_stage item ON item.order_id = TO_CHAR(orders_row.order_id)
    WHERE orders_row.order_status NOT IN ('cancelled','returned')
      AND NVL(orders_row.order_total,0) > 0
    GROUP BY orders_row.order_id, customer.customer_tier, orders_row.order_status,
             customer.lifetime_value, orders_row.shipping_cost, orders_row.demand_score,
             orders_row.fulfillment_center_id, orders_row.order_total
  `);
  await protectGenerationAssetAdminOnly(connection, trainingTables.REVENUE_PREDICT_MODEL);
  await markGenerationAssetMaterialized(
    connection, generationId, 'TRAINING_TABLE', trainingTables.REVENUE_PREDICT_MODEL
  );

  await execSql(connection, `
    CREATE TABLE ${trainingTables.PRODUCT_CLUSTER_MODEL} AS
    SELECT demand.product_id, demand.unit_price, 0 weight_kg,
           demand.units_sold, demand.revenue,
           demand.total_posts order_count,
           demand.total_likes + demand.total_shares + demand.total_views total_engagement,
           demand.avg_sentiment, demand.avg_virality
    FROM ${trainingTables.DEMAND_SURGE_MODEL} demand
  `);
  await protectGenerationAssetAdminOnly(connection, trainingTables.PRODUCT_CLUSTER_MODEL);
  await markGenerationAssetMaterialized(
    connection, generationId, 'TRAINING_TABLE', trainingTables.PRODUCT_CLUSTER_MODEL
  );

  const modelDefinitions = [
    {
      logicalName: 'DEMAND_SURGE_MODEL',
      miningFunction: 'CLASSIFICATION',
      caseId: 'PRODUCT_ID',
      target: 'SURGE_LABEL',
      settings: [
        ['ALGO_NAME', 'ALGO_RANDOM_FOREST'], ['PREP_AUTO', 'ON'], ['RFOR_NUM_TREES', '50'],
      ],
    },
    {
      logicalName: 'CUSTOMER_SEGMENT_MODEL',
      miningFunction: 'CLUSTERING',
      caseId: 'CUSTOMER_ID',
      settings: [
        ['ALGO_NAME', 'ALGO_KMEANS'], ['PREP_AUTO', 'ON'], ['CLUS_NUM_CLUSTERS', '4'],
      ],
    },
    {
      logicalName: 'REVENUE_PREDICT_MODEL',
      miningFunction: 'REGRESSION',
      caseId: 'ORDER_ID',
      target: 'TARGET_REVENUE',
      settings: [
        ['ALGO_NAME', 'ALGO_GENERALIZED_LINEAR_MODEL'], ['PREP_AUTO', 'ON'],
      ],
    },
    {
      logicalName: 'PRODUCT_CLUSTER_MODEL',
      miningFunction: 'CLUSTERING',
      caseId: 'PRODUCT_ID',
      settings: [
        ['ALGO_NAME', 'ALGO_KMEANS'], ['PREP_AUTO', 'ON'], ['CLUS_NUM_CLUSTERS', '5'],
      ],
    },
  ];

  const models = [];
  for (const definition of modelDefinitions) {
    throwIfOwnershipLost(ownership);
    const logicalName = definition.logicalName;
    const trainingTable = trainingTables[logicalName];
    const settingsTable = settingsTables[logicalName];
    const physicalName = physicalNames[logicalName];
    const countResult = await execSql(connection, `SELECT COUNT(*) row_count FROM ${trainingTable}`);
    const trainingRowCount = Number(countResult.rows?.[0]?.ROW_COUNT || 0);
    const trainingFingerprint = await fingerprintTrainingTable(
      connection,
      trainingTable,
      definition.caseId
    );
    await execSql(connection, `
      INSERT INTO app_oml_generation_models(
        generation_id, logical_name, physical_name, training_table,
        settings_table, training_fingerprint, training_row_count,
        status, validated_at
      ) VALUES(
        :generationId, :logicalName, :physicalName, :trainingTable,
        :settingsTable, :trainingFingerprint, :trainingRowCount,
        'staged', NULL
      )
    `, {
      generationId, logicalName, physicalName, trainingTable, settingsTable,
      trainingFingerprint, trainingRowCount,
    });
    await assertOwnershipBeforeCommit(connection, ownership);
    await connection.commit();
    await execSql(connection,
      `CREATE TABLE ${settingsTable} (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))`);
    await protectGenerationAssetAdminOnly(connection, settingsTable);
    await markGenerationAssetMaterialized(
      connection, generationId, 'SETTINGS_TABLE', settingsTable
    );
    for (const [settingName, settingValue] of definition.settings) {
      await execSql(connection,
        `INSERT INTO ${settingsTable}(setting_name, setting_value) VALUES(:settingName, :settingValue)`,
        { settingName, settingValue });
    }
    await assertOwnershipBeforeCommit(connection, ownership);
    await connection.commit();
    const miningFunction = definition.miningFunction === 'CLASSIFICATION'
      ? 'DBMS_DATA_MINING.CLASSIFICATION'
      : definition.miningFunction === 'REGRESSION'
        ? 'DBMS_DATA_MINING.REGRESSION'
        : 'DBMS_DATA_MINING.CLUSTERING';
    await execSql(connection, `
      BEGIN
        DBMS_DATA_MINING.CREATE_MODEL(
          model_name => '${physicalName}',
          mining_function => ${miningFunction},
          data_table_name => '${trainingTable}',
          case_id_column_name => '${definition.caseId}',
          ${definition.target ? `target_column_name => '${definition.target}',` : ''}
          settings_table_name => '${settingsTable}'
        );
      END;
    `);
    await markGenerationAssetMaterialized(
      connection, generationId, 'MODEL', physicalName
    );
    models.push({
      logicalName, physicalName, trainingTable, settingsTable,
      trainingRowCount, trainingFingerprint,
    });
    const modelFailurePhase = {
      DEMAND_SURGE_MODEL: 'after_demand_model',
      CUSTOMER_SEGMENT_MODEL: 'after_customer_model',
      REVENUE_PREDICT_MODEL: 'after_revenue_model',
      PRODUCT_CLUSTER_MODEL: 'after_product_model',
    }[logicalName];
    injectSemanticFailure(modelFailurePhase);
  }
  await assertOwnershipBeforeCommit(connection, ownership);
  await connection.commit();

  await validatePersistedOmlModels(connection, { generationId, fingerprint, models });
  await execSql(connection, `
    UPDATE app_oml_generation_models
    SET status = 'validated', validated_at = SYSTIMESTAMP
    WHERE generation_id = :generationId
  `, { generationId });
  await execSql(connection, `
    UPDATE app_oml_generations
    SET status = 'validated', updated_at = SYSTIMESTAMP
    WHERE generation_id = :generationId
  `, { generationId });
  await assertOwnershipBeforeCommit(connection, ownership);
  await connection.commit();
  return { generationId, fingerprint, models };
}

async function validatePersistedOmlModels(connection, candidate = null) {
  try {
    const modelMap = Object.fromEntries(OML_LOGICAL_NAMES.map((logicalName) => {
      const candidateModel = candidate?.models?.find((model) => model.logicalName === logicalName);
      return [logicalName, safeOracleIdentifier(candidateModel?.physicalName || logicalName)];
    }));
    const tableMap = candidate && !candidate.validateActiveRows
      ? Object.fromEntries(candidate.models.map((model) => [
          model.logicalName, safeOracleIdentifier(model.trainingTable),
        ]))
      : {
          DEMAND_SURGE_MODEL: 'OML_DEMAND_TRAINING_V',
          CUSTOMER_SEGMENT_MODEL: 'OML_CUSTOMER_SEGMENT_V',
          REVENUE_PREDICT_MODEL: 'OML_REVENUE_TRAINING_V',
          PRODUCT_CLUSTER_MODEL: 'OML_PRODUCT_CLUSTER_V',
        };
    const physicalList = OML_LOGICAL_NAMES
      .map((logicalName) => `'${modelMap[logicalName]}'`)
      .join(', ');
    const modelResult = await execSql(connection, `
      SELECT model_name
      FROM user_mining_models
      WHERE model_name IN (${physicalList})
      ORDER BY model_name
    `);

    const existingModels = (modelResult.rows || [])
      .map((row) => row.MODEL_NAME || row.model_name)
      .filter(Boolean);

    if (existingModels.length !== 4) {
      throw new ImportError('Required Media OML models are unavailable.', 503);
    }
    const probes = [
      `SELECT PREDICTION(${modelMap.DEMAND_SURGE_MODEL} USING *) prediction
       FROM ${tableMap.DEMAND_SURGE_MODEL} FETCH FIRST 1 ROW ONLY`,
      `SELECT CLUSTER_ID(${modelMap.CUSTOMER_SEGMENT_MODEL} USING *) prediction
       FROM ${tableMap.CUSTOMER_SEGMENT_MODEL} FETCH FIRST 1 ROW ONLY`,
      `SELECT PREDICTION(${modelMap.REVENUE_PREDICT_MODEL} USING *) prediction
       FROM ${tableMap.REVENUE_PREDICT_MODEL} FETCH FIRST 1 ROW ONLY`,
      `SELECT CLUSTER_ID(${modelMap.PRODUCT_CLUSTER_MODEL} USING *) prediction
       FROM ${tableMap.PRODUCT_CLUSTER_MODEL} FETCH FIRST 1 ROW ONLY`,
    ];
    for (const sql of probes) {
      const probe = await execSql(connection, sql);
      if (!probe.rows?.length || probe.rows[0].PREDICTION == null) {
        throw new ImportError('A required Media OML model returned no score.', 503);
      }
    }
    return {
      checked: true,
      executionValidated: existingModels,
      rebuildMode: candidate ? 'generation-staged-models' : 'bootstrap-models',
      generationId: candidate?.generationId || 'bootstrap',
      trainingFingerprint: candidate?.fingerprint || null,
      destructiveDdl: false,
    };
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError(`Required OML model refresh failed: ${err.message}`, 503);
  }
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

async function assertApplicationContextVpdReadiness(connection) {
  const countProducts = async () => {
    const result = await execSql(connection, 'SELECT COUNT(*) row_count FROM products');
    return Number(result.rows?.[0]?.ROW_COUNT || 0);
  };
  try {
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    const adminCount = await countProducts();
    if (adminCount < 1) throw new Error('Admin sees no Media products');

    await db.clearSecurityContext(connection, { autoCommit: false });
    if (await countProducts() !== 0) throw new Error('No-context VPD did not fail closed');

    await db.setSecurityContext(connection, 'viewer_sam', { autoCommit: false });
    if (await countProducts() !== 0) throw new Error('Viewer VPD did not remain restricted');

    await db.setSecurityContext(connection, 'analyst_raj', { autoCommit: false });
    if (await countProducts() !== adminCount) {
      throw new Error('Analyst global SELECT scope differs from Admin');
    }

    await db.setSecurityContext(connection, 'fm_west_maria', { autoCommit: false });
    const regional = await execSql(connection, `
      SELECT COUNT(*) row_count,
             COUNT(CASE WHEN state_province = 'California' THEN 1 END) scoped_count
      FROM fulfillment_centers
    `);
    const regionalRow = regional.rows?.[0] || {};
    if (Number(regionalRow.ROW_COUNT || 0) < 1
        || Number(regionalRow.ROW_COUNT) !== Number(regionalRow.SCOPED_COUNT)) {
      throw new Error('Fulfillment Manager regional VPD scope is incorrect');
    }

    let unknownDenied = false;
    try {
      await db.setSecurityContext(connection, 'unknown_media_identity', { autoCommit: false });
    } catch (error) {
      unknownDenied = /ORA-20080|unknown or inactive/i.test(String(error.message || error));
    }
    if (!unknownDenied) throw new Error('Unknown Media identity was not denied');
  } finally {
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
  }
}

async function executeVectorGenerationProof(
  connection,
  generationId,
  expectedDatasetFingerprint = null
) {
  const generationResult = await execSql(connection, `
    SELECT source_fingerprint
    FROM app_oml_generations
    WHERE generation_id = :generationId
      AND status IN ('staging', 'validated', 'active')
  `, { generationId });
  const datasetFingerprint = String(
    generationResult.rows?.[0]?.SOURCE_FINGERPRINT || ''
  ).trim().toLowerCase();
  if (generationResult.rows?.length !== 1
      || !/^[0-9a-f]{64}$/.test(datasetFingerprint)
      || (expectedDatasetFingerprint
        && datasetFingerprint !== String(
          expectedDatasetFingerprint
        ).toLowerCase())) {
    throw new ImportError(
      'Required Media Vector generation fingerprint is unavailable or stale.',
      503
    );
  }
  const integrity = assertMediaVectorEvidence(
    await collectMediaVectorEvidence(connection, {
      accessScope: 'GLOBAL',
      generationId,
      datasetFingerprint,
    })
  );
  const proof = await executeWithExactPlanEvidence(connection, {
    generationId,
    datasetFingerprint,
    feature: 'VECTOR',
    sql: `
      SELECT *
      FROM (
        SELECT /*+ GATHER_PLAN_STATISTICS
                   VECTOR_INDEX_TRANSFORM(pe idx_product_vec) */
               p.product_id,
               VECTOR_DISTANCE(
                 pe.embedding,
                 VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING 'content demand' AS DATA),
                 COSINE
               ) distance
        FROM product_embeddings pe
        JOIN products p ON p.product_id = pe.product_id
        ORDER BY VECTOR_DISTANCE(
          pe.embedding,
          VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING 'content demand' AS DATA),
          COSINE
        )
        FETCH APPROXIMATE FIRST 3 ROWS ONLY
      )
      ORDER BY distance, product_id
    `,
    requiredPlan: (row) => (
      String(row.OBJECT_NAME || '').toUpperCase() === 'IDX_PRODUCT_VEC'
    ),
    requiredIndexName: 'IDX_PRODUCT_VEC',
    requiredTableName: 'PRODUCT_EMBEDDINGS',
    indexBindings: integrity.evidence.indexBindings,
    forbiddenFullScanTables: [
      'PRODUCT_EMBEDDINGS',
      'POST_EMBEDDINGS',
    ],
    requireNonEmptyResult: true,
  });
  return { ...proof, integrity };
}

async function executeSpatialGenerationProof(connection, generationId) {
  const spatialIndexBindings = await collectExactSpatialIndexBindings(
    connection
  );
  return executeWithExactPlanEvidence(connection, {
    generationId,
    feature: 'SPATIAL',
    sql: `
      WITH origin AS (
        SELECT location
        FROM (
          SELECT customer.location
          FROM customers customer
          WHERE customer.location IS NOT NULL
          ORDER BY customer.customer_id
        )
        WHERE ROWNUM = 1
      ),
      indexed_candidates AS (
        SELECT /*+ GATHER_PLAN_STATISTICS LEADING(origin)
                   USE_NL(center) INDEX(center idx_fc_spatial) */
               :generationId proof_generation_id,
               center.center_id,
               center.location center_location,
               origin.location origin_location
        FROM origin
        JOIN fulfillment_centers center
          ON SDO_NN(
               center.location,
               origin.location,
               'sdo_batch_size=50 unit=KM'
             ) = 'TRUE'
        WHERE center.location IS NOT NULL
      )
      SELECT proof_generation_id,
             center_id,
             ROUND(
               SDO_GEOM.SDO_DISTANCE(
                 origin_location,
                 center_location,
                 0.005,
                 'unit=KM'
               ),
               5
             ) distance_km
      FROM indexed_candidates
      ORDER BY distance_km, center_id
      FETCH FIRST 3 ROWS ONLY
    `,
    binds: { generationId },
    requiredPlan: (row) => (
      String(row.OBJECT_NAME || '').toUpperCase() === 'IDX_FC_SPATIAL'
    ),
    requiredSpatialIndexName: 'IDX_FC_SPATIAL',
    requiredSpatialTableName: 'FULFILLMENT_CENTERS',
    requiredSpatialColumnName: 'LOCATION',
    spatialIndexBindings,
    forbiddenSpatialFullScanTables: ['FULFILLMENT_CENTERS'],
    requireNonEmptyResult: true,
  });
}

async function assertRequiredFeatureReadiness(
  connection,
  omlCandidate = null,
  {
    spatialProof: precomputedSpatialProof = null,
    nativeJsonProbe: precomputedNativeJsonProbe = null,
  } = {}
) {
  const generationId = omlCandidate?.generationId || 'bootstrap';
  const auditGenerationToken = canonicalAuditGenerationToken(generationId);
  const omlModelNames = omlCandidate
    ? omlCandidate.models.map((model) => safeOracleIdentifier(model.physicalName))
    : OML_LOGICAL_NAMES;
  const omlModelList = omlModelNames.map((name) => `'${name}'`).join(', ');
  injectSemanticFailure('application_context_vpd_readiness');
  await assertApplicationContextVpdReadiness(connection);
  const canonicalVpdInventory = await verifyMediaCanonicalPolicyInventory({
    connection,
    execute: async (activeConnection, sql, binds) => execSql(
      activeConnection,
      sql,
      binds
    ),
  });

  // Candidate DML is not visible to In-Memory population until activation
  // commits. This phase verifies configuration only; stabilization performs
  // population and exact cursor proof before readiness becomes ACTIVE.
  injectSemanticFailure('vector_readiness');
  const vectorProof = await executeVectorGenerationProof(connection, generationId);
  if (!vectorProof.result.rows?.length) {
    throw new ImportError('Required Media Vector search returned no result.', 503);
  }

  injectSemanticFailure('graph_readiness');
  const graphProbe = await execSql(connection, `
    SELECT COUNT(*) graph_rows
    FROM GRAPH_TABLE ( influencer_network
      MATCH (source IS influencer) -[edge IS connects_to]-> (target IS influencer)
      COLUMNS (
        source.influencer_id AS source_id,
        target.influencer_id AS target_id
      )
    )
  `);
  if (Number(graphProbe.rows?.[0]?.GRAPH_ROWS || 0) < 1) {
    throw new ImportError('Required Media SQL/PGQ graph traversal returned no rows.', 503);
  }

  injectSemanticFailure('duality_readiness');
  const productDualityProbe = await execSql(connection,
    `SELECT data FROM products_inventory_dv FETCH FIRST 1 ROW ONLY`);
  const orderDualityProbe = await execSql(connection,
    `SELECT data FROM orders_dv FETCH FIRST 1 ROW ONLY`);
  if (!productDualityProbe.rows?.length || !orderDualityProbe.rows?.length) {
    throw new ImportError('Required Media native Duality execution returned no document.', 503);
  }

  injectSemanticFailure('spatial_readiness');
  const spatialProof = precomputedSpatialProof
    || await executeSpatialGenerationProof(connection, generationId);
  if (!spatialProof.result.rows?.length) {
    throw new ImportError('Required Media Spatial nearest-neighbor probe returned no rows.', 503);
  }

  injectSemanticFailure('native_json_readiness');
  const jsonProbe = precomputedNativeJsonProbe || await execSql(connection, `
    SELECT
      (SELECT /*+ FULL(attribute_row) NO_INDEX(attribute_row) */ COUNT(*)
       FROM product_attributes attribute_row
       WHERE JSON_VALUE(attribute_row.attributes, '$.sku') IS NOT NULL
         AND JSON_EXISTS(attribute_row.attributes, '$.contentType')) native_json_rows,
      (SELECT /*+ FULL(payload_row) NO_INDEX(payload_row) */ COUNT(*)
       FROM social_post_payloads payload_row
       WHERE JSON_VALUE(payload_row.raw_payload, '$.postId') IS NOT NULL
         AND JSON_EXISTS(payload_row.enrichments, '$.momentum')) social_payload_rows,
      (SELECT COUNT(*) FROM social_posts) social_post_rows,
      (SELECT COUNT(*) FROM event_stream
       WHERE JSON_EXISTS(event_data, '$.datasetVersion')) event_json_rows
    FROM dual
  `);
  if (Number(jsonProbe.rows?.[0]?.NATIVE_JSON_ROWS || 0) < 1) {
    throw new ImportError('Required Media native JSON operator probe returned no rows.', 503);
  }
  if (Number(jsonProbe.rows?.[0]?.SOCIAL_PAYLOAD_ROWS || 0)
      !== Number(jsonProbe.rows?.[0]?.SOCIAL_POST_ROWS || 0)) {
    throw new ImportError('Required Media social payload JSON coverage is incomplete.', 503);
  }

  injectSemanticFailure('audit_readiness');
  const clientIdentifier = await execSql(connection, `
    SELECT SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER') client_identifier
    FROM dual
  `);
  if (String(clientIdentifier.rows?.[0]?.CLIENT_IDENTIFIER || '').toLowerCase() !== 'admin_jess') {
    throw new ImportError('Required Media audit persona correlation is unavailable.', 503);
  }

  const deniedTargetResult = await execSql(connection, `
    SELECT center_id, state_province
    FROM fulfillment_centers
    WHERE UPPER(state_province) = 'CALIFORNIA'
    ORDER BY center_id
    FETCH FIRST 1 ROW ONLY
  `);
  const deniedTarget = deniedTargetResult.rows?.[0];
  const deniedTargetId = Number(deniedTarget?.CENTER_ID || 0);
  if (deniedTargetId < 1
      || String(deniedTarget?.STATE_PROVINCE || '') !== 'California') {
    throw new ImportError(
      'Required Media VPD audit target does not exist in the Admin scope.',
      503
    );
  }

  const allowedAuditResult = await execSql(connection, `
    UPDATE /* MEDIA_AUDIT_ALLOWED_${auditGenerationToken} */ orders
    SET updated_at = updated_at
    WHERE order_id = (SELECT MIN(order_id) FROM orders)
  `);
  if (Number(allowedAuditResult.rowsAffected || 0) !== 1) {
    throw new ImportError('Required Media allowed audit statement did not affect one row.', 503);
  }
  let deniedStatementFailed = false;
  let unifiedAuditDeniedReturnCode = null;
  try {
    await db.setSecurityContext(connection, 'fm_west_maria', { autoCommit: false });
    const deniedResult = await execSql(connection, `
      UPDATE /* MEDIA_AUDIT_DENIED_${auditGenerationToken} */ fulfillment_centers
      SET state_province = 'Georgia'
      WHERE center_id = :deniedTargetId
    `, { deniedTargetId });
    throw new ImportError(
      `Regional VPD UPDATE_CHECK statement was not denied (rowsAffected=${Number(deniedResult.rowsAffected || 0)}).`,
      503
    );
  } catch (error) {
    const exactOracleCode = Number(error?.errorNum || 0) === 28115
      || /ORA-28115\b/i.test(String(error.message || error));
    if (exactOracleCode) {
      deniedStatementFailed = true;
      unifiedAuditDeniedReturnCode = 28115;
    } else {
      throw error;
    }
  } finally {
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
  }
  if (!deniedStatementFailed) {
    throw new ImportError('Required Media denied audit statement did not fail.', 503);
  }
  const unchangedTargetResult = await execSql(connection, `
    SELECT center_id, state_province
    FROM fulfillment_centers
    WHERE center_id = :deniedTargetId
  `, { deniedTargetId });
  const unchangedTarget = unchangedTargetResult.rows?.[0];
  const unifiedAuditTargetUnchanged = Number(unchangedTarget?.CENTER_ID || 0) === deniedTargetId
    && String(unchangedTarget?.STATE_PROVINCE || '') === 'California';
  if (!unifiedAuditTargetUnchanged) {
    throw new ImportError(
      'Required Media VPD UPDATE_CHECK proof changed or lost its Admin target.',
      503
    );
  }

  const result = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM user_mining_models
       WHERE model_name = '${VECTOR_MODEL_NAME}') vector_model_count,
      (SELECT COUNT(*) FROM user_mining_models
       WHERE model_name IN (${omlModelList})) oml_model_count,
      (SELECT COUNT(*) FROM products) product_count,
      (SELECT COUNT(*) FROM product_embeddings WHERE embedding IS NOT NULL) product_vector_count,
      (SELECT COUNT(*) FROM social_posts) post_count,
      (SELECT COUNT(*) FROM post_embeddings WHERE embedding IS NOT NULL) post_vector_count,
      (SELECT COUNT(*) FROM product_attributes) native_json_count,
      (SELECT COUNT(*) FROM event_stream) event_json_count,
      (SELECT COUNT(*) FROM social_post_payloads) social_payload_count,
      (SELECT COUNT(*) FROM user_json_duality_views
       WHERE view_name IN ('ORDERS_DV','PRODUCTS_INVENTORY_DV')) duality_view_count,
      (SELECT COUNT(*) FROM user_property_graphs
       WHERE graph_name = 'INFLUENCER_NETWORK') property_graph_count,
      (SELECT COUNT(*) FROM user_indexes
       WHERE index_name IN ('IDX_FC_SPATIAL','IDX_CUST_SPATIAL')
         AND status = 'VALID') spatial_index_count,
      (SELECT COUNT(*) FROM user_policies
       WHERE policy_type IN ('CONTEXT SENSITIVE','CONTEXT_SENSITIVE')) vpd_policy_count,
      (SELECT COUNT(*) FROM user_tables
       WHERE table_name IN ('CUSTOMERS','ORDERS','ORDER_ITEMS','SOCIAL_POSTS')
         AND inmemory = 'ENABLED') inmemory_configured_count,
      (SELECT COUNT(*) FROM sys.audit_unified_enabled_policies
       WHERE policy_name = 'SC_ORDER_AUDIT'
         AND entity_name = 'ALL USERS') audit_enabled_count
    FROM dual
  `);
  const row = result.rows?.[0] || {};
  const readiness = {
    applicationContextVpd: Number(row.VPD_POLICY_COUNT || 0)
      === canonicalVpdInventory.policyInventory.length,
    duality: Number(row.DUALITY_VIEW_COUNT || 0) === 2,
    vector: vectorProof.integrity?.ready === true
      && vectorProof.integrity?.scopedEmpty !== true,
    vectorIntegrity: vectorProof.integrity?.evidence || null,
    vectorEvidence: vectorProof.evidence || null,
    graph: Number(row.PROPERTY_GRAPH_COUNT || 0) === 1,
    spatial: Number(row.SPATIAL_INDEX_COUNT || 0) === 2,
    spatialEvidence: spatialProof.evidence || null,
    oml: Number(row.OML_MODEL_COUNT || 0) === 4,
    nativeJson:
      Number(jsonProbe.rows?.[0]?.NATIVE_JSON_ROWS || 0) === Number(row.PRODUCT_COUNT || 0)
      && Number(jsonProbe.rows?.[0]?.EVENT_JSON_ROWS || 0) > 0
      && Number(jsonProbe.rows?.[0]?.SOCIAL_PAYLOAD_ROWS || 0) === Number(row.POST_COUNT || 0),
    inMemoryConfigured: Number(row.INMEMORY_CONFIGURED_COUNT || 0) === 4,
    inMemoryExecution: false,
    unifiedAuditConfigured: Number(row.AUDIT_ENABLED_COUNT || 0) === 1,
    unifiedAuditDeniedReturnCode,
    unifiedAuditTargetUnchanged,
    dateWindows: true,
  };
  const requiredBooleanReadiness = [
    'applicationContextVpd',
    'duality',
    'vector',
    'graph',
    'spatial',
    'oml',
    'nativeJson',
    'inMemoryConfigured',
    'unifiedAuditConfigured',
    'unifiedAuditTargetUnchanged',
    'dateWindows',
  ];
  const failed = requiredBooleanReadiness
    .filter((name) => readiness[name] !== true)
    .map((name) => [name, readiness[name]]);
  if (failed.length) {
    throw new ImportError(
      `Required Oracle feature readiness failed: ${failed.map(([name]) => name).join(', ')}.`,
      503,
      { readiness }
    );
  }
  return readiness;
}

async function stabilizeCommittedInMemory(
  connection,
  generationId,
  ownership = null
) {
  throwIfOwnershipLost(ownership);
  for (const tableName of ['CUSTOMERS', 'ORDERS', 'ORDER_ITEMS', 'SOCIAL_POSTS']) {
    throwIfOwnershipLost(ownership);
    await execSql(connection, `BEGIN DBMS_STATS.GATHER_TABLE_STATS(USER, '${tableName}'); END;`);
    await execSql(connection, `BEGIN DBMS_INMEMORY.POPULATE(USER, '${tableName}'); END;`);
  }
  let segmentInventory = [];
  for (let attempt = 0; attempt < 90; attempt += 1) {
    throwIfOwnershipLost(ownership);
    segmentInventory = await collectExactInMemorySegmentInventory(connection);
    const exactTables = new Set(
      segmentInventory.map((row) => String(row.TABLE_NAME || '').toUpperCase())
    );
    const exactInventory = segmentInventory.length === 4
      && ['CUSTOMERS', 'ORDERS', 'ORDER_ITEMS', 'SOCIAL_POSTS']
        .every((tableName) => exactTables.has(tableName))
      && segmentInventory.every((row) => (
        String(row.TABLE_INMEMORY || '').toUpperCase() === 'ENABLED'
        && String(row.PRIORITY || '').toUpperCase() === 'HIGH'
        && String(row.COMPRESSION || '').toUpperCase() === 'FOR QUERY LOW'
        && String(row.STATUS || '').toUpperCase() === 'COMPLETED'
        && Number(row.ROW_COUNT || 0) > 0
        && Number(row.IM_BYTES || 0) > 0
        && row.BYTES_NOT_POPULATED != null
        && Number(row.BYTES_NOT_POPULATED) === 0
      ));
    if (exactInventory) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (segmentInventory.length !== 4
      || segmentInventory.some((row) => (
        String(row.TABLE_INMEMORY || '').toUpperCase() !== 'ENABLED'
        || String(row.PRIORITY || '').toUpperCase() !== 'HIGH'
        || String(row.COMPRESSION || '').toUpperCase() !== 'FOR QUERY LOW'
        || String(row.STATUS || '').toUpperCase() !== 'COMPLETED'
        || Number(row.ROW_COUNT || 0) < 1
        || Number(row.IM_BYTES || 0) < 1
        || row.BYTES_NOT_POPULATED == null
        || Number(row.BYTES_NOT_POPULATED) !== 0
      ))) {
    console.warn(
      'Committed Media dataset is not yet backed by the exact four-segment In-Memory inventory.'
    );
    return false;
  }

  await execSql(connection, 'ALTER SESSION SET INMEMORY_QUERY = ENABLE');
  const proof = await executeWithExactPlanEvidence(connection, {
    generationId,
    feature: 'INMEMORY',
    sql: `
    SELECT /*+ GATHER_PLAN_STATISTICS FULL(customer) NO_INDEX(customer) */
           :generationId proof_generation_id,
           customer.customer_tier,
           COUNT(*) customer_count,
           SUM(customer.lifetime_value) total_lifetime_value
    FROM customers customer
    GROUP BY customer.customer_tier
  `,
    binds: { generationId },
    requiredPlan: (row) => (
      row.OPERATION === 'TABLE ACCESS'
      && row.OPTIONS === 'INMEMORY FULL'
      && String(row.OBJECT_NAME || '').toUpperCase() === 'CUSTOMERS'
    ),
    requiredInMemoryTableName: 'CUSTOMERS',
    inMemorySegmentInventory: segmentInventory,
    requireNonEmptyResult: true,
  });
  await assertOwnershipBeforeCommit(connection, ownership);
  await connection.commit();
  return proof.evidence;
}

function canonicalFingerprintValue(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(canonicalFingerprintValue);
  // node-oracledb DbObject instances (for example SDO_GEOMETRY) expose their
  // attributes through a native JSON representation. Object.keys() instead
  // reveals the private, recursive _impl graph and will overflow the stack.
  if (value?.constructor?.name === 'DbObject') {
    return canonicalFingerprintValue(JSON.parse(JSON.stringify(value)));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      canonicalFingerprintValue(value[key]),
    ]));
  }
  return value;
}

function hashFingerprintPayload(value) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonicalFingerprintValue(value)))
    .digest('hex');
}

function summarizeFingerprintRows(rows) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  return {
    rowCount: normalizedRows.length,
    sha256: hashFingerprintPayload(normalizedRows),
  };
}

function summarizeFingerprintMap(rowMap) {
  return Object.fromEntries(
    Object.entries(rowMap).map(([name, rows]) => [
      name,
      summarizeFingerprintRows(rows),
    ])
  );
}

async function fingerprintQuery(connection, sql, binds = {}) {
  const result = await execSql(connection, sql, binds);
  return result.rows || [];
}

async function captureApplicationContextVpdOutcomes(connection) {
  const countRows = async (sql) => {
    const rows = await fingerprintQuery(connection, sql);
    return Number(rows[0]?.ROW_COUNT || 0);
  };
  const outcomes = {};
  try {
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    outcomes.adminProductRows = await countRows(
      'SELECT COUNT(*) row_count FROM products'
    );

    await db.clearSecurityContext(connection, { autoCommit: false });
    outcomes.missingContextProductRows = await countRows(
      'SELECT COUNT(*) row_count FROM products'
    );

    await db.setSecurityContext(connection, 'viewer_sam', { autoCommit: false });
    outcomes.restrictedViewerProductRows = await countRows(
      'SELECT COUNT(*) row_count FROM products'
    );

    await db.setSecurityContext(connection, 'analyst_raj', { autoCommit: false });
    outcomes.analystProductRows = await countRows(
      'SELECT COUNT(*) row_count FROM products'
    );

    await db.setSecurityContext(connection, 'fm_west_maria', { autoCommit: false });
    outcomes.regionalFulfillmentRows = await fingerprintQuery(connection, `
      SELECT state_province, COUNT(*) row_count
      FROM fulfillment_centers
      GROUP BY state_province
      ORDER BY state_province
    `);

    try {
      await db.setSecurityContext(connection, 'unknown_media_identity', {
        autoCommit: false,
      });
      outcomes.unknownIdentity = { denied: false, oracleError: null };
    } catch (error) {
      const errorText = String(error.message || error);
      outcomes.unknownIdentity = {
        denied: /ORA-20080|unknown or inactive/i.test(errorText),
        oracleError: errorText.match(/ORA-\d+/i)?.[0]?.toUpperCase() || null,
      };
    }
  } finally {
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
  }
  return outcomes;
}

async function captureActiveSurfaceFingerprints(connection) {
  const activeState = await fingerprintQuery(connection, `
    SELECT state.active_source, state.active_version,
           job.candidate_generation_id generation_id,
           JSON_SERIALIZE(readiness.readiness RETURNING CLOB) readiness,
           readiness.activated_at
    FROM app_dataset_state state
    CROSS JOIN app_dataset_readiness readiness
    JOIN app_dataset_jobs job ON job.job_id = readiness.job_id
    WHERE state.state_id = 1
      AND readiness.readiness_id = 1
      AND readiness.status = 'ACTIVE'
  `);
  const activeGenerationId = activeState[0]?.GENERATION_ID || null;

  const baseRows = {};
  for (const table of TABLES) {
    const tableName = table.name;
    const primaryKey = safeOracleIdentifier(TABLE_BY_NAME[tableName].pk);
    baseRows[tableName] = await fingerprintQuery(
      connection,
      `SELECT * FROM ${safeOracleIdentifier(tableName)} ORDER BY ${primaryKey}`
    );
  }

  const canonicalPolicyInventory = await verifyMediaCanonicalPolicyInventory({
    connection,
    execute: async (activeConnection, sql, binds) => ({
      rows: await fingerprintQuery(activeConnection, sql, binds),
    }),
  });
  const applicationContextVpd = canonicalPolicyInventory.policyInventory;
  const applicationContextVpdOutcomes = await captureApplicationContextVpdOutcomes(
    connection
  );
  const dualityMetadata = await fingerprintQuery(connection, `
    SELECT view_name
    FROM user_json_duality_views
    WHERE view_name IN ('ORDERS_DV','PRODUCTS_INVENTORY_DV')
    ORDER BY view_name
  `);
  const dualityDocuments = await fingerprintQuery(connection, `
    SELECT 'ORDER' document_type,
           JSON_VALUE(data, '$._id' RETURNING NUMBER) document_id,
           JSON_SERIALIZE(data RETURNING CLOB) document
    FROM orders_dv
    UNION ALL
    SELECT 'PRODUCT',
           JSON_VALUE(data, '$._id' RETURNING NUMBER),
           JSON_SERIALIZE(data RETURNING CLOB)
    FROM products_inventory_dv
    ORDER BY 1, 2
  `);
  const dualityRelationalParity = {
    orders: await fingerprintQuery(connection, `
      SELECT order_row.order_id, order_row.customer_id, order_row.order_status,
             order_row.order_total, order_row.shipping_cost,
             order_row.demand_score, order_row.created_at
      FROM orders order_row
      ORDER BY order_row.order_id
    `),
    orderItems: await fingerprintQuery(connection, `
      SELECT item_id, order_id, product_id, quantity, unit_price
      FROM order_items
      ORDER BY order_id, item_id
    `),
    products: await fingerprintQuery(connection, `
      SELECT product.product_id, product.sku, product.product_name,
             product.category, product.unit_price, product.brand_id
      FROM products product
      ORDER BY product.product_id
    `),
    inventory: await fingerprintQuery(connection, `
      SELECT inventory_id, product_id, center_id,
             quantity_on_hand, quantity_reserved
      FROM inventory
      ORDER BY product_id, inventory_id
    `),
  };
  const nativeJsonMetadata = await fingerprintQuery(connection, `
    SELECT table_name, column_name, data_type, nullable
    FROM user_tab_columns
    WHERE (table_name = 'PRODUCT_ATTRIBUTES' AND column_name = 'ATTRIBUTES')
       OR (table_name = 'EVENT_STREAM' AND column_name = 'EVENT_DATA')
       OR (table_name = 'SOCIAL_POST_PAYLOADS'
           AND column_name IN ('RAW_PAYLOAD','ENRICHMENTS'))
    ORDER BY table_name, column_name
  `);
  const nativeJsonDocuments = await fingerprintQuery(connection, `
    SELECT 'PRODUCT' document_type, TO_CHAR(product_id) document_id,
           JSON_SERIALIZE(attributes RETURNING CLOB) document
    FROM product_attributes
    UNION ALL
    SELECT 'EVENT', TO_CHAR(event_id),
           JSON_SERIALIZE(event_data RETURNING CLOB)
    FROM event_stream
    UNION ALL
    SELECT 'SOCIAL_PAYLOAD', TO_CHAR(payload_id),
           JSON_SERIALIZE(raw_payload RETURNING CLOB)
    FROM social_post_payloads
    ORDER BY 1, 2
  `);
  const nativeJsonInvalidDocuments = await fingerprintQuery(connection, `
    SELECT SUM(invalid_count) invalid_document_count
    FROM (
      SELECT COUNT(*) invalid_count
      FROM product_attributes
      WHERE attributes IS NULL
      UNION ALL
      SELECT COUNT(*)
      FROM event_stream
      WHERE event_data IS NULL
      UNION ALL
      SELECT COUNT(*)
      FROM social_post_payloads
      WHERE raw_payload IS NULL OR enrichments IS NULL
    )
  `);
  const productEmbeddingRows = await fingerprintQuery(connection, `
    SELECT product_id, embedding_text, embedding embedding_value
    FROM product_embeddings
    ORDER BY product_id
  `);
  const postEmbeddingRows = await fingerprintQuery(connection, `
    SELECT post_id, embedding_text, embedding embedding_value
    FROM post_embeddings
    ORDER BY post_id
  `);
  const vectorArtifacts = {
    model: await fingerprintQuery(connection, `
      SELECT model_name, mining_function, algorithm
      FROM user_mining_models
      WHERE model_name = '${VECTOR_MODEL_NAME}'
    `),
    dimensions: {
      product: Array.from(new Set(productEmbeddingRows.map(
        (row) => ArrayBuffer.isView(row.EMBEDDING_VALUE)
          ? row.EMBEDDING_VALUE.length
          : (Array.isArray(row.EMBEDDING_VALUE) ? row.EMBEDDING_VALUE.length : null)
      ))).sort(),
      post: Array.from(new Set(postEmbeddingRows.map(
        (row) => ArrayBuffer.isView(row.EMBEDDING_VALUE)
          ? row.EMBEDDING_VALUE.length
          : (Array.isArray(row.EMBEDDING_VALUE) ? row.EMBEDDING_VALUE.length : null)
      ))).sort(),
    },
    nonNullCounts: {
      product: productEmbeddingRows.filter((row) => row.EMBEDDING_VALUE != null).length,
      post: postEmbeddingRows.filter((row) => row.EMBEDDING_VALUE != null).length,
    },
    productEmbeddings: productEmbeddingRows,
    postEmbeddings: postEmbeddingRows,
    semanticMatches: await fingerprintQuery(connection, `
      SELECT * FROM semantic_matches
      ORDER BY post_id, product_id
    `),
    metadata: await fingerprintQuery(connection, `
      SELECT index_name, index_type, table_name, status
      FROM user_indexes
      WHERE index_name IN ('IDX_PRODUCT_VEC','IDX_POST_VEC')
      ORDER BY index_name
    `),
    execution: activeGenerationId
      ? await fingerprintQuery(connection, `
          SELECT generation_id, feature_name, sql_id, child_number,
                 plan_hash_value, operation, options, object_name,
                 evidence_status
          FROM app_feature_execution_evidence
          WHERE generation_id = :generationId
            AND feature_name = 'VECTOR'
        `, { generationId: activeGenerationId })
      : [],
  };
  const graphTraversal = {
    metadata: await fingerprintQuery(connection, `
      SELECT graph_name
      FROM user_property_graphs
      WHERE graph_name = 'INFLUENCER_NETWORK'
    `),
    edges: await fingerprintQuery(connection, `
      SELECT * FROM influencer_connections
      ORDER BY from_influencer, to_influencer
    `),
    links: await fingerprintQuery(connection, `
      SELECT * FROM brand_influencer_links
      ORDER BY brand_id, influencer_id
    `),
    traversal: await fingerprintQuery(connection, `
      SELECT source_id, target_id
      FROM GRAPH_TABLE ( influencer_network
        MATCH (source IS influencer) -[edge IS connects_to]-> (target IS influencer)
        COLUMNS (
          source.influencer_id AS source_id,
          target.influencer_id AS target_id
        )
      )
      ORDER BY source_id, target_id
    `),
  };
  const spatialNearest = {
    centers: await fingerprintQuery(connection, `
      SELECT center_id,
             DBMS_LOB.SUBSTR(SDO_UTIL.TO_WKTGEOMETRY(location), 4000, 1) wkt
      FROM fulfillment_centers
      ORDER BY center_id
    `),
    customers: await fingerprintQuery(connection, `
      SELECT customer_id,
             DBMS_LOB.SUBSTR(SDO_UTIL.TO_WKTGEOMETRY(location), 4000, 1) wkt
      FROM customers
      ORDER BY customer_id
    `),
    zones: await fingerprintQuery(connection, `
      SELECT zone_id,
             DBMS_LOB.SUBSTR(SDO_UTIL.TO_WKTGEOMETRY(zone_boundary), 4000, 1) wkt
      FROM fulfillment_zones
      ORDER BY zone_id
    `),
    indexes: await fingerprintQuery(connection, `
      SELECT index_name, index_type, table_name, status
      FROM user_indexes
      WHERE index_name IN ('IDX_FC_SPATIAL','IDX_CUST_SPATIAL','IDX_ZONE_SPATIAL')
      ORDER BY index_name
    `),
    nearest: await fingerprintQuery(connection, `
      WITH origin AS (
        SELECT location
        FROM (
          SELECT customer.location
          FROM customers customer
          WHERE customer.location IS NOT NULL
          ORDER BY customer.customer_id
        )
        WHERE ROWNUM = 1
      ),
      indexed_candidates AS (
        SELECT /*+ LEADING(origin) USE_NL(center)
                   INDEX(center idx_fc_spatial) */
               center.center_id,
               center.location center_location,
               origin.location origin_location
        FROM origin
        JOIN fulfillment_centers center
          ON SDO_NN(
               center.location,
               origin.location,
               'sdo_batch_size=50 unit=KM'
             ) = 'TRUE'
      )
      SELECT center_id,
             ROUND(SDO_GEOM.SDO_DISTANCE(
               origin_location, center_location, 0.005, 'unit=KM'
             ), 6) distance_km
      FROM indexed_candidates
      ORDER BY distance_km, center_id
      FETCH FIRST 5 ROWS ONLY
    `),
    execution: activeGenerationId
      ? await fingerprintQuery(connection, `
          SELECT generation_id, feature_name, sql_id, child_number,
                 plan_hash_value, operation, options, object_name,
                 evidence_status
          FROM app_feature_execution_evidence
          WHERE generation_id = :generationId
            AND feature_name = 'SPATIAL'
        `, { generationId: activeGenerationId })
      : [],
  };

  const registryRows = await fingerprintQuery(connection, `
    SELECT registry.logical_name, registry.physical_name,
           registry.generation_id, registry.training_fingerprint,
           registry.training_row_count, generation.training_table,
           generation.settings_table
    FROM app_oml_model_registry registry
    JOIN app_oml_generation_models generation
      ON generation.generation_id = registry.generation_id
     AND generation.logical_name = registry.logical_name
    ORDER BY registry.logical_name
  `);
  const omlScores = {
    registry: registryRows,
    modelMetadata: await fingerprintQuery(connection, `
      SELECT model_name, mining_function, algorithm
      FROM user_mining_models
      WHERE model_name IN (
        SELECT physical_name FROM app_oml_model_registry
      )
      ORDER BY model_name
    `),
    trainingRows: {},
    scores: {},
  };
  const caseIds = {
    DEMAND_SURGE_MODEL: 'PRODUCT_ID',
    CUSTOMER_SEGMENT_MODEL: 'CUSTOMER_ID',
    REVENUE_PREDICT_MODEL: 'ORDER_ID',
    PRODUCT_CLUSTER_MODEL: 'PRODUCT_ID',
  };
  for (const model of registryRows) {
    const logicalName = safeOracleIdentifier(model.LOGICAL_NAME);
    const physicalName = safeOracleIdentifier(model.PHYSICAL_NAME);
    const trainingTable = safeOracleIdentifier(model.TRAINING_TABLE);
    const caseId = caseIds[logicalName];
    omlScores.trainingRows[logicalName] = await fingerprintQuery(
      connection,
      `SELECT * FROM ${trainingTable} ORDER BY ${caseId}`
    );
    const scoreFunction = logicalName.includes('SEGMENT')
      || logicalName.includes('CLUSTER')
      ? 'CLUSTER_ID'
      : 'PREDICTION';
    omlScores.scores[logicalName] = await fingerprintQuery(connection, `
      SELECT ${caseId} case_id,
             ${scoreFunction}(${physicalName} USING *) score
      FROM ${trainingTable}
      ORDER BY ${caseId}
      FETCH FIRST 25 ROWS ONLY
    `);
  }

  const inMemoryEvidence = {
    segments: await fingerprintQuery(connection, `
      SELECT segment_name, row_count, table_inmemory, inmemory_priority,
             inmemory_compression, populate_status, disk_bytes,
             inmemory_bytes, bytes_not_populated
      FROM media_inmemory_segments_v
      ORDER BY segment_name
    `),
    execution: activeGenerationId
      ? await fingerprintQuery(connection, `
          SELECT generation_id, feature_name, sql_id, child_number,
                 plan_hash_value, operation, options, object_name,
                 evidence_status
          FROM app_feature_execution_evidence
          WHERE generation_id = :generationId
            AND feature_name = 'INMEMORY'
        `, { generationId: activeGenerationId })
      : [],
  };
  const unifiedAuditPolicy = await fingerprintQuery(connection, `
    SELECT policy_name, enabled_option, entity_name, entity_type
    FROM sys.audit_unified_enabled_policies
    WHERE policy_name = 'SC_ORDER_AUDIT'
    ORDER BY entity_name, entity_type
  `);
  const auditGenerationToken = canonicalAuditGenerationToken(activeGenerationId);
  const unifiedAuditOutcomes = activeGenerationId
    ? await fingerprintQuery(connection, `
        SELECT
          MAX(CASE
            WHEN sql_text LIKE '%MEDIA_AUDIT_ALLOWED_${auditGenerationToken}%'
             AND LOWER(client_identifier) = 'admin_jess'
             AND return_code = 0
            THEN 1 ELSE 0 END) allowed_admin_zero_return_code,
          MAX(CASE
            WHEN sql_text LIKE '%MEDIA_AUDIT_DENIED_${auditGenerationToken}%'
             AND LOWER(client_identifier) = 'fm_west_maria'
             AND return_code = 28115
            THEN 1 ELSE 0 END) denied_regional_update_check_28115
        FROM SYSTEM.media_unified_audit_evidence_v
      `)
    : [];

  return {
    activeState: summarizeFingerprintRows(activeState),
    baseRowContent: summarizeFingerprintMap(baseRows),
    applicationContextVpd: {
      policyInventory: summarizeFingerprintRows(applicationContextVpd),
      representativeSelectOutcomes: {
        sha256: hashFingerprintPayload(applicationContextVpdOutcomes),
        ...canonicalFingerprintValue(applicationContextVpdOutcomes),
      },
      adminAllowedAndViewerDeniedDml: summarizeFingerprintRows(unifiedAuditOutcomes),
    },
    dualityDocuments: {
      metadata: summarizeFingerprintRows(dualityMetadata),
      documents: summarizeFingerprintRows(dualityDocuments),
      relationalParity: summarizeFingerprintMap(dualityRelationalParity),
      generationId: activeGenerationId,
    },
    nativeJsonDocuments: {
      metadata: summarizeFingerprintRows(nativeJsonMetadata),
      documents: summarizeFingerprintRows(nativeJsonDocuments),
      invalidDocumentCount: Number(
        nativeJsonInvalidDocuments[0]?.INVALID_DOCUMENT_COUNT || 0
      ),
      invalidDocumentEvidence: summarizeFingerprintRows(
        nativeJsonInvalidDocuments
      ),
    },
    vectorArtifacts: {
      ...summarizeFingerprintMap({
        model: vectorArtifacts.model,
        productEmbeddings: vectorArtifacts.productEmbeddings,
        postEmbeddings: vectorArtifacts.postEmbeddings,
        semanticMatches: vectorArtifacts.semanticMatches,
        metadata: vectorArtifacts.metadata,
        execution: vectorArtifacts.execution,
      }),
      dimensions: vectorArtifacts.dimensions,
      nonNullCounts: vectorArtifacts.nonNullCounts,
    },
    graphTraversal: summarizeFingerprintMap(graphTraversal),
    spatialNearest: summarizeFingerprintMap(spatialNearest),
    omlScores: {
      registry: summarizeFingerprintRows(omlScores.registry),
      modelMetadata: summarizeFingerprintRows(omlScores.modelMetadata),
      trainingRows: summarizeFingerprintMap(omlScores.trainingRows),
      scores: summarizeFingerprintMap(omlScores.scores),
    },
    inMemoryEvidence: summarizeFingerprintMap(inMemoryEvidence),
    unifiedAuditPolicy: {
      policy: summarizeFingerprintRows(unifiedAuditPolicy),
      currentGenerationOutcomes: summarizeFingerprintRows(unifiedAuditOutcomes),
    },
    readiness: summarizeFingerprintRows(activeState),
  };
}

function projectRetainedStartupFingerprint(
  surface,
  activeIdentityRows,
  stableInMemoryRows,
  executionIdentityRows
) {
  const vectorArtifacts = { ...(surface.vectorArtifacts || {}) };
  const spatialNearest = { ...(surface.spatialNearest || {}) };
  delete vectorArtifacts.execution;
  delete spatialNearest.execution;

  return canonicalFingerprintValue({
    activeGenerationId: activeIdentityRows?.[0]?.GENERATION_ID || null,
    activeIdentity: activeIdentityRows,
    baseRowContent: surface.baseRowContent,
    applicationContextVpd: surface.applicationContextVpd,
    dualityDocuments: surface.dualityDocuments,
    nativeJsonDocuments: surface.nativeJsonDocuments,
    vectorArtifacts,
    graphTraversal: surface.graphTraversal,
    spatialNearest,
    omlScores: surface.omlScores,
    inMemoryEvidence: {
      segments: summarizeFingerprintRows(stableInMemoryRows),
      currentGenerationExecution: summarizeFingerprintRows(
        executionIdentityRows
      ),
    },
    unifiedAuditPolicy: surface.unifiedAuditPolicy,
  });
}

async function captureRetainedStartupFingerprint(connection) {
  const activeIdentityRows = await fingerprintQuery(connection, `
    SELECT state.active_source, state.active_version,
           job.candidate_generation_id generation_id
    FROM app_dataset_state state
    CROSS JOIN app_dataset_readiness readiness
    JOIN app_dataset_jobs job ON job.job_id = readiness.job_id
    WHERE state.state_id = 1
      AND readiness.readiness_id = 1
      AND readiness.status = 'ACTIVE'
  `);
  if (activeIdentityRows.length !== 1
      || !activeIdentityRows[0]?.GENERATION_ID) {
    throw new Error(
      'Retained-start fingerprint requires one active Oracle generation.'
    );
  }
  const generationId = activeIdentityRows[0].GENERATION_ID;
  const stableInMemoryRows = await fingerprintQuery(connection, `
    SELECT segment_name, row_count, table_inmemory, inmemory_priority,
           inmemory_compression,
           CASE
             WHEN table_inmemory = 'ENABLED'
              AND populate_status = 'COMPLETED'
              AND inmemory_bytes > 0
              AND bytes_not_populated = 0
             THEN 'ACTIVE' ELSE 'NOT_READY'
           END evidence_status
    FROM media_inmemory_segments_v
    ORDER BY segment_name
  `);
  const executionIdentityRows = await fingerprintQuery(connection, `
    SELECT generation_id, feature_name, plan_hash_value,
           operation, options, object_name, evidence_status
    FROM app_feature_execution_evidence
    WHERE generation_id = :generationId
      AND feature_name IN ('VECTOR','SPATIAL','INMEMORY')
    ORDER BY feature_name
  `, { generationId });
  const surface = await captureActiveSurfaceFingerprints(connection);
  const payload = projectRetainedStartupFingerprint(
    surface,
    activeIdentityRows,
    stableInMemoryRows,
    executionIdentityRows
  );
  return {
    sha256: hashFingerprintPayload(payload),
    payload,
  };
}

async function restoreActiveExecutionProofAfterRollback(connection) {
  const result = await execSql(connection, `
    SELECT job.candidate_generation_id generation_id
    FROM app_dataset_readiness readiness
    JOIN app_dataset_jobs job ON job.job_id = readiness.job_id
    WHERE readiness.readiness_id = 1
      AND readiness.status = 'ACTIVE'
  `);
  const generationId = result.rows?.[0]?.GENERATION_ID;
  if (!generationId) return { restored: false, reason: 'no_active_generation' };
  const vectorProof = await executeVectorGenerationProof(connection, generationId);
  const spatialProof = await executeSpatialGenerationProof(connection, generationId);
  const inMemoryEvidence = await stabilizeCommittedInMemory(connection, generationId);
  if (!inMemoryEvidence) {
    throw new Error('Prior active In-Memory execution could not be restored after rollback');
  }
  return {
    restored: true,
    generationId,
    vectorEvidence: vectorProof.evidence,
    vectorIntegrity: vectorProof.integrity.evidence,
    spatialEvidence: spatialProof.evidence,
    inMemoryEvidence,
  };
}

async function quarantineCandidateGeneration(
  connection,
  generationId,
  reason,
  failureFingerprint = null
) {
  await execSql(connection, `
    UPDATE app_oml_generation_models
    SET status = 'abandoned',
        quarantine_reason = :reason,
        quarantined_at = SYSTIMESTAMP
    WHERE generation_id = :generationId
      AND status <> 'active'
  `, {
    generationId,
    reason: String(reason || 'candidate generation failed').slice(0, 1000),
  });
  await execSql(connection, `
    UPDATE app_oml_generations
    SET status = 'abandoned',
        quarantine_reason = :reason,
        updated_at = SYSTIMESTAMP
    WHERE generation_id = :generationId
      AND status <> 'active'
  `, {
    generationId,
    reason: String(reason || 'candidate generation failed').slice(0, 1000),
  });
  await execSql(connection, `
    UPDATE app_oml_generation_assets
    SET status = 'abandoned'
    WHERE generation_id = :generationId
      AND status <> 'active'
  `, { generationId });
  await execSql(connection, `
    UPDATE app_dataset_attempts
    SET failure_injection_phase = :failurePhase,
        failure_fingerprint = :failureFingerprint,
        updated_at = SYSTIMESTAMP
    WHERE candidate_generation_id = :generationId
  `, {
    generationId,
    failurePhase: String(
      failureFingerprint?.failurePhase || 'unexpected'
    ).slice(0, 80),
    failureFingerprint: {
      val: failureFingerprint || {},
      type: db.oracledb.DB_TYPE_JSON,
    },
  });
}

function cleanupErrorCategory(error) {
  const message = String(error?.message || error || 'unknown cleanup failure');
  const oracleCode = message.match(/ORA-\d+/i)?.[0]?.toUpperCase();
  if (oracleCode) return oracleCode;
  return String(error?.code || error?.name || 'OML_ASSET_CLEANUP_FAILED')
    .toUpperCase()
    .slice(0, 80);
}

async function verifyGenerationAssetAbsent(connection, assetType, assetName) {
  const normalizedType = String(assetType || '').toUpperCase();
  const normalizedName = safeOracleIdentifier(assetName);
  let result;
  if (normalizedType === 'MODEL') {
    result = await execSql(connection, `
      SELECT COUNT(*) object_count
      FROM user_mining_models
      WHERE model_name = :assetName
    `, { assetName: normalizedName });
  } else if (['TRAINING_TABLE', 'SETTINGS_TABLE'].includes(normalizedType)) {
    result = await execSql(connection, `
      SELECT COUNT(*) object_count
      FROM user_objects
      WHERE object_name = :assetName
        AND object_type = 'TABLE'
    `, { assetName: normalizedName });
  } else {
    throw new Error(`Unsupported OML cleanup asset type ${normalizedType}`);
  }
  return Number(result.rows?.[0]?.OBJECT_COUNT || 0) === 0;
}

async function recordGenerationAssetCleanupFailure(connection, row, error) {
  const assetName = safeOracleIdentifier(row.ASSET_NAME);
  const category = cleanupErrorCategory(error);
  const message = String(error?.message || error || 'Asset still exists after cleanup attempt')
    .slice(0, 1000);
  await execSql(connection, `
    UPDATE app_oml_generation_assets
    SET status = 'abandoned',
        cleanup_attempts = cleanup_attempts + 1,
        cleanup_error_category = :category,
        cleanup_error = :message,
        cleanup_last_attempt_at = SYSTIMESTAMP,
        cleaned_at = NULL
    WHERE generation_id = :generationId
      AND asset_type = :assetType
      AND asset_name = :assetName
      AND status IN ('planned','created','abandoned')
  `, {
    generationId: row.GENERATION_ID,
    assetType: row.ASSET_TYPE,
    assetName,
    category,
    message,
  });
  return { cleaned: false, retryable: true, category, message };
}

async function cleanupQuarantinedCandidateAssets() {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    await execSql(connection, `
      UPDATE app_oml_generations generation
      SET status = 'abandoned',
          quarantine_reason = NVL(
            quarantine_reason,
            'Interrupted candidate generation recovered after application restart'
          ),
          updated_at = SYSTIMESTAMP
      WHERE status IN ('planned','staging','validated')
        AND NOT EXISTS (
          SELECT 1
          FROM app_oml_model_registry registry
          WHERE registry.generation_id = generation.generation_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM app_dataset_jobs job
          WHERE job.candidate_generation_id = generation.generation_id
            AND job.status IN ('queued','running')
        )
    `);
    await execSql(connection, `
      UPDATE app_oml_generation_assets asset
      SET status = 'abandoned'
      WHERE status IN ('planned','created')
        AND EXISTS (
          SELECT 1
          FROM app_oml_generations generation
          WHERE generation.generation_id = asset.generation_id
            AND generation.status = 'abandoned'
        )
    `);
    await execSql(connection, `
      UPDATE app_oml_generation_models generation_model
      SET status = 'abandoned',
          quarantine_reason = NVL(
            quarantine_reason,
            'Interrupted candidate generation recovered after application restart'
          ),
          quarantined_at = NVL(quarantined_at, SYSTIMESTAMP)
      WHERE status IN ('staged','validated')
        AND EXISTS (
          SELECT 1
          FROM app_oml_generations generation
          WHERE generation.generation_id = generation_model.generation_id
            AND generation.status = 'abandoned'
        )
    `);
    const rows = await execSql(connection, `
      SELECT asset.generation_id, asset.asset_type, asset.asset_name
      FROM app_oml_generation_assets asset
      JOIN app_oml_generations generation
        ON generation.generation_id = asset.generation_id
      WHERE generation.status = 'abandoned'
        AND asset.status IN ('planned','created','abandoned')
        AND NOT EXISTS (
          SELECT 1 FROM app_oml_model_registry registry
          WHERE registry.generation_id = asset.generation_id
            OR registry.physical_name = asset.asset_name
        )
      ORDER BY asset.generation_id,
               CASE asset.asset_type WHEN 'MODEL' THEN 1 ELSE 2 END,
               asset.asset_name
    `);
    const outcomes = [];
    for (const row of rows.rows || []) {
      const assetName = safeOracleIdentifier(row.ASSET_NAME);
      let dropError = null;
      if (row.ASSET_TYPE === 'MODEL') {
        try {
          await execSql(connection, `
            BEGIN DBMS_DATA_MINING.DROP_MODEL('${assetName}', TRUE); END;
          `);
        } catch (error) {
          dropError = error;
        }
      } else {
        try {
          await execSql(connection, `DROP TABLE ${assetName} PURGE`);
        } catch (error) {
          dropError = error;
        }
      }
      let absent = false;
      try {
        absent = await verifyGenerationAssetAbsent(
          connection,
          row.ASSET_TYPE,
          assetName
        );
      } catch (verificationError) {
        dropError = verificationError;
      }
      if (absent) {
        await execSql(connection, `
          UPDATE app_oml_generation_assets
          SET status = 'cleaned',
              cleaned_at = SYSTIMESTAMP,
              cleanup_attempts = cleanup_attempts + 1,
              cleanup_error_category = NULL,
              cleanup_error = NULL,
              cleanup_last_attempt_at = SYSTIMESTAMP
          WHERE generation_id = :generationId
            AND asset_type = :assetType
            AND asset_name = :assetName
            AND status IN ('planned','created','abandoned')
        `, {
          generationId: row.GENERATION_ID,
          assetType: row.ASSET_TYPE,
          assetName,
        });
        outcomes.push({
          generationId: row.GENERATION_ID,
          assetType: row.ASSET_TYPE,
          assetName,
          cleaned: true,
          verifiedAbsent: true,
          dropReportedError: Boolean(dropError),
        });
      } else {
        outcomes.push({
          generationId: row.GENERATION_ID,
          assetType: row.ASSET_TYPE,
          assetName,
          ...(await recordGenerationAssetCleanupFailure(
            connection,
            row,
            dropError || new Error('Asset still exists after cleanup attempt')
          )),
        });
      }
    }
    await execSql(connection, `
      UPDATE app_oml_generation_models generation_model
      SET assets_cleaned_at = SYSTIMESTAMP
      WHERE status = 'abandoned'
        AND assets_cleaned_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM app_oml_generation_assets asset
          WHERE asset.generation_id = generation_model.generation_id
            AND asset.status <> 'cleaned'
        )
    `);
    await execSql(connection, `
      UPDATE app_oml_generations generation
      SET status = 'cleaned', cleaned_at = SYSTIMESTAMP,
          updated_at = SYSTIMESTAMP
      WHERE status = 'abandoned'
        AND NOT EXISTS (
          SELECT 1
          FROM app_oml_generation_assets asset
          WHERE asset.generation_id = generation.generation_id
            AND asset.status <> 'cleaned'
        )
    `);
    await execSql(connection, `
      DELETE FROM app_oml_candidate_rows candidate
      WHERE EXISTS (
        SELECT 1
        FROM app_oml_generations generation
        WHERE generation.generation_id = candidate.generation_id
          AND generation.status = 'cleaned'
      )
        AND NOT EXISTS (
          SELECT 1
          FROM app_oml_model_registry registry
          WHERE registry.generation_id = candidate.generation_id
        )
    `);
    await connection.commit();
    return {
      attempted: outcomes.length,
      cleaned: outcomes.filter((outcome) => outcome.cleaned).length,
      retryable: outcomes.filter((outcome) => outcome.retryable).length,
      outcomes,
    };
  } finally {
    if (connection) {
      await db.releaseConnection(connection, {
        rollback: true,
        label: 'Media candidate OML quarantine cleanup',
      });
    }
  }
}

function assertStabilizingRecoveryIdentity({
  requestedJobId,
  readinessJobId,
  candidateGenerationId,
  payloadCandidateGenerationId,
  readinessGenerationId,
} = {}) {
  const jobIds = [
    requestedJobId,
    readinessJobId,
  ].map((value) => String(value || '').trim());
  const generationIds = [
    candidateGenerationId,
    payloadCandidateGenerationId,
    readinessGenerationId,
  ].map((value) => String(value || '').trim());
  if (jobIds.some((value) => !value)) {
    throw new ImportError(
      'STABILIZING recovery job identity is unavailable.',
      503
    );
  }
  if (generationIds.some((value) => !value)) {
    throw new ImportError(
      'STABILIZING recovery generation identity is unavailable.',
      503
    );
  }
  if (new Set(jobIds).size !== 1) {
    throw new ImportError(
      'STABILIZING recovery job identity does not match readiness.',
      503
    );
  }
  if (new Set(generationIds).size !== 1) {
    throw new ImportError(
      'STABILIZING recovery generation identity does not match the durable candidate.',
      503
    );
  }
  return Object.freeze({
    jobId: jobIds[0],
    generationId: generationIds[0],
  });
}

function readinessGenerationIdentity(readiness = {}) {
  const candidates = [
    readiness?.vectorEvidence?.generationId,
    readiness?.vectorIntegrity?.generationId,
    readiness?.spatialEvidence?.generationId,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  if (candidates.length === 0 || new Set(candidates).size !== 1) {
    throw new ImportError(
      'Durable readiness lacks one exact current-generation identity.',
      503
    );
  }
  return candidates[0];
}

async function loadCommittedOmlCandidate(connection, generationId) {
  const result = await execSql(connection, `
    SELECT generation.generation_id,
           generation.source_fingerprint,
           model.logical_name,
           model.physical_name,
           model.training_table,
           model.settings_table,
           model.training_fingerprint,
           model.training_row_count,
           model.status
    FROM app_oml_generations generation
    JOIN app_oml_generation_models model
      ON model.generation_id = generation.generation_id
    WHERE generation.generation_id = :generationId
      AND generation.status = 'active'
      AND model.status = 'active'
    ORDER BY model.logical_name
  `, { generationId });
  const rows = result.rows || [];
  const logicalNames = rows.map(
    (row) => safeOracleIdentifier(row.LOGICAL_NAME)
  );
  if (rows.length !== OML_LOGICAL_NAMES.length
      || new Set(logicalNames).size !== OML_LOGICAL_NAMES.length
      || OML_LOGICAL_NAMES.some((logicalName) => (
        !logicalNames.includes(logicalName)
      ))) {
    throw new ImportError(
      'Committed Media generation lacks the exact four active OML models.',
      503
    );
  }
  const fingerprint = String(
    rows[0]?.SOURCE_FINGERPRINT || ''
  ).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(fingerprint)
      || rows.some((row) => (
        String(row.GENERATION_ID || '') !== generationId
        || String(row.SOURCE_FINGERPRINT || '').toLowerCase() !== fingerprint
        || !/^[0-9a-f]{64}$/i.test(
          String(row.TRAINING_FINGERPRINT || '')
        )
        || Number(row.TRAINING_ROW_COUNT || 0) < 1
      ))) {
    throw new ImportError(
      'Committed Media OML generation provenance is incomplete or stale.',
      503
    );
  }
  return {
    generationId,
    fingerprint,
    models: rows.map((row) => ({
      logicalName: safeOracleIdentifier(row.LOGICAL_NAME),
      physicalName: safeOracleIdentifier(row.PHYSICAL_NAME),
      trainingTable: safeOracleIdentifier(row.TRAINING_TABLE),
      settingsTable: safeOracleIdentifier(row.SETTINGS_TABLE),
      trainingFingerprint: String(row.TRAINING_FINGERPRINT).toLowerCase(),
      trainingRowCount: Number(row.TRAINING_ROW_COUNT),
    })),
  };
}

async function reproveCommittedRequiredFeatures(connection, generationId) {
  const omlCandidate = await loadCommittedOmlCandidate(
    connection,
    generationId
  );
  const spatialProof = await executeSpatialGenerationProof(
    connection,
    generationId
  );
  const readiness = await assertRequiredFeatureReadiness(
    connection,
    omlCandidate,
    { spatialProof }
  );
  if (readiness.vectorEvidence?.generationId !== generationId
      || readiness.spatialEvidence?.generationId !== generationId) {
    throw new ImportError(
      'All-feature recovery evidence is not bound to the committed generation.',
      503
    );
  }
  return readiness;
}

async function recoverStabilizingDataset(jobId) {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    const state = await execSql(connection, `
      SELECT readiness.status,
             readiness.job_id readiness_job_id,
             JSON_SERIALIZE(
               readiness.readiness RETURNING CLOB
             ) readiness,
             JSON_SERIALIZE(
               job.payload RETURNING CLOB
             ) payload,
             job.candidate_generation_id
      FROM app_dataset_readiness readiness
      JOIN app_dataset_jobs job ON job.job_id = readiness.job_id
      WHERE readiness.readiness_id = 1 AND readiness.job_id = :jobId
      FOR UPDATE
    `, { jobId });
    const row = state.rows?.[0];
    if (!row || String(row.STATUS || '').toUpperCase() !== 'STABILIZING') {
      return { recovered: false, reason: 'not_stabilizing' };
    }
    const readiness = typeof row.READINESS === 'string'
      ? JSON.parse(row.READINESS)
      : row.READINESS;
    const payload = typeof row.PAYLOAD === 'string'
      ? JSON.parse(row.PAYLOAD)
      : row.PAYLOAD;
    const recoveryIdentity = assertStabilizingRecoveryIdentity({
      requestedJobId: jobId,
      readinessJobId: row.READINESS_JOB_ID,
      candidateGenerationId: row.CANDIDATE_GENERATION_ID,
      payloadCandidateGenerationId: payload?.candidateGenerationId,
      readinessGenerationId: readinessGenerationIdentity(readiness),
    });
    const generationId = recoveryIdentity.generationId;
    const requiredFeatureReadiness =
      await reproveCommittedRequiredFeatures(connection, generationId);
    const evidence = await stabilizeCommittedInMemory(
      connection,
      generationId
    );
    if (!evidence) return { recovered: false, reason: 'inmemory_pending' };
    const finalized = await finalizeDatasetActivation({
      jobId,
      readiness: {
        ...requiredFeatureReadiness,
        spatial: true,
        inMemoryConfigured: true,
        inMemoryExecution: true,
        inMemoryEvidence: evidence,
      },
      jobPatch: {
        message: payload?.message || 'Dataset operation completed after restart recovery.',
        warnings: payload?.warnings || [],
        summary: {
          ...(payload?.summary || {}),
          postCommitInMemoryStable: true,
          recoveredAfterRestart: true,
        },
      },
    });
    return { recovered: true, finalized };
  } catch (error) {
    console.warn(`Dataset ${jobId} remains STABILIZING:`, error.message || error);
    return { recovered: false, reason: 'inmemory_pending' };
  } finally {
    if (connection) {
      await db.releaseConnection(connection, {
        rollback: true,
        label: 'Media stabilizing dataset recovery',
      });
    }
  }
}

async function reproveActiveGenerationOnStartup() {
  let connection;
  let jobId = null;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    const result = await execSql(connection, `
      SELECT readiness.job_id readiness_job_id,
             JSON_SERIALIZE(
               readiness.readiness RETURNING CLOB
             ) readiness,
             JSON_SERIALIZE(
               job.payload RETURNING CLOB
             ) payload,
             job.candidate_generation_id
      FROM app_dataset_readiness readiness
      JOIN app_dataset_jobs job ON job.job_id = readiness.job_id
      WHERE readiness.readiness_id = 1
        AND readiness.status = 'ACTIVE'
      FOR UPDATE
    `);
    const row = result.rows?.[0];
    if (!row?.CANDIDATE_GENERATION_ID) {
      return { reproved: false, reason: 'no_active_generation' };
    }
    jobId = row.READINESS_JOB_ID;
    const readiness = typeof row.READINESS === 'string'
      ? JSON.parse(row.READINESS)
      : row.READINESS;
    const payload = typeof row.PAYLOAD === 'string'
      ? JSON.parse(row.PAYLOAD)
      : row.PAYLOAD;
    const recoveryIdentity = assertStabilizingRecoveryIdentity({
      requestedJobId: jobId,
      readinessJobId: row.READINESS_JOB_ID,
      candidateGenerationId: row.CANDIDATE_GENERATION_ID,
      payloadCandidateGenerationId: payload?.candidateGenerationId,
      readinessGenerationId: readinessGenerationIdentity(readiness),
    });
    const generationId = recoveryIdentity.generationId;

    await execSql(connection, `
      UPDATE app_dataset_readiness
      SET status = 'STABILIZING',
          failure_message = NULL,
          updated_at = SYSTIMESTAMP
      WHERE readiness_id = 1
        AND job_id = :jobId
        AND status = 'ACTIVE'
    `, { jobId });
    await execSql(connection, `
      UPDATE app_dataset_jobs
      SET status = 'running', phase = 'stabilizing', progress = 99,
          message = 'Re-proving exact Oracle feature execution after restart.',
          payload = JSON_MERGEPATCH(
            payload,
            JSON_OBJECT(
              'status' VALUE 'running',
              'phase' VALUE 'stabilizing',
              'progress' VALUE 99,
              'message' VALUE 'Re-proving exact Oracle feature execution after restart.'
              RETURNING JSON
            )
          ),
          updated_at = SYSTIMESTAMP,
          heartbeat_at = SYSTIMESTAMP,
          completed_at = NULL
      WHERE job_id = :jobId
    `, { jobId });
    await execSql(connection, `
      UPDATE app_dataset_attempts
      SET phase = 'stabilizing', status = 'running',
          updated_at = SYSTIMESTAMP, completed_at = NULL
      WHERE job_id = :jobId
    `, { jobId });
    await connection.commit();

    const requiredFeatureReadiness =
      await reproveCommittedRequiredFeatures(connection, generationId);
    const inMemoryEvidence = await stabilizeCommittedInMemory(connection, generationId);
    if (!inMemoryEvidence) {
      return { reproved: false, reason: 'inmemory_pending', jobId, generationId };
    }
    const finalized = await finalizeDatasetActivation({
      jobId,
      readiness: {
        ...requiredFeatureReadiness,
        spatial: true,
        inMemoryConfigured: true,
        inMemoryExecution: true,
        inMemoryEvidence,
      },
      jobPatch: {
        message: payload?.message || 'Dataset operation completed.',
        warnings: payload?.warnings || [],
        summary: {
          ...(payload?.summary || {}),
          retainedRestartReproof: true,
          postCommitInMemoryStable: true,
        },
      },
      emitLifecycleEvent: false,
    });
    return { reproved: true, jobId, generationId, finalized };
  } catch (error) {
    try { await connection?.rollback(); } catch (_) {}
    console.warn(
      `Active Media generation${jobId ? ` ${jobId}` : ''} remains fail-closed after restart:`,
      error.message || error
    );
    return { reproved: false, reason: 'exact_feature_reproof_failed', jobId };
  } finally {
    if (connection) {
      await db.releaseConnection(connection, {
        rollback: true,
        label: 'Media retained ACTIVE generation re-proof',
      });
    }
  }
}

async function recoverAllStabilizingDatasets() {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    const result = await execSql(connection, `
      SELECT job_id FROM app_dataset_readiness
      WHERE readiness_id = 1 AND status = 'STABILIZING'
    `);
    const outcomes = [];
    for (const row of result.rows || []) {
      outcomes.push(await recoverStabilizingDataset(row.JOB_ID));
    }
    return outcomes;
  } finally {
    if (connection) {
      await db.releaseConnection(connection, {
        rollback: true,
        label: 'Media stabilizing dataset scan',
      });
    }
  }
}

async function executeImportPlan({
  dataset,
  dryRun = false,
  progress = null,
  demoDateRefresh = null,
  activation = null,
  ownership = null,
}) {
  let connection;
  let abortListener = null;
  let omlCandidate = null;
  let baselineFingerprints = null;
  let candidateNativeJsonProbe = null;
  let activationCommitted = false;
  let restoreExecutionDefaults = null;
  const warnings = [];

  try {
    connection = await db.getConnection();
    restoreExecutionDefaults = enforceManualCommitExecution(connection);
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    throwIfOwnershipLost(ownership);
    if (ownership?.signal) {
      abortListener = () => {
        if (typeof connection?.break === 'function') {
          Promise.resolve(connection.break()).catch(() => {});
        }
      };
      ownership.signal.addEventListener('abort', abortListener, { once: true });
    }
    const importDataset = dataset;
    let demoDateRefreshMetadata = null;

    if (!dryRun && activation?.jobId) {
      baselineFingerprints = await captureActiveSurfaceFingerprints(connection);
      await execSql(connection, `
        UPDATE app_dataset_attempts
        SET failure_fingerprint = :failureFingerprint,
            updated_at = SYSTIMESTAMP
        WHERE job_id = :jobId
      `, {
        jobId: activation.jobId,
        failureFingerprint: {
          val: { baseline: baselineFingerprints },
          type: db.oracledb.DB_TYPE_JSON,
        },
      });
      await assertOwnershipBeforeCommit(connection, ownership);
      await connection.commit();
      if (progress) progress({
        status: 'running', phase: 'training_candidate_models', progress: 8,
        message: 'Staging candidate-only OML training rows and generation models...',
      });
      const candidateGenerationId = activation.candidateGenerationId
        || `candidate-${activation.jobId}`;
      // Preserve the generation identity even if training fails partway through,
      // so any durable candidate provenance can be marked abandoned.
      omlCandidate = { generationId: candidateGenerationId, models: [] };
      omlCandidate = await stageCandidateOmlGeneration(
        connection,
        importDataset,
        candidateGenerationId,
        ownership
      );
    }

    if (progress) progress({
      status: 'running', phase: 'loading_candidate', progress: 10,
      message: 'Clearing existing importable data inside the candidate transaction...',
    });
    await deleteExistingImportData(connection);

    if (progress) progress({ status: 'running', progress: 20, message: 'Loading required and provided optional tables...' });
    const { idMaps, insertedCounts } = await insertProvidedTables(connection, importDataset, progress);

    if (progress) progress({
      status: 'running', phase: 'building_derived_assets', progress: 55,
      message: 'Rebuilding spatial point geometry...',
    });
    await rebuildSpatialLocations(connection);

    const fallbackCounts = await applyOptionalFallbacks(connection, importDataset, idMaps, warnings, progress);

    if (demoDateRefresh?.enabled) {
      if (progress) progress({ status: 'running', progress: 78, message: 'Refreshing bundled demo dates to the restore window...' });
      const { targetAnchor, anchorSource } = await resolveDemoRestoreAnchor(connection, demoDateRefresh);
      demoDateRefreshMetadata = await refreshDemoDatesInDatabase(connection, { targetAnchor, anchorSource });
    }

    if (progress) progress({ status: 'running', progress: 80, message: 'Rebuilding fulfillment zones...' });
    const zonesCreated = await rebuildFulfillmentZones(connection);

    const vectorAvailable = await isVectorModelAvailable(connection);
    if (!vectorAvailable) {
      throw new ImportError(`Required Oracle embedding model ${VECTOR_MODEL_NAME} is unavailable.`, 503);
    }

    const summary = summarizeCounts(insertedCounts, fallbackCounts, zonesCreated);
    if (demoDateRefreshMetadata) {
      summary.demoDateRefresh = formatDemoDateRefresh(demoDateRefreshMetadata);
    }

    if (demoDateRefreshMetadata) {
      if (progress) progress({ status: 'running', progress: 84, message: 'Validating refreshed demo date windows...' });
      const demoDateValidation = await runDemoDateValidation(connection);
      summary.demoDateValidation = summarizeDemoDateValidation(demoDateValidation);
      if (!demoDateValidation.passed) {
        throw new ImportError('Demo date validation failed after date refresh.', 500, summary.demoDateValidation);
      }
    }

    if (dryRun) {
      throwIfOwnershipLost(ownership);
      await connection.rollback();
      return {
        warnings,
        summary,
      };
    }

    if (progress) progress({
      status: 'running', phase: 'building_derived_assets', progress: 88,
      message: 'Rebuilding required Oracle assets...',
    });
    // Candidate OML preparation invokes Oracle subsystems that may reset
    // session metadata. Re-assert the trusted Admin context before the
    // VPD-protected MERGE ... SELECT hydration statements.
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    const hydrationIdentity = await execSql(connection, `
      SELECT SYS_CONTEXT('MEDIA_APP_CTX', 'AUTHENTICATED') authenticated,
             LOWER(SYS_CONTEXT('MEDIA_APP_CTX', 'ROLE')) role,
             LOWER(SYS_CONTEXT('MEDIA_APP_CTX', 'ACCESS_SCOPE')) access_scope
      FROM dual
    `);
    const hydrationContext = hydrationIdentity.rows?.[0] || {};
    if (String(hydrationContext.AUTHENTICATED || '') !== 'Y'
        || String(hydrationContext.ROLE || '') !== 'admin'
        || String(hydrationContext.ACCESS_SCOPE || '') !== 'global') {
      throw new ImportError(
        'Required Admin security context is unavailable for derived hydration.',
        503
      );
    }
    await persistDemoDateAnchor(connection, demoDateRefreshMetadata);

    // Hydrate transaction-owned JSON surfaces before Vector/OML DDL. Oracle
    // DDL commits the current transaction implicitly; running these merges
    // afterwards allowed a later validation rollback to leave the committed
    // base rows without their native JSON companions.
    await execSql(connection, `
      MERGE INTO product_attributes target
      USING (
        SELECT p.product_id,
               JSON_OBJECT(
                 'sku' VALUE p.sku, 'title' VALUE p.product_name,
                 'contentType' VALUE p.category, 'unitPrice' VALUE p.unit_price,
                 'active' VALUE p.is_active, 'tags' VALUE p.tags RETURNING JSON
               ) attributes
        FROM products p
      ) incoming
      ON (target.product_id = incoming.product_id)
      WHEN MATCHED THEN UPDATE SET target.attributes = incoming.attributes
      WHEN NOT MATCHED THEN INSERT(product_id, attributes)
      VALUES(incoming.product_id, incoming.attributes)
    `);
    await execSql(connection, `
      MERGE INTO social_post_payloads target
      USING (
        SELECT post.post_id,
               NVL(post.platform, 'instagram') platform,
               JSON_OBJECT(
                 'postId' VALUE post.post_id,
                 'externalPostId' VALUE post.external_post_id,
                 'platform' VALUE post.platform,
                 'text' VALUE post.post_text,
                 'postedAt' VALUE post.posted_at
                 RETURNING JSON
               ) raw_payload,
               JSON_OBJECT(
                 'sentimentScore' VALUE post.sentiment_score,
                 'viralityScore' VALUE post.virality_score,
                 'momentum' VALUE post.momentum_flag,
                 'detectedProducts' VALUE post.detected_products
                 RETURNING JSON
               ) enrichments
        FROM social_posts post
      ) incoming
      ON (target.post_id = incoming.post_id)
      WHEN MATCHED THEN UPDATE SET
        target.platform = incoming.platform,
        target.raw_payload = incoming.raw_payload,
        target.enrichments = incoming.enrichments
      WHEN NOT MATCHED THEN INSERT(post_id, platform, raw_payload, enrichments)
      VALUES(incoming.post_id, incoming.platform, incoming.raw_payload, incoming.enrichments)
    `);
    await execSql(connection, `
      INSERT INTO event_stream(event_type, event_source, event_data, correlation_id)
      SELECT 'dataset_content_ready', 'dataset_restore',
             JSON_OBJECT('productCount' VALUE COUNT(*), 'datasetVersion' VALUE '${IMPORT_VERSION}' RETURNING JSON),
             'dataset-ready-' || TO_CHAR(SYSTIMESTAMP, 'YYYYMMDDHH24MISSFF3')
      FROM products
    `);
    candidateNativeJsonProbe = await execSql(connection, `
      SELECT
        (SELECT /*+ FULL(attribute_row) NO_INDEX(attribute_row) */ COUNT(*)
         FROM product_attributes attribute_row
         WHERE JSON_VALUE(attribute_row.attributes, '$.sku') IS NOT NULL
           AND JSON_EXISTS(attribute_row.attributes, '$.contentType')) native_json_rows,
        (SELECT /*+ FULL(payload_row) NO_INDEX(payload_row) */ COUNT(*)
         FROM social_post_payloads payload_row
         WHERE JSON_VALUE(payload_row.raw_payload, '$.postId') IS NOT NULL
           AND JSON_EXISTS(payload_row.enrichments, '$.momentum')) social_payload_rows,
        (SELECT COUNT(*) FROM social_posts) social_post_rows,
        (SELECT COUNT(*) FROM event_stream
         WHERE JSON_EXISTS(event_data, '$.datasetVersion')) event_json_rows
      FROM dual
    `);
    if (Number(candidateNativeJsonProbe.rows?.[0]?.NATIVE_JSON_ROWS || 0) < 1) {
      throw new ImportError(
        'Required Media native JSON hydration produced no operator-visible rows.',
        503
      );
    }
    injectSemanticFailure('after_derived_hydration');

    if (progress) progress({
      status: 'running', phase: 'building_derived_assets', progress: 92,
      message: 'Rebuilding vector artifacts...',
    });
    summary.generated = {
      ...summary.generated,
      ...(await regenerateVectorArtifacts(connection)),
    };

    if (progress) progress({
      status: 'running',
      phase: 'validating_oml',
      progress: 96,
      message: 'Validating required OML models against the candidate rows...',
    });
    summary.generated = {
      ...summary.generated,
      oml_model_validation: await validatePersistedOmlModels(connection, {
        ...omlCandidate,
        validateActiveRows: true,
      }),
    };
    summary.requiredFeatureReadiness = await assertRequiredFeatureReadiness(
      connection,
      omlCandidate,
      { nativeJsonProbe: candidateNativeJsonProbe }
    );
    injectSemanticFailure('after_readiness');
    // In-Memory population is post-commit and recoverable. Its deterministic
    // test failure is injected here, before activation, so ADR-009 can prove
    // the prior active data and every derived surface remain unchanged.
    injectSemanticFailure('inmemory_readiness');
    let activationResult = null;
    if (activation) {
      if (isDatasetFailurePhaseSelected('after_failed_event_commit')) {
        throw new ImportError(
          'Injected Media Restore terminal failure before activation.',
          503,
          {
            failurePhase: 'after_failed_event_commit',
            injected: true,
            crashAfterFailedEventCommit: true,
          }
        );
      }
      injectSemanticFailure('before_activation');
      activationResult = await activateDatasetInTransaction(connection, {
        ...activation,
        omlCandidate,
        ownership,
        readiness: summary.requiredFeatureReadiness,
        jobPatch: {
          status: 'completed',
          phase: 'activated',
          progress: 100,
          message: activation.completeMessage,
          warnings,
          summary,
        },
      });
    }
    if (progress) progress({
      status: 'running', phase: 'committing_candidate', progress: 99,
      message: 'Committing the fully validated candidate transaction...',
    });
    await assertOwnershipBeforeCommit(connection, ownership);
    await connection.commit();
    activationCommitted = Boolean(activation);
    injectSemanticFailure('after_activation_commit');
    try {
      const inMemoryEvidence = await stabilizeCommittedInMemory(
        connection,
        omlCandidate?.generationId || activation?.candidateGenerationId || 'bootstrap',
        ownership
      );
      if (!inMemoryEvidence) {
        throw new Error('Current-generation In-Memory population is not ready');
      }
      summary.postCommitInMemoryStable = Boolean(inMemoryEvidence);
      summary.requiredFeatureReadiness = {
        ...summary.requiredFeatureReadiness,
        inMemoryExecution: true,
        inMemoryEvidence,
      };
      if (activation) {
        activationResult = await finalizeDatasetActivation({
          jobId: activation.jobId,
          ownership,
          readiness: summary.requiredFeatureReadiness,
          jobPatch: {
            message: activation.completeMessage,
            warnings,
            summary,
          },
        });
        injectSemanticFailure('after_completion_event_commit');
      }
    } catch (error) {
      if (error instanceof DatasetOperationOwnershipLostError
          || ownership?.signal?.aborted) {
        throw ownership?.signal?.reason || error;
      }
      summary.postCommitInMemoryStable = false;
      console.warn(
        'Committed Media generation remains STABILIZING; In-Memory verification will retry:',
        error.message || error
      );
    }

    if (typeof ollamaAssistant?.invalidateMetadataCaches === 'function') {
      try {
        if (progress) progress({ status: 'running', progress: 98, message: 'Refreshing application metadata caches...' });
        ollamaAssistant.invalidateMetadataCaches();
      } catch (_) {
        // Ignore cache invalidation failures; data import already succeeded.
      }
    }

    return {
      warnings,
      summary,
      activation: activationResult,
    };
  } catch (err) {
    const ownershipFailure = err instanceof DatasetOperationOwnershipLostError
      ? err
      : ownership?.signal?.aborted
        ? ownership.signal.reason
        : null;
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      if (!ownershipFailure && omlCandidate?.generationId && !activationCommitted) {
        try {
          await restoreActiveExecutionProofAfterRollback(connection);
          const afterFailure = await captureActiveSurfaceFingerprints(connection);
          await quarantineCandidateGeneration(
            connection,
            omlCandidate.generationId,
            err.message,
            {
              failurePhase: err.details?.failurePhase || 'unexpected',
              baseline: baselineFingerprints,
              afterFailure,
              preserved: JSON.stringify(baselineFingerprints) === JSON.stringify(afterFailure),
            }
          );
          await assertOwnershipBeforeCommit(connection, ownership);
          await connection.commit();
        } catch (_) {}
      }
    }
    if (ownershipFailure) throw ownershipFailure;
    if (err instanceof ImportError) {
      err.details = {
        ...(err.details || {}),
        activeGenerationCommitted: activationCommitted,
      };
      throw err;
    }
    throw new ImportError(err.message || 'Import failed.', 500, {
      activeGenerationCommitted: activationCommitted,
    });
  } finally {
    if (ownership?.signal && abortListener) {
      ownership.signal.removeEventListener('abort', abortListener);
    }
    if (connection) {
      restoreExecutionDefaults?.();
      await db.releaseConnection(connection, { rollback: true, label: 'Media dataset import' });
    }
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

async function getActiveDataset() {
  const stored = await getStoredDatasetState();
  if (!stored) {
    throw new ImportError(
      'Active dataset state is unavailable until bootstrap or restart recovery completes.',
      503,
      {
        code: 'DATASET_STATE_UNAVAILABLE',
        mutationAttempted: false,
      }
    );
  }

  return {
    activeDataset: stored,
    activeOperation: await getActiveOperation(),
    readiness: await getDatasetReadiness(),
  };
}

async function runDatasetValidation({ parsed, fileOnly = false, lockKind, lockMessage, executeOptions = {} }) {
  if (!parsed.valid) {
    return formatValidationResult(parsed);
  }

  if (fileOnly) {
    return {
      ...formatValidationResult(parsed),
      message: 'Archive structure validation passed.',
    };
  }

  const validationLock = await acquireOperationLock(lockKind, lockMessage, {
    ownerType: 'validation',
    ownerId: `validation-${crypto.randomUUID()}`,
  });
  const ownership = startOperationHeartbeat({
    leaseToken: validationLock.leaseToken,
    ownerType: validationLock.ownerType,
  });
  try {
    const dryRun = await executeImportPlan({
      dataset: parsed.dataset,
      dryRun: true,
      ownership,
      ...executeOptions,
    });

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
        details: err.details || undefined,
      };
    }
    throw err;
  } finally {
    let stopError = null;
    try {
      await ownership.stop();
    } catch (error) {
      stopError = error;
    }
    await endOperation({ leaseToken: validationLock.leaseToken });
    if (stopError) throw stopError;
  }
}

function createJobProgressHandler(jobId, ownership) {
  let tail = Promise.resolve();
  const handler = (patch) => {
    tail = tail.then(async () => {
      ownership.assertOwned();
      await updateOwnedOperation(ownership, {
        phase: patch.phase,
        progress: patch.progress,
        message: patch.message,
        status: patch.status,
      });
      const current = await getJob(jobId);
      if (!current || ['completed', 'failed'].includes(String(current.status || '').toLowerCase())) {
        return;
      }
      await updateJob(jobId, patch, ownership);
    }).catch((error) => {
      // Only an exact token/expiry mismatch proves ownership loss. A transient
      // Oracle or pool failure must remain an infrastructure failure so normal
      // rollback and terminal job handling can run under the still-valid lease.
      if (error instanceof DatasetOperationOwnershipLostError) {
        ownership.loseOwnership(error);
      }
      throw error;
    });
    return tail;
  };
  handler.drain = async () => {
    await tail;
    ownership.assertOwned();
    await ownership.drain();
  };
  return handler;
}

async function startDatasetJob({ parsed, kind, lockMessage, queuedMessage, startMessage, completeMessage, datasetSource, executeOptions = {} }) {
  const admission = await createJobWithOperation({
    operation: kind,
    datasetVersion: IMPORT_VERSION,
    message: queuedMessage,
    warnings: [...parsed.warnings],
    counts: parsed.counts,
  }, {
    kind,
    message: lockMessage,
    status: 'queued',
    progress: 0,
    testDeliveryFault: executeOptions.testDeliveryFault || null,
  });
  if (!admission.job || !admission.operation) {
    throw new ImportError(
      `Another dataset operation is already in progress${admission.activeOperation?.kind
        ? ` (${admission.activeOperation.kind}).`
        : '.'}`,
      409,
      { activeOperation: admission.activeOperation || null }
    );
  }
  const { job, operation: lock } = admission;

  setImmediate(() => {
    runWithDatasetFailureControl(executeOptions.failureControl, async () => {
      let progressHandler = null;
      const ownership = startOperationHeartbeat({
        jobId: job.jobId,
        leaseToken: lock.leaseToken,
      });
      try {
        await updateOwnedOperation(ownership, {
          progress: 5,
          message: startMessage,
          status: 'running',
        });
        await updateJob(job.jobId, {
          status: 'running',
          phase: 'loading_candidate',
          progress: 5,
          message: startMessage,
        }, ownership);

        progressHandler = createJobProgressHandler(
          job.jobId,
          ownership
        );
        const result = await executeImportPlan({
          dataset: parsed.dataset,
          dryRun: false,
          progress: progressHandler,
          ownership,
          activation: {
            ...buildDatasetState(datasetSource),
            jobId: job.jobId,
            candidateGenerationId: job.candidateGenerationId,
            completeMessage,
          },
          ...executeOptions,
        });
        await progressHandler.drain();
        if (String(result.activation?.job?.status || '').toLowerCase() !== 'completed') {
          await updateJob(job.jobId, {
            status: 'running',
            phase: 'stabilizing',
            progress: 99,
            message: 'Dataset generation committed; durable In-Memory proof will retry.',
            warnings: [
              ...result.warnings,
              'Current-generation In-Memory execution proof is pending.',
            ],
            summary: result.summary,
            activeGenerationCommitted: true,
          }, ownership);
        }
      } catch (err) {
        let failure = err;
        if (progressHandler) {
          try {
            await progressHandler.drain();
          } catch (progressError) {
            failure = progressError;
          }
        }
        const ownershipLost = failure instanceof DatasetOperationOwnershipLostError
          || ownership.signal.aborted;
        if (ownershipLost) {
          console.warn(
            `Media dataset worker ${job.jobId} stopped after losing exact lease ownership.`
          );
          return;
        }
        const failureState = await markReadinessFailed({
          jobId: job.jobId,
          attemptedVersion: IMPORT_VERSION,
          readiness: failure.details?.readiness || null,
          message: failure.message,
          ownership,
        });
        await updateJob(job.jobId, {
          status: 'failed',
          phase: 'failed',
          progress: 100,
          message: failure.message || 'Import failed.',
          errors: [failure.message || 'Import failed.'],
          details: failure.details || undefined,
          errorCategory: failure.details?.failurePhase || failure.code || failure.name
            || 'required_feature_failure',
          activeGenerationCommitted: Boolean(
            failure.details?.activeGenerationCommitted || failureState?.activeGenerationCommitted
          ),
        }, ownership);
        injectSemanticFailure('after_failed_event_commit');
      } finally {
        await stopHeartbeatBeforeLeaseRelease({
          ownership,
          release: () => endOperation({
            jobId: job.jobId,
            leaseToken: lock.leaseToken,
          }),
        });
      }
    }).catch((error) => {
      console.warn(
        `Media dataset worker ${job.jobId} exited:`,
        error.message || error
      );
    });
  });

  return {
    jobId: job.jobId,
    message: queuedMessage,
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
    fileName: `media-content-intelligence-import-template-${version}.zip`,
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

async function startImport({
  req,
  body = {},
  headers = req?.headers || {},
  version = IMPORT_VERSION,
}) {
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
    executeOptions: {
      failureControl: resolveDatasetFailureControl({ headers }),
    },
  });
}

async function validateDemoRestore({ body = {}, query = {}, headers = {}, version = IMPORT_VERSION } = {}) {
  const demoDataset = getBundledDemoDataset(version);
  const demoDateRefresh = buildDemoDateRefreshOptions({ body, query, headers });
  return runDatasetValidation({
    parsed: demoDataset.parsed,
    fileOnly: false,
    lockKind: 'validate_restore_demo',
    lockMessage: 'Validating demo dataset restore...',
    executeOptions: { demoDateRefresh },
  });
}

async function startDemoRestore({ body = {}, query = {}, headers = {}, version = IMPORT_VERSION } = {}) {
  const demoDataset = getBundledDemoDataset(version);
  const demoDateRefresh = buildDemoDateRefreshOptions({ body, query, headers });
  const failureControl = resolveDatasetFailureControl({ headers });
  const testDeliveryFault = resolveDatasetEventDeliveryFault({ headers });
  return startDatasetJob({
    parsed: demoDataset.parsed,
    kind: 'restore_demo',
    lockMessage: 'Restoring the bundled demo dataset...',
    queuedMessage: 'Demo restore started.',
    startMessage: 'Restoring bundled demo dataset...',
    completeMessage: 'Demo dataset restored successfully.',
    datasetSource: 'demo',
    executeOptions: {
      demoDateRefresh,
      failureControl,
      testDeliveryFault,
    },
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
  recoverStabilizingDataset,
  recoverAllStabilizingDatasets,
  reproveActiveGenerationOnStartup,
  cleanupQuarantinedCandidateAssets,
  reconcileGenerationAssetVpdPolicies,

  // Exposed for local verification scripts.
  _private: {
    ImportError,
    buildFallbackBrandLinks,
    buildFallbackDemandForecasts,
    buildFallbackDemandRegions,
    buildFallbackInfluencerConnections,
    buildFallbackShipments,
    buildDemoDateRefreshSqlPlan,
    buildDemoDateRefreshOptions,
    findDemoSeedAnchor,
    findDatabaseDemoSeedAnchor,
    getBundledDemoDataset,
    getDateColumnEntries,
    injectSemanticFailure,
    captureActiveSurfaceFingerprints,
    projectRetainedStartupFingerprint,
    captureRetainedStartupFingerprint,
    verifyGenerationAssetAbsent,
    recordGenerationAssetCleanupFailure,
    FAILURE_PHASES,
    resolveDatasetFailureControl,
    parseArchiveDataset,
    parseDemoAnchorDate,
    reanchorDemoDates,
    refreshDemoDatesInDatabase,
    assertStabilizingRecoveryIdentity,
    readinessGenerationIdentity,
    loadCommittedOmlCandidate,
    reproveCommittedRequiredFeatures,
  },
};
