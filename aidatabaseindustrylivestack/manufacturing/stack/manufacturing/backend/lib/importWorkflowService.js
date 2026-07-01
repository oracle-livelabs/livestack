const AdmZip = require('adm-zip');
const { parse: parseCsvSync } = require('csv-parse/sync');
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
  createJob,
  updateJob,
  appendJobWarnings,
  getJob,
} = require('./importJobs');
const { getBundledDemoArchive } = require('./demoDatasetBundle');
const { getStoredDatasetState } = require('./datasetStateStore');
const { recordDatasetRefresh } = require('./usageCounterService');
const {
  runDemoDateValidation,
  summarizeDemoDateValidation,
} = require('./demoDateValidation');
const {
  beginOperation,
  updateOperation,
  endOperation,
  getActiveOperation,
} = require('./datasetOperationLock');
const {
  validateOrderPlantConsistency,
  validateShipmentChronology,
  validateSpatialCoordinatePairs,
} = require('./importDatasetInvariants');

let ollamaAssistant = null;
try {
  // Optional: only used to flush Ask Data schema/entity caches after import.
  ollamaAssistant = require('./ollamaAssistant');
} catch (_) {
  ollamaAssistant = null;
}

const MAX_ARCHIVE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const VECTOR_MODEL_NAME = 'ALL_MINILM_L12_V2';
const INSERT_SQL_CACHE = new Map();
const DEMO_DATE_ANCHOR_TABLE = 'APP_DEMO_DATE_ANCHOR';
const MANUFACTURING_GRAPH_NAME = 'MANUFACTURING_PRODUCTION_NETWORK';
const MANUFACTURING_GRAPH_STATE_TABLE = 'MANUFACTURING_GRAPH_STATE';
const MANUFACTURING_GRAPH_ACCESS_TABLE = 'MANUFACTURING_GRAPH_ENTITY_ACCESS';
const MANUFACTURING_GRAPH_REFRESH_PROCEDURE = 'REFRESH_MANUFACTURING_GRAPH_DOMAIN';
const MANUFACTURING_OML_REBUILD_PROCEDURE = 'REBUILD_MANUFACTURING_OML_MODELS';
const GRAPH_ADMIN_CONTEXT_USER = 'admin_jess';
const REQUIRED_VECTOR_TABLES = [
  'PRODUCT_EMBEDDINGS',
  'MANUFACTURING_SIGNAL_EMBEDDINGS',
  'MANUFACTURING_SIGNAL_PART_MATCHES',
];
const REQUIRED_OML_MODELS = [
  'CUSTOMER_SEGMENT_MODEL',
  'DEMAND_SURGE_MODEL',
  'PRODUCT_CLUSTER_MODEL',
  'REVENUE_PREDICT_MODEL',
];
const REQUIRED_OML_TRAINING_POPULATION = Object.freeze({
  demandRows: 20,
  demandClasses: 3,
  customerRows: 100,
  revenueRows: 100,
  productRows: 20,
});
const REQUIRED_GRAPH_TABLES = [
  'MANUFACTURING_GRAPH_ENTITIES',
  'MANUFACTURING_GRAPH_RELATIONSHIPS',
  'MANUFACTURING_RISK_CASES',
  'MANUFACTURING_CASE_ENTITIES',
  MANUFACTURING_GRAPH_STATE_TABLE,
  MANUFACTURING_GRAPH_ACCESS_TABLE,
];
const REQUIRED_IMPORT_TABLES = [
  ...new Set([
    ...DELETE_ORDER.map((tableName) => tableName.toUpperCase()),
    ...TABLES.map((table) => table.name.toUpperCase()),
    'APP_DATASET_STATE',
    DEMO_DATE_ANCHOR_TABLE,
    ...REQUIRED_VECTOR_TABLES,
    ...REQUIRED_GRAPH_TABLES,
  ]),
];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const OPTIONAL_DEMO_DATE_REFRESH_COLUMNS = [
  { tableName: 'manufacturing_graph_entities', columnName: 'created_at', type: 'timestamp' },
  { tableName: 'manufacturing_graph_relationships', columnName: 'first_seen', type: 'timestamp' },
  { tableName: 'manufacturing_graph_relationships', columnName: 'last_interaction', type: 'timestamp' },
  { tableName: 'manufacturing_risk_cases', columnName: 'created_at', type: 'timestamp' },
  { tableName: 'agent_actions', columnName: 'created_at', type: 'timestamp' },
  { tableName: 'event_stream', columnName: 'created_at', type: 'timestamp' },
];
let cachedBundledDemoDataset = null;
let dbModule = null;

function getDb() {
  if (!dbModule) {
    dbModule = require('../config/database');
  }
  return dbModule;
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
    '# Manufacturing Operations Import Template',
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
    '- Derived columns such as customers.location, fulfillment_centers.location, manufacturing_work_order_lines.line_value, fulfillment_zones, and vector embedding tables are rebuilt by the importer and therefore are not included as editable CSV inputs.',
    '- inventory.csv is required.',
    '- shipments.csv, demand_regions.csv, manufacturing_demand_forecasts.csv, influencer_connections.csv, and brand_influencer_links.csv are optional.',
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

function acquireOperationLock(kind, message) {
  const acquired = beginOperation({
    kind,
    message,
    progress: 0,
    status: 'running',
  });

  if (acquired) {
    return acquired;
  }

  const activeOperation = getActiveOperation();
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
    if (buffer.length > MAX_ARCHIVE_SIZE_BYTES) {
      throw new ImportError(`ZIP file exceeds ${Math.round(MAX_ARCHIVE_SIZE_BYTES / (1024 * 1024))} MB limit.`);
    }
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
  let totalUncompressedBytes = 0;

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;

    const uncompressedBytes = Number(entry.header?.size ?? 0);
    if (!Number.isSafeInteger(uncompressedBytes) || uncompressedBytes < 0) {
      throw new ImportError(`ZIP entry "${entry.entryName}" has an invalid uncompressed size.`);
    }
    if (uncompressedBytes > MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES) {
      throw new ImportError(
        `ZIP entry "${entry.entryName}" exceeds the ${Math.round(MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES / (1024 * 1024))} MB uncompressed limit.`
      );
    }
    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new ImportError(
        `ZIP contents exceed the ${Math.round(MAX_ARCHIVE_UNCOMPRESSED_BYTES / (1024 * 1024))} MB total uncompressed limit.`
      );
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

function readCheckedArchiveEntry(entry) {
  const declaredBytes = Number(entry?.header?.size ?? 0);
  let data;
  try {
    data = entry.getData();
  } catch (err) {
    throw new ImportError(
      `ZIP entry "${entry.entryName}" could not be decompressed safely.`,
      400,
      err.message
    );
  }

  const actualBytes = Buffer.isBuffer(data) ? data.length : -1;
  if (
    actualBytes < 0 ||
    actualBytes > declaredBytes ||
    actualBytes > MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES
  ) {
    throw new ImportError(
      `ZIP entry "${entry.entryName}" decompressed beyond its declared or permitted size.`
    );
  }
  if (actualBytes !== declaredBytes) {
    throw new ImportError(
      `ZIP entry "${entry.entryName}" decompressed to ${actualBytes} bytes instead of the declared ${declaredBytes} bytes.`
    );
  }

  return data;
}

function parseManifest(files, version) {
  const manifestEntry = files.get('manifest.json');
  if (!manifestEntry) {
    throw new ImportError('ZIP is missing manifest.json.');
  }

  const manifestText = readCheckedArchiveEntry(manifestEntry).toString('utf8');
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
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
    return column.defaultValue ?? null;
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

  validateOrderPlantConsistency(dataset, errors);
  validateShipmentChronology(dataset, errors);
  validateSpatialCoordinatePairs(dataset, errors);

  const demandRegions = dataset.tables.demand_regions;
  const demandForecasts = dataset.tables.manufacturing_demand_forecasts;
  if (demandForecasts?.provided) {
    if (demandRegions?.provided) {
      const regionNames = new Set(
        demandRegions.rows.map((row) => String(row.region_name || '').trim().toLowerCase()).filter(Boolean)
      );
      for (const row of demandForecasts.rows) {
        const regionName = String(row.planning_region || '').trim();
        if (regionName && !regionNames.has(regionName.toLowerCase())) {
          errors.push(
            `manufacturing_demand_forecasts.csv line ${row.__lineNumber}: region "${regionName}" does not exist in demand_regions.csv.`
          );
        }
      }
    } else {
      warnings.push('manufacturing_demand_forecasts.csv was provided without demand_regions.csv. Region names were not cross-checked.');
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

    const csvText = readCheckedArchiveEntry(entry).toString('utf8');
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
  const forecastStart = minDate(getDateValues(dataset, 'manufacturing_demand_forecasts', 'forecast_date'));
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

async function inspectManufacturingGraphLifecycleObjects(connection) {
  const result = await execSql(connection, `
    SELECT
      (SELECT COUNT(*)
       FROM user_objects
       WHERE object_name = :stateTableName
         AND object_type = 'TABLE') AS state_table_count,
      (SELECT COUNT(*)
       FROM user_objects
       WHERE object_name = :accessTableName
         AND object_type = 'TABLE') AS access_table_count,
      (SELECT COUNT(*)
       FROM user_objects
       WHERE object_name = :refreshProcedureName
         AND object_type = 'PROCEDURE') AS refresh_procedure_count,
      (SELECT MAX(status)
       FROM user_objects
       WHERE object_name = :refreshProcedureName
         AND object_type = 'PROCEDURE') AS refresh_procedure_status,
      (SELECT COUNT(*)
       FROM user_property_graphs
       WHERE graph_name = :graphName) AS property_graph_count,
      (SELECT MAX(graph_mode)
       FROM user_property_graphs
       WHERE graph_name = :graphName) AS property_graph_mode
    FROM dual
  `, {
    stateTableName: MANUFACTURING_GRAPH_STATE_TABLE,
    accessTableName: MANUFACTURING_GRAPH_ACCESS_TABLE,
    refreshProcedureName: MANUFACTURING_GRAPH_REFRESH_PROCEDURE,
    graphName: MANUFACTURING_GRAPH_NAME,
  });

  const row = result.rows[0] || {};
  return {
    stateTableInstalled: Number(row.STATE_TABLE_COUNT ?? row.state_table_count ?? 0) === 1,
    accessTableInstalled: Number(row.ACCESS_TABLE_COUNT ?? row.access_table_count ?? 0) === 1,
    refreshProcedureInstalled: Number(row.REFRESH_PROCEDURE_COUNT ?? row.refresh_procedure_count ?? 0) === 1,
    refreshProcedureStatus: row.REFRESH_PROCEDURE_STATUS ?? row.refresh_procedure_status ?? null,
    propertyGraphInstalled: Number(row.PROPERTY_GRAPH_COUNT ?? row.property_graph_count ?? 0) === 1,
    propertyGraphMode: row.PROPERTY_GRAPH_MODE ?? row.property_graph_mode ?? null,
  };
}

function requireCompleteManufacturingGraphLifecycle(objects) {
  const incomplete = !objects.stateTableInstalled ||
    !objects.accessTableInstalled ||
    !objects.refreshProcedureInstalled ||
    String(objects.refreshProcedureStatus || '').toUpperCase() !== 'VALID' ||
    !objects.propertyGraphInstalled ||
    String(objects.propertyGraphMode || '').toUpperCase() !== 'ENFORCED';

  if (incomplete) {
    throw new ImportError(
      'Manufacturing graph lifecycle is incomplete or invalid; dataset replacement cannot continue safely.',
      500,
      {
        stateTableInstalled: objects.stateTableInstalled,
        accessTableInstalled: objects.accessTableInstalled,
        refreshProcedureInstalled: objects.refreshProcedureInstalled,
        refreshProcedureStatus: objects.refreshProcedureStatus,
        propertyGraphInstalled: objects.propertyGraphInstalled,
        propertyGraphMode: objects.propertyGraphMode,
      }
    );
  }

  return true;
}

async function inspectRequiredImportPrerequisites(connection) {
  const graphObjects = await inspectManufacturingGraphLifecycleObjects(connection);
  requireCompleteManufacturingGraphLifecycle(graphObjects);

  const tableBinds = Object.fromEntries(
    REQUIRED_IMPORT_TABLES.map((tableName, index) => [`table${index}`, tableName])
  );
  const tableResult = await execSql(connection, `
    SELECT table_name
    FROM user_tables
    WHERE table_name IN (${REQUIRED_IMPORT_TABLES.map((_, index) => `:table${index}`).join(', ')})
  `, tableBinds);
  const installedTables = new Set(
    (tableResult.rows || []).map((row) => String(row.TABLE_NAME ?? row.table_name ?? '').toUpperCase())
  );
  const missingTables = REQUIRED_IMPORT_TABLES.filter((tableName) => !installedTables.has(tableName));

  const vectorModelResult = await execSql(connection, `
    SELECT model_name, mining_function
    FROM user_mining_models
    WHERE model_name = :modelName
  `, { modelName: VECTOR_MODEL_NAME });
  const vectorModelRows = vectorModelResult.rows || [];
  const vectorModel = vectorModelRows[0] || {};
  const vectorMiningFunction = String(
    vectorModel.MINING_FUNCTION ?? vectorModel.mining_function ?? ''
  ).toUpperCase();

  const omlProcedureResult = await execSql(connection, `
    SELECT object_name, status
    FROM user_objects
    WHERE object_type = 'PROCEDURE'
      AND object_name = :procedureName
  `, { procedureName: MANUFACTURING_OML_REBUILD_PROCEDURE });
  const omlProcedure = omlProcedureResult.rows?.[0] || {};
  const omlProcedureStatus = String(
    omlProcedure.STATUS ?? omlProcedure.status ?? ''
  ).toUpperCase();

  if (
    missingTables.length > 0 ||
    vectorModelRows.length !== 1 ||
    vectorMiningFunction !== 'EMBEDDING' ||
    omlProcedureResult.rows?.length !== 1 ||
    omlProcedureStatus !== 'VALID'
  ) {
    throw new ImportError(
      'Manufacturing dataset replacement prerequisites are incomplete; no data was changed.',
      503,
      {
        missingTables,
        vectorModel: {
          name: VECTOR_MODEL_NAME,
          installedCount: vectorModelRows.length,
          miningFunction: vectorMiningFunction || null,
          requiredMiningFunction: 'EMBEDDING',
        },
        omlRebuildProcedure: {
          name: MANUFACTURING_OML_REBUILD_PROCEDURE,
          installedCount: omlProcedureResult.rows?.length || 0,
          status: omlProcedureStatus || null,
          requiredStatus: 'VALID',
        },
        graphLifecycle: graphObjects,
      }
    );
  }

  return {
    ready: true,
    checkedAt: new Date().toISOString(),
    requiredTableCount: REQUIRED_IMPORT_TABLES.length,
    missingTables: [],
    demoDateAnchorTable: DEMO_DATE_ANCHOR_TABLE,
    vector: {
      modelName: vectorModel.MODEL_NAME ?? vectorModel.model_name ?? VECTOR_MODEL_NAME,
      miningFunction: vectorMiningFunction,
      artifactTables: [...REQUIRED_VECTOR_TABLES],
    },
    oml: {
      rebuildProcedure: MANUFACTURING_OML_REBUILD_PROCEDURE,
      procedureStatus: omlProcedureStatus,
      requiredModels: [...REQUIRED_OML_MODELS],
    },
    graphLifecycle: {
      installed: true,
      ...graphObjects,
    },
  };
}

async function getDatasetReplacementReadiness() {
  const db = getDb();
  return db.withUserConnection(GRAPH_ADMIN_CONTEXT_USER, async ({ connection }) => (
    inspectRequiredImportPrerequisites(connection)
  ), { readOnly: true });
}

async function invalidateManufacturingGraphState(connection, graphObjects) {
  requireCompleteManufacturingGraphLifecycle(graphObjects);

  const result = await execSql(connection, `
    DELETE FROM manufacturing_graph_state
    WHERE graph_name = :graphName
  `, { graphName: MANUFACTURING_GRAPH_NAME });

  return {
    installed: true,
    stateInvalidated: true,
    stateRowsDeleted: Number(result.rowsAffected || 0),
    refreshProcedureStatus: graphObjects.refreshProcedureStatus,
  };
}

async function establishGraphAdminContext(connection) {
  await execSql(
    connection,
    'BEGIN manufacturing_security_pkg.set_user_context(:username); END;',
    { username: GRAPH_ADMIN_CONTEXT_USER }
  );

  const result = await execSql(connection, `
    SELECT SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE') AS role_name
    FROM dual
  `);
  const row = result.rows[0] || {};
  const role = String(row.ROLE_NAME ?? row.role_name ?? '').toLowerCase();
  if (role !== 'admin') {
    throw new ImportError('Manufacturing dataset operation could not establish the required admin database context.', 500);
  }
}

async function releaseGraphAdminConnection(connection) {
  if (!connection) return;

  let dropConnection = false;
  try {
    await connection.rollback();
    await connection.execute(
      'BEGIN manufacturing_security_pkg.clear_user_context; END;',
      {},
      { autoCommit: true }
    );
  } catch (err) {
    dropConnection = true;
    console.warn('Unable to clear Manufacturing database context:', err.message || err);
  }

  try {
    if (dropConnection) {
      await connection.close({ drop: true });
    } else {
      await connection.close();
    }
  } catch (_) {
    // Pool shutdown or connection loss already makes the session unavailable.
  }
}

async function refreshManufacturingGraphDomainInTransaction(connection, { datasetSource, lifecycle }) {
  requireCompleteManufacturingGraphLifecycle(lifecycle);

  await execSql(connection, 'BEGIN refresh_manufacturing_graph_domain; END;');

  const stateResult = await execSql(connection, `
    SELECT graph_state.dataset_source,
           graph_state.dataset_version,
           graph_state.entity_count,
           graph_state.relationship_count,
           dataset.active_source,
           dataset.active_version,
           (SELECT COUNT(*) FROM manufacturing_graph_entities) AS actual_entity_count,
           (SELECT COUNT(*) FROM manufacturing_graph_relationships) AS actual_relationship_count
    FROM manufacturing_graph_state graph_state
    JOIN app_dataset_state dataset
      ON dataset.state_id = 1
    WHERE graph_state.graph_name = :graphName
  `, { graphName: MANUFACTURING_GRAPH_NAME });
  const stateRow = stateResult.rows[0] || {};
  const graphDatasetSource = String(
    stateRow.DATASET_SOURCE ?? stateRow.dataset_source ?? ''
  ).toLowerCase();
  const graphDatasetVersion = String(
    stateRow.DATASET_VERSION ?? stateRow.dataset_version ?? ''
  );
  const activeDatasetSource = String(
    stateRow.ACTIVE_SOURCE ?? stateRow.active_source ?? ''
  ).toLowerCase();
  const activeDatasetVersion = String(
    stateRow.ACTIVE_VERSION ?? stateRow.active_version ?? ''
  );
  const entityCount = Number(stateRow.ENTITY_COUNT ?? stateRow.entity_count ?? -1);
  const relationshipCount = Number(stateRow.RELATIONSHIP_COUNT ?? stateRow.relationship_count ?? -1);
  const actualEntityCount = Number(stateRow.ACTUAL_ENTITY_COUNT ?? stateRow.actual_entity_count ?? -1);
  const actualRelationshipCount = Number(
    stateRow.ACTUAL_RELATIONSHIP_COUNT ?? stateRow.actual_relationship_count ?? -1
  );

  const invalid = stateResult.rows.length !== 1 ||
    graphDatasetSource !== datasetSource ||
    graphDatasetVersion !== IMPORT_VERSION ||
    activeDatasetSource !== datasetSource ||
    activeDatasetVersion !== IMPORT_VERSION ||
    entityCount !== actualEntityCount ||
    relationshipCount !== actualRelationshipCount ||
    entityCount <= 0 ||
    relationshipCount <= 0;

  if (invalid) {
    throw new ImportError(
      'Manufacturing graph refresh returned an invalid in-transaction dataset state.',
      500,
      {
        graphDatasetSource: graphDatasetSource || null,
        graphDatasetVersion: graphDatasetVersion || null,
        activeDatasetSource: activeDatasetSource || null,
        activeDatasetVersion: activeDatasetVersion || null,
        entityCount,
        actualEntityCount,
        relationshipCount,
        actualRelationshipCount,
      }
    );
  }

  return {
    status: 'ready',
    refreshStatus: 'ready',
    graphAvailable: true,
    graphDatasetSource,
    graphDatasetVersion,
    activeDatasetSource,
    activeDatasetVersion,
    entityCount,
    relationshipCount,
    transaction: 'same_connection_before_commit',
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

function buildDemoDateRefreshSqlPlanEntry({ tableName, columnName, type, optional = false }) {
  const updateExpression = type === 'date'
    ? `${columnName} + :offsetDays`
    : `${columnName} + NUMTODSINTERVAL(:offsetSeconds, 'SECOND')`;

  return {
    tableName,
    columnName,
    type,
    optional,
    countSql: `SELECT COUNT(*) AS cnt FROM ${tableName} WHERE ${columnName} IS NOT NULL`,
    updateSql: `UPDATE ${tableName} SET ${columnName} = ${updateExpression} WHERE ${columnName} IS NOT NULL`,
  };
}

function buildDemoDateRefreshSqlPlan({ includeOptional = true } = {}) {
  const importPlan = getDateColumnEntries().map((entry) => buildDemoDateRefreshSqlPlanEntry(entry));
  if (!includeOptional) return importPlan;

  return [
    ...importPlan,
    ...OPTIONAL_DEMO_DATE_REFRESH_COLUMNS.map((entry) =>
      buildDemoDateRefreshSqlPlanEntry({ ...entry, optional: true })
    ),
  ];
}

async function demoDateRefreshColumnExists(connection, tableName, columnName) {
  const result = await execSql(connection, `
    SELECT COUNT(*) AS cnt
    FROM user_tab_columns
    WHERE table_name = UPPER(:tableName)
      AND column_name = UPPER(:columnName)
  `, { tableName, columnName });

  return Number(result.rows[0]?.CNT || result.rows[0]?.cnt || 0) > 0;
}

async function findLatestAnchorForRefreshPlans(connection, plans) {
  if (!plans.length) return null;

  const unionSql = plans
    .map(({ tableName, columnName }) => (
      `SELECT MAX(TRUNC(CAST(${columnName} AS DATE))) AS seed_date FROM ${tableName} WHERE ${columnName} IS NOT NULL`
    ))
    .join('\nUNION ALL\n');

  const result = await execSql(connection, `
    SELECT TO_CHAR(MAX(seed_date), 'YYYY-MM-DD') AS seed_anchor
    FROM (
      ${unionSql}
    )
  `);
  const anchorText = result.rows[0]?.SEED_ANCHOR || result.rows[0]?.seed_anchor;
  return anchorText ? parseDemoAnchorDate(anchorText, 'database optional seed anchor') : null;
}

async function resolveDemoDateRefreshPlans(connection) {
  const importPlans = [];
  const optionalPlans = [];

  for (const plan of buildDemoDateRefreshSqlPlan()) {
    if (!plan.optional) {
      importPlans.push(plan);
      continue;
    }

    if (await demoDateRefreshColumnExists(connection, plan.tableName, plan.columnName)) {
      optionalPlans.push(plan);
    }
  }

  return { importPlans, optionalPlans };
}

async function findDatabaseDemoSeedAnchor(connection) {
  const forecastAnchor = await execSql(connection, `
    SELECT TO_CHAR(TRUNC(MIN(forecast_date)), 'YYYY-MM-DD') AS seed_anchor
    FROM manufacturing_demand_forecasts
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
  const { importPlans, optionalPlans } = await resolveDemoDateRefreshPlans(connection);
  const optionalSeedAnchor = await findLatestAnchorForRefreshPlans(connection, optionalPlans);
  const optionalOffsetMs = optionalSeedAnchor
    ? restoreAnchor.getTime() - optionalSeedAnchor.getTime()
    : 0;
  const optionalOffsetDays = optionalOffsetMs / MS_PER_DAY;
  const optionalOffsetSeconds = optionalOffsetMs / 1000;

  for (const plan of [...importPlans, ...optionalPlans]) {
    const countResult = await execSql(connection, plan.countSql);
    const columnValueCount = Number(countResult.rows[0]?.CNT || countResult.rows[0]?.cnt || 0);
    if (columnValueCount <= 0) continue;

    const planOffsetSeconds = plan.optional ? optionalOffsetSeconds : offsetSeconds;
    const planUpdateBinds = plan.type === 'date'
      ? { offsetDays: plan.optional ? optionalOffsetDays : offsetDays }
      : { offsetSeconds: plan.optional ? optionalOffsetSeconds : offsetSeconds };

    if (planOffsetSeconds !== 0) {
      await execSql(connection, plan.updateSql, planUpdateBinds);
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

async function persistDemoDateAnchorInTransaction(connection, metadata) {
  if (!metadata) {
    return {
      persisted: false,
      status: 'not_applicable',
    };
  }

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

  const persistedResult = await execSql(connection, `
    SELECT anchor_source,
           anchor_strategy,
           restore_anchor,
           shifted_value_count,
           refreshed_at
    FROM app_demo_date_anchor
    WHERE anchor_id = 1
  `);
  const row = persistedResult.rows[0] || {};
  const restoreAnchor = row.RESTORE_ANCHOR ?? row.restore_anchor ?? null;
  const persistedRestoreDate = restoreAnchor instanceof Date
    ? dateToIsoDate(restoreAnchor)
    : dateToIsoDate(parseDemoAnchorDate(restoreAnchor, 'persisted restore anchor'));
  const expectedRestoreDate = dateToIsoDate(metadata.restoreAnchor);
  const anchorSource = row.ANCHOR_SOURCE ?? row.anchor_source ?? null;
  const anchorStrategy = row.ANCHOR_STRATEGY ?? row.anchor_strategy ?? null;
  const shiftedValueCount = Number(row.SHIFTED_VALUE_COUNT ?? row.shifted_value_count ?? -1);

  if (
    persistedResult.rows.length !== 1 ||
    anchorSource !== metadata.anchorSource ||
    anchorStrategy !== metadata.anchorStrategy ||
    persistedRestoreDate !== expectedRestoreDate ||
    shiftedValueCount !== Number(metadata.shiftedValueCount)
  ) {
    throw new ImportError(
      'Demo date anchor metadata could not be verified in the import transaction.',
      500,
      {
        expected: {
          anchorSource: metadata.anchorSource,
          anchorStrategy: metadata.anchorStrategy,
          restoreAnchorDate: expectedRestoreDate,
          shiftedValueCount: metadata.shiftedValueCount,
        },
        persisted: {
          anchorSource,
          anchorStrategy,
          restoreAnchorDate: persistedRestoreDate,
          shiftedValueCount,
        },
      }
    );
  }

  const refreshedAt = row.REFRESHED_AT ?? row.refreshed_at ?? null;
  return {
    persisted: true,
    status: 'ready',
    ...formatDemoDateRefresh(metadata),
    refreshedAt: refreshedAt instanceof Date ? refreshedAt.toISOString() : refreshedAt,
    transaction: 'same_connection_before_commit',
  };
}

function getInsertStatement(table) {
  if (INSERT_SQL_CACHE.has(table.name)) {
    return INSERT_SQL_CACHE.get(table.name);
  }

  const dataColumns = table.columns.filter((column) => !column.sourceId);
  const columnList = dataColumns.map((column) => column.name).join(', ');
  const valueList = dataColumns.map((column) => {
    if (table.name === 'demand_regions' && column.name === 'boundary') {
      return 'SDO_UTIL.FROM_WKTGEOMETRY(:boundary, 4326)';
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
  const db = getDb();
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

  const result = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM fulfillment_centers) AS center_count,
      (SELECT COUNT(*)
       FROM fulfillment_centers fc
       JOIN user_sdo_geom_metadata metadata
         ON metadata.table_name = 'FULFILLMENT_CENTERS'
        AND metadata.column_name = 'LOCATION'
        AND metadata.srid = 4326
       WHERE fc.location IS NOT NULL
         AND fc.location.sdo_gtype = 2001
         AND fc.location.sdo_srid = 4326
         AND ABS(fc.location.sdo_point.x - fc.longitude) <= 0.000000001
         AND ABS(fc.location.sdo_point.y - fc.latitude) <= 0.000000001
         AND SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(fc.location, metadata.diminfo) = 'TRUE') AS valid_centers,
      (SELECT COUNT(*) FROM customers) AS customer_count,
      (SELECT COUNT(*) FROM customers
       WHERE latitude IS NOT NULL
         AND longitude IS NOT NULL) AS geocoded_customers,
      (SELECT COUNT(*)
       FROM customers c
       JOIN user_sdo_geom_metadata metadata
         ON metadata.table_name = 'CUSTOMERS'
        AND metadata.column_name = 'LOCATION'
        AND metadata.srid = 4326
       WHERE c.location IS NOT NULL
         AND c.location.sdo_gtype = 2001
         AND c.location.sdo_srid = 4326
         AND ABS(c.location.sdo_point.x - c.longitude) <= 0.000000001
         AND ABS(c.location.sdo_point.y - c.latitude) <= 0.000000001
         AND SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(c.location, metadata.diminfo) = 'TRUE') AS valid_customers
    FROM dual
  `);
  const row = result.rows[0] || {};
  const centerCount = Number(row.CENTER_COUNT ?? row.center_count ?? 0);
  const validCenters = Number(row.VALID_CENTERS ?? row.valid_centers ?? 0);
  const customerCount = Number(row.CUSTOMER_COUNT ?? row.customer_count ?? 0);
  const geocodedCustomers = Number(row.GEOCODED_CUSTOMERS ?? row.geocoded_customers ?? 0);
  const validCustomers = Number(row.VALID_CUSTOMERS ?? row.valid_customers ?? 0);

  if (centerCount === 0 || validCenters !== centerCount ||
      customerCount === 0 || validCustomers !== geocodedCustomers) {
    throw new ImportError('Oracle Spatial point rebuild did not produce valid WGS84 geometry.', 500, {
      centerCount,
      validCenters,
      customerCount,
      geocodedCustomers,
      validCustomers,
    });
  }

  return { centerCount, validCenters, customerCount, geocodedCustomers, validCustomers };
}

async function validateDemandRegionGeometry(connection, { requireRows = false } = {}) {
  const result = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM demand_regions) AS region_count,
      (SELECT COUNT(*)
       FROM user_sdo_geom_metadata
       WHERE table_name = 'DEMAND_REGIONS'
         AND column_name = 'BOUNDARY'
         AND srid = 4326) AS metadata_count,
      (SELECT COUNT(*)
       FROM demand_regions region
       JOIN user_sdo_geom_metadata metadata
         ON metadata.table_name = 'DEMAND_REGIONS'
        AND metadata.column_name = 'BOUNDARY'
        AND metadata.srid = 4326
       WHERE region.boundary IS NOT NULL
         AND region.boundary.sdo_gtype IN (2003, 2007)
         AND region.boundary.sdo_srid = 4326
         AND SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(
               region.boundary,
               metadata.diminfo
             ) = 'TRUE') AS valid_regions
    FROM dual
  `);
  const row = result.rows[0] || {};
  const regionCount = Number(row.REGION_COUNT ?? row.region_count ?? 0);
  const metadataCount = Number(row.METADATA_COUNT ?? row.metadata_count ?? 0);
  const validRegions = Number(row.VALID_REGIONS ?? row.valid_regions ?? 0);

  if (metadataCount !== 1 || validRegions !== regionCount || (requireRows && regionCount === 0)) {
    throw new ImportError('Oracle Spatial demand-region validation failed.', 500, {
      regionCount,
      validRegions,
      metadataCount,
      required: Boolean(requireRows),
      srid: 4326,
    });
  }

  return { regionCount, validRegions, metadataCount, srid: 4326 };
}

async function rebuildSpatialRoutes(connection, { forceOracleMetrics = false } = {}) {
  const mergeResult = await execSql(connection, `
    MERGE INTO shipments target
    USING (
      SELECT measured.shipment_id,
             ROUND(measured.distance_miles * 1.60934, 2) AS distance_km,
             ROUND(measured.distance_miles / 55, 1) AS estimated_hours
      FROM (
        SELECT shipment.shipment_id,
               SDO_GEOM.SDO_DISTANCE(
                 customer.location,
                 center.location,
                 0.005,
                 'unit=MILE'
               ) AS distance_miles
        FROM shipments shipment
        JOIN manufacturing_work_orders work_order
          ON work_order.work_order_id = shipment.work_order_id
        JOIN customers customer
          ON customer.customer_id = work_order.customer_account_id
        JOIN fulfillment_centers center
          ON center.center_id = shipment.center_id
        WHERE :forceOracleMetrics = 1
           OR shipment.distance_km IS NULL
           OR shipment.estimated_hours IS NULL
      ) measured
    ) source
    ON (target.shipment_id = source.shipment_id)
    WHEN MATCHED THEN UPDATE SET
      target.distance_km = source.distance_km,
      target.estimated_hours = source.estimated_hours
  `, { forceOracleMetrics: forceOracleMetrics ? 1 : 0 });

  const result = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM shipments) AS route_count,
      (SELECT COUNT(*) FROM shipments
       WHERE distance_km IS NOT NULL
         AND estimated_hours IS NOT NULL) AS complete_routes
    FROM dual
  `);
  const row = result.rows[0] || {};
  const routeCount = Number(row.ROUTE_COUNT ?? row.route_count ?? 0);
  const completeRoutes = Number(row.COMPLETE_ROUTES ?? row.complete_routes ?? 0);

  if (completeRoutes !== routeCount) {
    throw new ImportError('Every imported shipment must have complete route metrics.', 500, {
      routeCount,
      completeRoutes,
      oracleDerivedRoutes: Number(mergeResult.rowsAffected || 0),
    });
  }

  let verifiedRoutes = null;
  if (forceOracleMetrics) {
    const verification = await execSql(connection, `
      SELECT COUNT(*) AS verified_routes
      FROM (
        SELECT shipment.distance_km,
               shipment.estimated_hours,
               ROUND(measured.distance_miles * 1.60934, 2) AS expected_distance_km,
               ROUND(measured.distance_miles / 55, 1) AS expected_hours
        FROM shipments shipment
        JOIN manufacturing_work_orders work_order
          ON work_order.work_order_id = shipment.work_order_id
        JOIN customers customer
          ON customer.customer_id = work_order.customer_account_id
        JOIN fulfillment_centers center
          ON center.center_id = shipment.center_id
        CROSS APPLY (
          SELECT SDO_GEOM.SDO_DISTANCE(
                   customer.location,
                   center.location,
                   0.005,
                   'unit=MILE'
                 ) AS distance_miles
          FROM dual
        ) measured
      ) route
      WHERE route.distance_km = route.expected_distance_km
        AND route.estimated_hours = route.expected_hours
    `);
    const verificationRow = verification.rows[0] || {};
    verifiedRoutes = Number(
      verificationRow.VERIFIED_ROUTES ?? verificationRow.verified_routes ?? 0
    );

    if (verifiedRoutes !== routeCount) {
      throw new ImportError('Oracle Spatial route rebuild did not verify every demo shipment.', 500, {
        routeCount,
        verifiedRoutes,
        metricSource: 'SDO_GEOM.SDO_DISTANCE',
      });
    }
  }

  return {
    routeCount,
    completeRoutes,
    verifiedRoutes,
    oracleDerivedRoutes: Number(mergeResult.rowsAffected || 0),
    metricSource: forceOracleMetrics
      ? 'SDO_GEOM.SDO_DISTANCE'
      : 'PROVIDED_OR_SDO_DISTANCE_FALLBACK',
  };
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

  const validation = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM fulfillment_centers WHERE is_active = 1) AS active_centers,
      (SELECT COUNT(*)
       FROM fulfillment_zones zone
       JOIN fulfillment_centers center
         ON center.center_id = zone.center_id
        AND center.is_active = 1
       JOIN user_sdo_geom_metadata metadata
         ON metadata.table_name = 'FULFILLMENT_ZONES'
        AND metadata.column_name = 'ZONE_BOUNDARY'
        AND metadata.srid = 4326
       WHERE zone.zone_boundary IS NOT NULL
         AND zone.zone_boundary.sdo_gtype = 2003
         AND zone.zone_boundary.sdo_srid = 4326
         AND SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(zone.zone_boundary, metadata.diminfo) = 'TRUE'
         AND SDO_GEOM.RELATE(
               zone.zone_boundary,
               'EQUAL',
               SDO_GEOM.SDO_BUFFER(
                 center.location,
                 CASE zone.zone_type
                   WHEN 'express' THEN 80000
                   WHEN 'overnight' THEN 160000
                   WHEN 'standard' THEN 250000
                   WHEN 'economy' THEN 500000
                 END,
                 1,
                 'unit=METER'
               ),
               0.005
             ) = 'EQUAL') AS valid_zones,
      (SELECT COUNT(*)
       FROM (
         SELECT zone.center_id
         FROM fulfillment_zones zone
         JOIN fulfillment_centers center
           ON center.center_id = zone.center_id
          AND center.is_active = 1
         GROUP BY zone.center_id
         HAVING COUNT(*) = 4
            AND COUNT(DISTINCT zone_type) = 4
            AND SUM(CASE
                  WHEN zone_type = 'express' AND max_delivery_hrs = 8 THEN 1
                  WHEN zone_type = 'overnight' AND max_delivery_hrs = 16 THEN 1
                  WHEN zone_type = 'standard' AND max_delivery_hrs = 24 THEN 1
                  WHEN zone_type = 'economy' AND max_delivery_hrs = 72 THEN 1
                  ELSE 0
                END) = 4
       )) AS complete_zone_centers,
      (SELECT COUNT(*)
       FROM fulfillment_zones zone
       JOIN fulfillment_centers center
         ON center.center_id = zone.center_id
       WHERE center.is_active <> 1) AS inactive_zones
    FROM dual
  `);
  const row = validation.rows[0] || {};
  const activeCenters = Number(row.ACTIVE_CENTERS ?? row.active_centers ?? 0);
  const validZones = Number(row.VALID_ZONES ?? row.valid_zones ?? 0);
  const completeZoneCenters = Number(row.COMPLETE_ZONE_CENTERS ?? row.complete_zone_centers ?? 0);
  const inactiveZones = Number(row.INACTIVE_ZONES ?? row.inactive_zones ?? 0);

  if (activeCenters === 0 || inserted !== activeCenters * 4 ||
      validZones !== inserted || completeZoneCenters !== activeCenters || inactiveZones !== 0) {
    throw new ImportError('Oracle Spatial capacity-zone rebuild did not verify every tier.', 500, {
      activeCenters,
      inserted,
      validZones,
      completeZoneCenters,
      inactiveZones,
    });
  }

  return {
    inserted,
    activeCenters,
    validZones,
    completeZoneCenters,
    inactiveZones,
  };
}

function buildFallbackBrandLinks(dataset) {
  const posts = dataset.tables.manufacturing_production_signals.rows;
  const mentions = dataset.tables.manufacturing_signal_part_mentions.rows;
  const productsById = buildSourceRowMap(dataset.tables.products.rows, 'product_id');
  const postsById = buildSourceRowMap(posts, 'production_signal_id');
  const orderItems = dataset.tables.manufacturing_work_order_lines.rows;
  const orders = dataset.tables.manufacturing_work_orders.rows;

  const mentionsByPost = new Map();
  for (const mention of mentions) {
    const postKey = normalizeSourceId(mention.production_signal_id);
    const existing = mentionsByPost.get(postKey) || [];
    existing.push(mention);
    mentionsByPost.set(postKey, existing);
  }

  const orderItemsByOrderAndBrand = new Map();
  for (const item of orderItems) {
    const product = productsById.get(normalizeSourceId(item.manufactured_part_id));
    if (!product) continue;
    const key = `${normalizeSourceId(item.work_order_id)}::${normalizeSourceId(product.brand_id)}`;
    const lineValue = (Number(item.requested_units) || 0) * (Number(item.planned_unit_value) || 0);
    orderItemsByOrderAndBrand.set(key, (orderItemsByOrderAndBrand.get(key) || 0) + lineValue);
  }

  const ordersBySocialSource = new Map();
  for (const order of orders) {
    if (!order.production_signal_id) continue;
    const key = normalizeSourceId(order.production_signal_id);
    const existing = ordersBySocialSource.get(key) || [];
    existing.push(order);
    ordersBySocialSource.set(key, existing);
  }

  const groups = new Map();
  for (const post of posts) {
    const influencerId = normalizeSourceId(post.network_account_id);
    if (!influencerId) continue;

    const postMentions = mentionsByPost.get(normalizeSourceId(post.production_signal_id)) || [];
    const brandIds = new Set();
    for (const mention of postMentions) {
      const product = productsById.get(normalizeSourceId(mention.manufactured_part_id));
      if (product?.brand_id) {
        brandIds.add(normalizeSourceId(product.brand_id));
      }
    }

    const engagement = (() => {
      const likes = Number(post.acknowledgement_count) || 0;
      const shares = Number(post.propagation_count) || 0;
      const comments = Number(post.response_count) || 0;
      const views = Number(post.observation_count) || 0;
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

      group.postIds.add(normalizeSourceId(post.production_signal_id));
      group.engagementTotal += engagement;
      group.firstMention = !group.firstMention || post.observed_at < group.firstMention ? post.observed_at : group.firstMention;
      group.lastMention = !group.lastMention || post.observed_at > group.lastMention ? post.observed_at : group.lastMention;

      const attributedOrders = ordersBySocialSource.get(normalizeSourceId(post.production_signal_id)) || [];
      for (const order of attributedOrders) {
        const revenueKey = `${normalizeSourceId(order.work_order_id)}::${brandId}`;
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
  const posts = dataset.tables.manufacturing_production_signals.rows;
  const mentions = dataset.tables.manufacturing_signal_part_mentions.rows;
  const productsById = buildSourceRowMap(dataset.tables.products.rows, 'product_id');
  const influencersById = buildSourceRowMap(influencerRows, 'influencer_id');
  const postsById = buildSourceRowMap(posts, 'production_signal_id');

  const brandsByInfluencer = new Map();
  const activityByInfluencer = new Map();

  for (const mention of mentions) {
    const post = postsById.get(normalizeSourceId(mention.production_signal_id));
    const product = productsById.get(normalizeSourceId(mention.manufactured_part_id));
    if (!post?.network_account_id || !product?.brand_id) continue;

    const influencerId = normalizeSourceId(post.network_account_id);
    const brandId = normalizeSourceId(product.brand_id);

    const brands = brandsByInfluencer.get(influencerId) || new Set();
    brands.add(brandId);
    brandsByInfluencer.set(influencerId, brands);

    const activity = activityByInfluencer.get(influencerId) || { firstSeen: null, lastSeen: null, posts: 0 };
    activity.posts += 1;
    activity.firstSeen = !activity.firstSeen || post.observed_at < activity.firstSeen ? post.observed_at : activity.firstSeen;
    activity.lastSeen = !activity.lastSeen || post.observed_at > activity.lastSeen ? post.observed_at : activity.lastSeen;
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
  const orders = dataset.tables.manufacturing_work_orders.rows;
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
    const customer = customersById.get(normalizeSourceId(order.customer_account_id));
    if (!customer) continue;
    const city = String(customer.city || '').trim();
    const state = String(customer.state_province || '').trim();
    const country = String(customer.country || 'US').trim();
    const key = city && state ? `${city}|${state}|${country}` : `${state || country}|${country}`;
    const group = groups.get(key);
    if (!group) continue;

    group.orderCount += 1;
    if (order.production_signal_id) group.socialOrderCount += 1;
    group.revenue += Number(order.work_order_value) || 0;
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
  const workOrderLines = dataset.tables.manufacturing_work_order_lines.rows;
  const productionSignals = dataset.tables.manufacturing_production_signals.rows;
  const mentions = dataset.tables.manufacturing_signal_part_mentions.rows;
  const productionSignalsById = buildSourceRowMap(productionSignals, 'production_signal_id');

  const metricsByProduct = new Map();
  for (const product of products) {
    metricsByProduct.set(normalizeSourceId(product.product_id), {
      manufacturedPartId: normalizeSourceId(product.product_id),
      orderedQuantity: 0,
      mentionCount: 0,
      totalUrgency: 0,
      productionSignalCount: 0,
    });
  }

  for (const workOrderLine of workOrderLines) {
    const productId = normalizeSourceId(workOrderLine.manufactured_part_id);
    const metrics = metricsByProduct.get(productId);
    if (!metrics) continue;
    metrics.orderedQuantity += Number(workOrderLine.requested_units) || 0;
  }

  for (const mention of mentions) {
    const productId = normalizeSourceId(mention.manufactured_part_id);
    const metrics = metricsByProduct.get(productId);
    const productionSignal = productionSignalsById.get(normalizeSourceId(mention.production_signal_id));
    if (!metrics || !productionSignal) continue;
    metrics.mentionCount += 1;
    metrics.totalUrgency += Number(productionSignal.urgency_score) || 0;
    metrics.productionSignalCount += 1;
  }

  const regions = demandRegionRows.slice(0, Math.min(5, demandRegionRows.length));
  const forecastDate = new Date();
  forecastDate.setHours(0, 0, 0, 0);
  const rows = [];

  for (const metrics of metricsByProduct.values()) {
    const averageUrgency = metrics.productionSignalCount ? metrics.totalUrgency / metrics.productionSignalCount : 0;
    const baseDemand = Math.max(5, Math.round((metrics.orderedQuantity * 1.2) + (metrics.mentionCount * 2) + (averageUrgency / 8)));
    const productionSignalFactor = roundTo(Math.min(3, 1 + (metrics.mentionCount / 10) + (averageUrgency / 100)), 2) || 1;

    for (const region of regions) {
      const regionMultiplier = (Number(region.demandIndex) || 50) / 50;
      const predictedDemand = Math.max(5, Math.round(baseDemand * regionMultiplier));
      rows.push({
        manufacturedPartId: metrics.manufacturedPartId,
        planningRegion: region.regionName,
        forecastDate,
        predictedUnitDemand: predictedDemand,
        lowerConfidenceUnits: Math.max(0, Math.round(predictedDemand * 0.8)),
        upperConfidenceUnits: Math.round(predictedDemand * 1.2),
        productionSignalFactor,
        modelVersion: 'import_fallback_v1',
        forecastExplanation: JSON.stringify({
          source: 'import_fallback_v1',
          orderedQuantity: metrics.orderedQuantity,
          mentionCount: metrics.mentionCount,
          averageUrgency: roundTo(averageUrgency, 2),
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
        :regionName, :regionType, SDO_UTIL.FROM_WKTGEOMETRY(:boundaryWkt, 4326), :population,
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
      INSERT INTO manufacturing_demand_forecasts (
        manufactured_part_id, planning_region, forecast_date, predicted_unit_demand,
        lower_confidence_units, upper_confidence_units, production_signal_factor, model_version,
        forecast_explanation, created_at
      ) VALUES (
        :manufacturedPartId, :planningRegion, :forecastDate, :predictedUnitDemand,
        :lowerConfidenceUnits, :upperConfidenceUnits, :productionSignalFactor, :modelVersion,
        :forecastExplanation, SYSTIMESTAMP
      )
    `, {
      manufacturedPartId: resolveMappedValue(row.manufacturedPartId, 'products', idMaps, 'manufacturing_demand_forecasts', 'manufactured_part_id', 'fallback'),
      planningRegion: row.planningRegion,
      forecastDate: row.forecastDate,
      predictedUnitDemand: row.predictedUnitDemand,
      lowerConfidenceUnits: row.lowerConfidenceUnits,
      upperConfidenceUnits: row.upperConfidenceUnits,
      productionSignalFactor: row.productionSignalFactor,
      modelVersion: row.modelVersion,
      forecastExplanation: row.forecastExplanation,
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
        work_order_id, center_id, carrier, tracking_number, ship_status,
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
  const orders = dataset.tables.manufacturing_work_orders.rows;
  const customersById = buildSourceRowMap(dataset.tables.customers.rows, 'customer_id');
  const centersById = buildSourceRowMap(dataset.tables.fulfillment_centers.rows, 'center_id');
  const routeProviders = ['Line Transfer', 'Supplier Transfer', 'Plant Shuttle', 'Expedite Lane'];
  const shipStatusMap = {
    released: 'preparing',
    in_progress: 'packed',
    dispatched: 'in_transit',
    completed: 'delivered',
    on_hold: 'exception',
  };

  const rows = [];
  for (const order of orders) {
    const orderStatus = String(order.work_order_status_code || 'planned').toLowerCase();
    const centerSourceId = normalizeSourceId(order.assigned_plant_id);
    if (!centerSourceId || ['planned', 'cancelled'].includes(orderStatus)) continue;

    const customer = customersById.get(normalizeSourceId(order.customer_account_id));
    const center = centersById.get(centerSourceId);
    if (!center) continue;

    const shipLat = Number.isFinite(Number(order.destination_latitude)) ? Number(order.destination_latitude) : Number(customer?.latitude);
    const shipLon = Number.isFinite(Number(order.destination_longitude)) ? Number(order.destination_longitude) : Number(customer?.longitude);
    const distanceKm = haversineKm(center.latitude, center.longitude, shipLat, shipLon);
    const estimatedHours = distanceKm == null ? null : roundTo(Math.max(1, distanceKm / 80), 1);
    const createdAt = pickOrderTimestamp(order);
    const shippedAt = createdAt ? new Date(createdAt.getTime() + (6 * 60 * 60 * 1000)) : null;
    const transitHours = estimatedHours == null ? 24 : Math.max(1, estimatedHours);
    const deliveredAt = orderStatus === 'completed' && shippedAt
      ? new Date(shippedAt.getTime() + (transitHours * 60 * 60 * 1000))
      : null;
    const actualOrderId = idMaps.manufacturing_work_orders.get(normalizeSourceId(order.work_order_id));
    const actualCenterId = idMaps.fulfillment_centers.get(centerSourceId);
    if (actualOrderId == null || actualCenterId == null) continue;

    rows.push({
      orderId: actualOrderId,
      centerId: actualCenterId,
      carrier: routeProviders[hashString(order.work_order_id) % routeProviders.length],
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

  if (!dataset.tables.manufacturing_demand_forecasts.provided) {
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
    fallbackSummary.manufacturing_demand_forecasts = await insertFallbackDemandForecasts(connection, forecastRows, idMaps);
    if (!forecastRows.length) warnings.push('No fallback manufacturing_demand_forecasts could be generated.');
  }

  if (!dataset.tables.shipments.provided) {
    if (progress) {
      progress({ status: 'running', progress: 75, message: 'Generating fallback production routes...' });
    }
    const shipmentRows = buildFallbackShipments(dataset, idMaps);
    fallbackSummary.shipments = await insertFallbackShipments(connection, shipmentRows);
    if (!shipmentRows.length) warnings.push('No fallback production routes were generated because the uploaded work orders did not require routing.');
  }

  return fallbackSummary;
}

async function regenerateRequiredVectorArtifacts(connection) {
  const generatedRows = {};

  const productEmbeddings = await execSql(connection, `
    INSERT INTO product_embeddings (product_id, embedding_text, embedding)
    SELECT p.product_id,
           p.product_name || ' ' || NVL(p.category, '') || ' ' || NVL(p.description, '') || ' ' || b.brand_name,
           VECTOR_EMBEDDING(${VECTOR_MODEL_NAME} USING
             p.product_name || ' ' || NVL(p.category, '') || ' ' || NVL(p.description, '') || ' ' || b.brand_name AS DATA)
    FROM products p
    JOIN brands b ON b.brand_id = p.brand_id
  `);
  generatedRows.product_embeddings = Number(productEmbeddings.rowsAffected || 0);

  const postEmbeddings = await execSql(connection, `
    INSERT INTO manufacturing_signal_embeddings (production_signal_id, embedding_text, embedding)
    SELECT sp.production_signal_id,
           SUBSTR(sp.signal_text, 1, 500),
           VECTOR_EMBEDDING(${VECTOR_MODEL_NAME} USING SUBSTR(sp.signal_text, 1, 500) AS DATA)
    FROM manufacturing_production_signals sp
  `);
  generatedRows.manufacturing_signal_embeddings = Number(postEmbeddings.rowsAffected || 0);

  const semanticMatches = await execSql(connection, `
    INSERT INTO manufacturing_signal_part_matches (production_signal_id, manufactured_part_id, similarity_score, match_rank, match_method)
    SELECT production_signal_id, manufactured_part_id, similarity_score, match_rank, 'vector'
    FROM (
      SELECT pe.production_signal_id,
             pre.product_id AS manufactured_part_id,
             ROUND(1 - VECTOR_DISTANCE(pe.embedding, pre.embedding, COSINE), 5) AS similarity_score,
             ROW_NUMBER() OVER (
               PARTITION BY pe.production_signal_id
               ORDER BY VECTOR_DISTANCE(pe.embedding, pre.embedding, COSINE)
             ) AS match_rank
      FROM manufacturing_signal_embeddings pe
      JOIN manufacturing_production_signals sp ON sp.production_signal_id = pe.production_signal_id
      CROSS JOIN product_embeddings pre
      WHERE sp.momentum_code IN ('escalating', 'critical')
    )
    WHERE match_rank <= 3
  `);
  generatedRows.manufacturing_signal_part_matches = Number(semanticMatches.rowsAffected || 0);

  const validationResult = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM products) AS source_product_count,
      (SELECT COUNT(*) FROM manufacturing_production_signals) AS source_post_count,
      (SELECT COUNT(*) FROM manufacturing_production_signals
       WHERE momentum_code IN ('escalating', 'critical')) AS source_match_post_count,
      (SELECT COUNT(*) FROM product_embeddings) AS product_embedding_count,
      (SELECT COUNT(*) FROM product_embeddings WHERE embedding IS NULL) AS null_product_embedding_count,
      (SELECT COUNT(*) FROM manufacturing_signal_embeddings) AS post_embedding_count,
      (SELECT COUNT(*) FROM manufacturing_signal_embeddings WHERE embedding IS NULL) AS null_post_embedding_count,
      (SELECT COUNT(*) FROM manufacturing_signal_part_matches) AS semantic_match_count
    FROM dual
  `);
  const row = validationResult.rows[0] || {};
  const readCount = (name) => Number(row[name] ?? row[name.toLowerCase()] ?? -1);
  const sourceProductCount = readCount('SOURCE_PRODUCT_COUNT');
  const sourcePostCount = readCount('SOURCE_POST_COUNT');
  const sourceMatchPostCount = readCount('SOURCE_MATCH_POST_COUNT');
  const productEmbeddingCount = readCount('PRODUCT_EMBEDDING_COUNT');
  const nullProductEmbeddingCount = readCount('NULL_PRODUCT_EMBEDDING_COUNT');
  const postEmbeddingCount = readCount('POST_EMBEDDING_COUNT');
  const nullPostEmbeddingCount = readCount('NULL_POST_EMBEDDING_COUNT');
  const semanticMatchCount = readCount('SEMANTIC_MATCH_COUNT');
  const expectedSemanticMatchCount = sourceMatchPostCount * Math.min(sourceProductCount, 3);

  if (
    sourceProductCount <= 0 ||
    sourcePostCount <= 0 ||
    productEmbeddingCount !== sourceProductCount ||
    postEmbeddingCount !== sourcePostCount ||
    semanticMatchCount !== expectedSemanticMatchCount ||
    nullProductEmbeddingCount !== 0 ||
    nullPostEmbeddingCount !== 0
  ) {
    throw new ImportError(
      'Required Oracle vector artifacts failed in-transaction validation.',
      500,
      {
        modelName: VECTOR_MODEL_NAME,
        sourceProductCount,
        sourcePostCount,
        sourceMatchPostCount,
        productEmbeddingCount,
        postEmbeddingCount,
        semanticMatchCount,
        expectedSemanticMatchCount,
        nullProductEmbeddingCount,
        nullPostEmbeddingCount,
        generatedRows,
      }
    );
  }

  return {
    required: true,
    status: 'ready',
    modelName: VECTOR_MODEL_NAME,
    transaction: 'same_connection_before_commit',
    sourceCounts: {
      products: sourceProductCount,
      posts: sourcePostCount,
      matchEligiblePosts: sourceMatchPostCount,
    },
    artifactCounts: {
      product_embeddings: productEmbeddingCount,
      manufacturing_signal_embeddings: postEmbeddingCount,
      manufacturing_signal_part_matches: semanticMatchCount,
    },
    generatedRows,
  };
}

async function validateRequiredOmlTrainingPopulation(connection) {
  const result = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM oml_demand_training_v) AS demand_rows,
      (SELECT COUNT(DISTINCT target_surge) FROM oml_demand_training_v) AS demand_classes,
      (SELECT COUNT(*) FROM oml_customer_rfm_v) AS customer_rows,
      (SELECT COUNT(*) FROM oml_revenue_training_v) AS revenue_rows,
      (SELECT COUNT(*) FROM oml_product_cluster_v) AS product_rows
    FROM dual
  `);
  const row = result.rows?.[0] || {};
  const actual = {
    demandRows: Number(row.DEMAND_ROWS ?? row.demand_rows ?? 0),
    demandClasses: Number(row.DEMAND_CLASSES ?? row.demand_classes ?? 0),
    customerRows: Number(row.CUSTOMER_ROWS ?? row.customer_rows ?? 0),
    revenueRows: Number(row.REVENUE_ROWS ?? row.revenue_rows ?? 0),
    productRows: Number(row.PRODUCT_ROWS ?? row.product_rows ?? 0),
  };
  const insufficient = Object.entries(REQUIRED_OML_TRAINING_POPULATION)
    .filter(([key, minimum]) => actual[key] < minimum)
    .map(([key, minimum]) => ({ metric: key, minimum, actual: actual[key] }));

  if (result.rows?.length !== 1 || insufficient.length > 0) {
    throw new ImportError(
      'Dataset cannot train the required Oracle Machine Learning models; no imported data was committed.',
      422,
      {
        required: { ...REQUIRED_OML_TRAINING_POPULATION },
        actual,
        insufficient,
      }
    );
  }

  return {
    required: true,
    status: 'ready',
    transaction: 'same_connection_before_commit',
    requiredPopulation: { ...REQUIRED_OML_TRAINING_POPULATION },
    actualPopulation: actual,
  };
}

async function inspectDateSensitiveOmlRefresh(connection, warnings, datasetSource = null) {
  let modelsBefore = [];
  try {
    const modelsBeforeResult = await execSql(connection, `
      SELECT model_name
      FROM user_mining_models
      WHERE model_name IN (
        'DEMAND_SURGE_MODEL',
        'CUSTOMER_SEGMENT_MODEL',
        'REVENUE_PREDICT_MODEL',
        'PRODUCT_CLUSTER_MODEL'
      )
      ORDER BY model_name
    `);

    modelsBefore = (modelsBeforeResult.rows || [])
      .map((row) => row.MODEL_NAME || row.model_name)
      .filter(Boolean);

    const hookResult = await execSql(connection, `
      SELECT object_name, status
      FROM user_objects
      WHERE object_type = 'PROCEDURE'
        AND object_name = :procedureName
        AND status = 'VALID'
    `, { procedureName: MANUFACTURING_OML_REBUILD_PROCEDURE });

    const hookName = hookResult.rows[0]?.OBJECT_NAME || hookResult.rows[0]?.object_name;
    if (!hookName) {
      const reason = 'The required Manufacturing OML rebuild procedure is not installed and valid.';
      warnings.push(reason);
      return {
        phase: 'release_gate',
        requiredForRelease: true,
        status: 'failed',
        checked: true,
        expectedModels: [...REQUIRED_OML_MODELS],
        modelsBefore,
        rebuilt: [],
        rebuildHook: null,
        skipped: [reason],
      };
    }

    await execSql(connection, `BEGIN ${hookName}; END;`);
    const modelsAfterResult = await execSql(connection, `
      SELECT models.model_name,
             models.creation_date,
             dataset.active_source,
             dataset.active_version,
             dataset.updated_at,
             CASE
               WHEN CAST(models.creation_date AS DATE) >= CAST(dataset.updated_at AS DATE)
               THEN 1 ELSE 0
             END AS is_current
      FROM user_mining_models models
      CROSS JOIN app_dataset_state dataset
      WHERE model_name IN (
        'DEMAND_SURGE_MODEL',
        'CUSTOMER_SEGMENT_MODEL',
        'REVENUE_PREDICT_MODEL',
        'PRODUCT_CLUSTER_MODEL'
      )
        AND dataset.state_id = 1
      ORDER BY models.model_name
    `);
    const modelRows = modelsAfterResult.rows || [];
    const modelsAfter = modelRows.map((row) => row.MODEL_NAME || row.model_name).filter(Boolean);
    const modelSet = new Set(modelsAfter);
    const missingModels = REQUIRED_OML_MODELS.filter((modelName) => !modelSet.has(modelName));
    const staleModels = modelRows
      .filter((row) => Number(row.IS_CURRENT ?? row.is_current ?? 0) !== 1)
      .map((row) => row.MODEL_NAME || row.model_name);
    const activeDatasetSource = String(
      modelRows[0]?.ACTIVE_SOURCE ?? modelRows[0]?.active_source ?? ''
    ).toLowerCase();
    const activeDatasetVersion = String(
      modelRows[0]?.ACTIVE_VERSION ?? modelRows[0]?.active_version ?? ''
    );
    const sourceMismatch = Boolean(datasetSource) && activeDatasetSource !== datasetSource;
    const versionMismatch = activeDatasetVersion !== IMPORT_VERSION;
    const complete = missingModels.length === 0 && staleModels.length === 0 &&
      !sourceMismatch && !versionMismatch;
    const status = complete ? 'rebuilt' : 'incomplete';
    const skipped = complete
      ? []
      : [
        `OML rebuild evidence is incomplete (missing: ${missingModels.join(', ') || 'none'}; ` +
        `stale: ${staleModels.join(', ') || 'none'}; source mismatch: ${sourceMismatch}; ` +
        `version mismatch: ${versionMismatch}).`,
      ];
    if (skipped.length > 0) warnings.push(skipped[0]);

    return {
      phase: 'release_gate',
      requiredForRelease: true,
      status,
      checked: true,
      expectedModels: [...REQUIRED_OML_MODELS],
      modelsBefore,
      rebuilt: modelsAfter,
      missingModels,
      staleModels,
      datasetSource: activeDatasetSource || null,
      datasetVersion: activeDatasetVersion || null,
      datasetUpdatedAt: modelRows[0]?.UPDATED_AT ?? modelRows[0]?.updated_at ?? null,
      rebuildHook: hookName,
      skipped,
    };
  } catch (err) {
    warnings.push(`OML model rebuild or freshness validation failed: ${err.message}`);
    return {
      phase: 'release_gate',
      requiredForRelease: true,
      status: 'failed',
      checked: false,
      expectedModels: [...REQUIRED_OML_MODELS],
      modelsBefore,
      rebuilt: [],
      missingModels: [...REQUIRED_OML_MODELS],
      skipped: [err.message],
    };
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

async function executeImportPlan({
  dataset,
  datasetSource,
  dryRun = false,
  progress = null,
  demoDateRefresh = null,
}) {
  let connection;
  const warnings = [];

  try {
    const db = getDb();
    connection = await db.getConnection();
    await establishGraphAdminContext(connection);
    if (progress) progress({ status: 'running', progress: 6, message: 'Checking Oracle restore prerequisites...' });
    const prerequisites = await inspectRequiredImportPrerequisites(connection);
    const importDataset = dataset;
    let demoDateRefreshMetadata = null;

    if (progress) progress({ status: 'running', progress: 8, message: 'Invalidating graph dataset state...' });
    const graphLifecycle = await invalidateManufacturingGraphState(
      connection,
      prerequisites.graphLifecycle
    );

    if (progress) progress({ status: 'running', progress: 10, message: 'Clearing existing importable data...' });
    await deleteExistingImportData(connection);

    if (progress) progress({ status: 'running', progress: 20, message: 'Loading required and provided optional tables...' });
    const { idMaps, insertedCounts } = await insertProvidedTables(connection, importDataset, progress);

    if (progress) progress({ status: 'running', progress: 55, message: 'Rebuilding spatial point geometry...' });
    const spatialPoints = await rebuildSpatialLocations(connection);

    const fallbackCounts = await applyOptionalFallbacks(connection, importDataset, idMaps, warnings, progress);

    if (progress) progress({ status: 'running', progress: 71, message: 'Validating demand-region geometry with Oracle Spatial...' });
    const spatialRegions = await validateDemandRegionGeometry(connection, {
      requireRows: datasetSource === 'demo',
    });

    if (progress) progress({ status: 'running', progress: 72, message: 'Recomputing route metrics with Oracle Spatial...' });
    const spatialRoutes = await rebuildSpatialRoutes(connection, {
      forceOracleMetrics: datasetSource === 'demo',
    });

    if (demoDateRefresh?.enabled) {
      if (progress) progress({ status: 'running', progress: 78, message: 'Refreshing bundled demo dates to the restore window...' });
      const { targetAnchor, anchorSource } = await resolveDemoRestoreAnchor(connection, demoDateRefresh);
      demoDateRefreshMetadata = await refreshDemoDatesInDatabase(connection, { targetAnchor, anchorSource });
    }

    if (progress) progress({ status: 'running', progress: 80, message: 'Rebuilding fulfillment zones...' });
    const spatialZones = await rebuildFulfillmentZones(connection);
    const zonesCreated = spatialZones.inserted;

    const summary = summarizeCounts(insertedCounts, fallbackCounts, zonesCreated);
    summary.prerequisites = prerequisites;
    summary.spatialLifecycle = {
      status: 'verified',
      transaction: 'same_connection_before_commit',
      points: spatialPoints,
      regions: spatialRegions,
      routes: spatialRoutes,
      zones: spatialZones,
    };
    summary.graphLifecycle = {
      ...graphLifecycle,
      refreshStatus: 'pending',
    };
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

    if (progress) progress({ status: 'running', progress: 85, message: 'Validating Oracle Machine Learning training populations...' });
    const omlTrainingValidation = await validateRequiredOmlTrainingPopulation(connection);
    summary.omlTrainingValidation = omlTrainingValidation;

    if (progress) progress({ status: 'running', progress: 86, message: 'Rebuilding required Oracle vector artifacts...' });
    const vectorLifecycle = await regenerateRequiredVectorArtifacts(connection);
    summary.generated = {
      ...summary.generated,
      ...vectorLifecycle.artifactCounts,
    };
    summary.vectorLifecycle = vectorLifecycle;

    if (progress) progress({ status: 'running', progress: 90, message: 'Persisting active dataset state...' });
    const activeDataset = await persistDatasetStateInTransaction(connection, datasetSource);

    if (progress) progress({ status: 'running', progress: 91, message: 'Persisting demo date anchor metadata...' });
    const demoDateAnchor = await persistDemoDateAnchorInTransaction(
      connection,
      demoDateRefreshMetadata
    );
    summary.demoDateAnchor = demoDateAnchor;

    if (progress) progress({ status: 'running', progress: 94, message: 'Refreshing manufacturing graph in the import transaction...' });
    const graphRefresh = await refreshManufacturingGraphDomainInTransaction(connection, {
      datasetSource,
      lifecycle: prerequisites.graphLifecycle,
    });
    summary.graphLifecycle = {
      ...summary.graphLifecycle,
      ...graphRefresh,
    };

    if (dryRun) {
      await connection.rollback();
      return {
        warnings,
        summary,
        graphLifecycle: summary.graphLifecycle,
        activeDataset: null,
      };
    }

    if (progress) progress({ status: 'running', progress: 96, message: 'Rebuilding and validating OML models before dataset release...' });
    let omlRefresh = await inspectDateSensitiveOmlRefresh(connection, warnings, datasetSource);
    summary.generated = {
      ...summary.generated,
      oml_model_refresh: omlRefresh,
    };
    summary.omlLifecycle = omlRefresh;

    if (omlRefresh.status !== 'rebuilt') {
      try { await connection.rollback(); } catch (_) {}
      throw new ImportError(
        'Dataset release failed because required OML models were not rebuilt and validated for the active dataset.',
        500,
        {
          releaseReady: false,
          activeDataset,
          omlLifecycle: omlRefresh,
        }
      );
    }

    if (progress) progress({ status: 'running', progress: 99, message: 'Committing the dataset after all required Oracle features passed...' });
    try {
      await connection.commit();
    } catch (err) {
      try { await connection.rollback(); } catch (_) {}
      throw new ImportError(
        'Required OML models were rebuilt, but their post-rebuild transaction could not be committed.',
        500,
        {
          releaseReady: false,
          activeDataset,
          omlLifecycle: {
            ...omlRefresh,
            status: 'failed',
            checked: false,
            skipped: [...(omlRefresh.skipped || []), err.message],
          },
        }
      );
    }
    summary.transaction = {
      status: 'committed',
      requiredCommitCount: 1,
      requiredWork: [
        'relational_dataset',
        'spatial_artifacts',
        'vector_artifacts',
        'dataset_state',
        ...(demoDateRefreshMetadata ? ['demo_date_anchor'] : []),
        'manufacturing_graph',
        'oml_models',
      ],
    };

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
      graphLifecycle: summary.graphLifecycle,
      activeDataset: { ...activeDataset, readiness: 'ready' },
    };
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    if (err instanceof ImportError) throw err;
    throw new ImportError(err.message || 'Import failed.', 500);
  } finally {
    if (connection) {
      await releaseGraphAdminConnection(connection);
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

function buildValidationPreviewSummary(parsed) {
  const counts = { ...(parsed.counts || {}) };
  const signalRows = parsed.dataset?.tables?.manufacturing_production_signals?.rows || [];
  const escalatingSignalCount = signalRows.filter((row) => (
    ['escalating', 'critical'].includes(String(row.momentum_code || '').toLowerCase())
  )).length;

  return {
    validationMode: 'non_mutating_preview',
    inserted: counts,
    generated: {
      fulfillment_zones: 'rebuilt during import',
      product_embeddings: counts.products || 0,
      manufacturing_signal_embeddings: counts.manufacturing_production_signals || 0,
      signal_embeddings: counts.manufacturing_production_signals || 0,
      manufacturing_signal_part_matches: escalatingSignalCount * Math.min(counts.products || 0, 3),
    },
    notes: [
      'Validation checks the archive structure, CSV types, unique keys, and cross-table references without modifying live tables.',
      'Restore/import execution rebuilds spatial zones, vector embeddings, semantic matches, and date-sensitive analytics artifacts.',
    ],
  };
}

async function getPersistedOmlReadiness() {
  const db = getDb();
  return db.withUserConnection(GRAPH_ADMIN_CONTEXT_USER, async ({ execute }) => {
    const result = await execute(`
      SELECT COUNT(model.model_name) AS installed_count,
             SUM(
               CASE
                 WHEN CAST(model.creation_date AS DATE) >= CAST(dataset.updated_at AS DATE)
                 THEN 1 ELSE 0
               END
             ) AS current_count,
             dataset.active_source,
             dataset.active_version,
             dataset.updated_at
      FROM app_dataset_state dataset
      LEFT JOIN user_mining_models model
        ON model.model_name IN (
          'DEMAND_SURGE_MODEL',
          'CUSTOMER_SEGMENT_MODEL',
          'REVENUE_PREDICT_MODEL',
          'PRODUCT_CLUSTER_MODEL'
        )
      WHERE dataset.state_id = 1
      GROUP BY dataset.active_source,
               dataset.active_version,
               dataset.updated_at
    `);
    const row = result.rows?.[0] || {};
    const installedCount = Number(row.INSTALLED_COUNT ?? row.installed_count ?? 0);
    const currentCount = Number(row.CURRENT_COUNT ?? row.current_count ?? 0);
    return {
      ready: result.rows?.length === 1 &&
        installedCount === REQUIRED_OML_MODELS.length &&
        currentCount === REQUIRED_OML_MODELS.length,
      requiredModels: [...REQUIRED_OML_MODELS],
      installedCount,
      currentCount,
      datasetSource: String(row.ACTIVE_SOURCE ?? row.active_source ?? '').toLowerCase() || null,
      datasetVersion: row.ACTIVE_VERSION ?? row.active_version ?? null,
      datasetUpdatedAt: row.UPDATED_AT ?? row.updated_at ?? null,
    };
  }, { readOnly: true });
}

async function getActiveDataset() {
  let stored;
  try {
    stored = await getStoredDatasetState();
  } catch (error) {
    const missingStateTable = Number(error.errorNum || 0) === 942 ||
      String(error.code || '').toUpperCase() === 'ORA-00942';
    if (!missingStateTable) throw error;

    return {
      activeDataset: {
        source: 'unavailable',
        label: 'Dataset state unavailable',
        version: null,
        updatedAt: null,
      },
      datasetStatus: 'unavailable',
      activeOperation: getActiveOperation(),
    };
  }

  if (!stored) {
    return {
      activeDataset: {
        source: 'uninitialized',
        label: 'Dataset state uninitialized',
        version: null,
        updatedAt: null,
      },
      datasetStatus: 'uninitialized',
      activeOperation: getActiveOperation(),
    };
  }

  const omlReadiness = await getPersistedOmlReadiness();
  const datasetStatus = omlReadiness.ready ? 'ready' : 'degraded';

  return {
    activeDataset: { ...stored, readiness: datasetStatus },
    datasetStatus,
    omlReadiness,
    activeOperation: getActiveOperation(),
  };
}

async function persistDatasetStateInTransaction(connection, source) {
  const state = buildDatasetState(source);

  await execSql(connection, `
    MERGE INTO app_dataset_state target
    USING (
      SELECT
        1 AS state_id,
        :source AS active_source,
        :label AS active_label,
        :version AS active_version
      FROM dual
    ) incoming
    ON (target.state_id = incoming.state_id)
    WHEN MATCHED THEN UPDATE SET
      target.active_source = incoming.active_source,
      target.active_label = incoming.active_label,
      target.active_version = incoming.active_version,
      target.updated_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT (
      state_id,
      active_source,
      active_label,
      active_version,
      updated_at
    ) VALUES (
      incoming.state_id,
      incoming.active_source,
      incoming.active_label,
      incoming.active_version,
      SYSTIMESTAMP
    )
  `, state);

  const result = await execSql(connection, `
    SELECT active_source, active_label, active_version, updated_at
    FROM app_dataset_state
    WHERE state_id = 1
  `);
  const row = result.rows[0] || {};
  const updatedAt = row.UPDATED_AT ?? row.updated_at ?? null;
  const persisted = {
    source: String(row.ACTIVE_SOURCE ?? row.active_source ?? '').toLowerCase(),
    label: row.ACTIVE_LABEL ?? row.active_label ?? null,
    version: row.ACTIVE_VERSION ?? row.active_version ?? null,
    updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
  };

  if (
    result.rows.length !== 1 ||
    persisted.source !== state.source ||
    persisted.label !== state.label ||
    String(persisted.version || '') !== String(state.version || '')
  ) {
    throw new ImportError(
      'Active dataset metadata could not be persisted with the imported source data.',
      500,
      { expected: state, persisted }
    );
  }

  return persisted;
}

async function runDatasetValidation({ parsed, fileOnly = false, lockKind, lockMessage, executeOptions = {} }) {
  if (!parsed.valid) {
    return formatValidationResult(parsed);
  }

  const previewSummary = buildValidationPreviewSummary(parsed);
  if (executeOptions.requireRuntimeReadiness) {
    previewSummary.restoreReadiness = await getDatasetReplacementReadiness();
    previewSummary.demoDateRefresh = {
      enabled: Boolean(executeOptions.demoDateRefresh?.enabled),
      anchorMode: executeOptions.demoDateRefresh?.configuredAnchorDate ? 'configured' : 'database',
      configuredAnchorDate: dateToIsoDate(executeOptions.demoDateRefresh?.configuredAnchorDate),
    };
  }
  const message = fileOnly
    ? 'Archive structure validation passed.'
    : (executeOptions.requireRuntimeReadiness
      ? 'Restore preview passed. The bundled archive and required in-transaction Oracle runtime objects are ready; the OML release gate runs only during execution. No data was changed.'
      : 'Archive preview passed. Structure and cross-table references were checked without changing live data.');

  return {
    ...formatValidationResult(parsed),
    valid: true,
    isValid: true,
    success: true,
    message,
    warnings: parsed.warnings,
    summary: previewSummary,
  };
}

function createJobProgressHandler(jobId) {
  return (patch) => {
    updateJob(jobId, patch);
    updateOperation({
      jobId,
      progress: patch.progress,
      message: patch.message,
      status: patch.status,
    });
  };
}

function telemetryOperationForJobKind(kind) {
  if (kind === 'restore_demo') return 'restore';
  if (kind === 'upload') return 'upload';
  return 'refresh';
}

function startDatasetJob({ parsed, kind, lockMessage, queuedMessage, startMessage, completeMessage, datasetSource, executeOptions = {} }) {
  const lock = acquireOperationLock(kind, lockMessage);
  const job = createJob({
    operation: kind,
    message: queuedMessage,
    warnings: [...parsed.warnings],
    counts: parsed.counts,
  });

  updateOperation({
    ...lock,
    jobId: job.jobId,
    progress: 0,
    message: queuedMessage,
    status: 'queued',
  });

  setImmediate(async () => {
    try {
      updateJob(job.jobId, {
        status: 'running',
        progress: 5,
        message: startMessage,
      });
      updateOperation({
        jobId: job.jobId,
        progress: 5,
        message: startMessage,
        status: 'running',
      });

      const progress = createJobProgressHandler(job.jobId);
      const result = await executeImportPlan({
        dataset: parsed.dataset,
        datasetSource,
        dryRun: false,
        progress,
        ...executeOptions,
      });

      const warnings = [...result.warnings];
      const activeDataset = result.activeDataset;
      if (!activeDataset) {
        throw new ImportError(
          'Dataset replacement committed without active dataset metadata.',
          500
        );
      }
      await recordDatasetRefresh({
        jobId: job.jobId,
        operation: telemetryOperationForJobKind(kind),
        datasetSource,
        activeDataset,
        summary: result.summary,
      });

      appendJobWarnings(job.jobId, warnings);
      updateJob(job.jobId, {
        status: 'completed',
        progress: 100,
        message: completeMessage,
        summary: result.summary,
        activeDataset,
      });
    } catch (err) {
      updateJob(job.jobId, {
        status: 'failed',
        progress: 100,
        message: err.message || 'Import failed.',
        errors: [err.message || 'Import failed.'],
        details: err.details || undefined,
      });
    } finally {
      endOperation();
    }
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
    fileName: `manufacturing-operations-import-template-${version}.zip`,
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
    executeOptions: {
      demoDateRefresh,
      requireRuntimeReadiness: true,
    },
  });
}

async function startDemoRestore({ body = {}, query = {}, headers = {}, version = IMPORT_VERSION } = {}) {
  const demoDataset = getBundledDemoDataset(version);
  const demoDateRefresh = buildDemoDateRefreshOptions({ body, query, headers });
  return startDatasetJob({
    parsed: demoDataset.parsed,
    kind: 'restore_demo',
    lockMessage: 'Restoring the bundled demo dataset...',
    queuedMessage: 'Demo restore started.',
    startMessage: 'Restoring bundled demo dataset...',
    completeMessage: 'Demo dataset restored successfully.',
    datasetSource: 'demo',
    executeOptions: { demoDateRefresh },
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
    buildDemoDateRefreshSqlPlan,
    buildDemoDateRefreshOptions,
    findDemoSeedAnchor,
    findDatabaseDemoSeedAnchor,
    getBundledDemoDataset,
    getDatasetReplacementReadiness,
    getDateColumnEntries,
    inspectRequiredImportPrerequisites,
    inspectDateSensitiveOmlRefresh,
    parseArchiveDataset,
    parseDemoAnchorDate,
    persistDemoDateAnchorInTransaction,
    refreshManufacturingGraphDomainInTransaction,
    regenerateRequiredVectorArtifacts,
    reanchorDemoDates,
    refreshDemoDatesInDatabase,
    validateOrderPlantConsistency,
  },
};
