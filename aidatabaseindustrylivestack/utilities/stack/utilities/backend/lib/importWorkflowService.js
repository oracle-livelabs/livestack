const AdmZip = require('adm-zip');
const { parse: parseCsvSync } = require('csv-parse/sync');
const db = require('../config/database');
const {
  IMPORT_VERSION,
  TABLE_BY_NAME,
  INSERT_ORDER,
  DELETE_ORDER,
  TABLES,
  buildManifest,
  getTableAcceptedCsvFileNames,
  getTableCsvFileName,
} = require('./importCatalog');
const {
  admitDatasetJob,
  claimDatasetJob,
  updateJob,
  appendJobWarnings,
  getJob,
  completeDatasetJobTransaction,
  finalizeGenerationRecovery,
  finalizeInterruptedWithoutSnapshot,
  releaseStartupLease,
} = require('./importJobs');
const { getBundledDemoArchive } = require('./demoDatasetBundle');
const { getStoredDatasetState, saveDatasetState } = require('./datasetStateStore');
const {
  REQUIRED_OML_MODELS,
  REQUIRED_DUALITY_VIEWS,
  REQUIRED_SPATIAL_INDEXES,
  assertRequiredFeatureEvidence,
  stageGenerationSnapshotOnConnection,
  markGenerationApplyingOnConnection,
  markGenerationReadyOnConnection,
  getGeneration,
  markGenerationRecovering,
  loadStartupLifecycleState,
  planAllStartupReconciliations,
  cleanupGenerationSnapshot,
} = require('./datasetGenerationStore');
const { recordDatasetRefresh, recordRestoreTelemetry } = require('./usageCounterService');
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
  beginDatasetServingTransition,
  associateDatasetServingTransition,
  endDatasetServingTransition,
  waitForDatasetReadersToDrain,
} = require('./datasetServingFence');

let ollamaAssistant = null;
try {
  // Optional: only used to flush Ask Data schema/entity caches after import.
  ollamaAssistant = require('./ollamaAssistant');
} catch (_) {
  ollamaAssistant = null;
}

const MAX_ARCHIVE_SIZE_BYTES = 25 * 1024 * 1024;
const VECTOR_MODEL_NAME = 'ALL_MINILM_L12_V2';
const INSERT_SQL_CACHE = new Map();
const DEMO_DATE_ANCHOR_TABLE = 'APP_DEMO_DATE_ANCHOR';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const OPTIONAL_DEMO_DATE_REFRESH_COLUMNS = [
  { tableName: 'utility_graph_entities', columnName: 'created_at', type: 'timestamp' },
  { tableName: 'utility_graph_relationships', columnName: 'first_seen', type: 'timestamp' },
  { tableName: 'utility_graph_relationships', columnName: 'last_interaction', type: 'timestamp' },
  { tableName: 'restoration_cases', columnName: 'created_at', type: 'timestamp' },
];
const PROTECTED_ROLLBACK_TABLES = Object.freeze([
  'products',
  'fulfillment_centers',
  'customers',
  'influencers',
  'social_posts',
  'orders',
]);
let cachedBundledDemoDataset = null;

class ImportError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'ImportError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function requiredInitiatingActor(value) {
  const actor = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(actor)) {
    throw new ImportError('A persisted initiating dataset-admin actor is required for lifecycle work.', 500);
  }
  return actor;
}

async function resolvePersistedDatasetAdminActor(persistedActor) {
  const actor = requiredInitiatingActor(persistedActor);
  const resolved = await db.resolveDatasetAdminActor(actor);
  if (resolved !== actor) {
    throw new ImportError(
      `Persisted dataset lifecycle actor "${actor}" is not an active dataset administrator.`,
      503
    );
  }
  return actor;
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

function parseJsonValue(value, fallback) {
  try {
    return value ? JSON.parse(String(value)) : fallback;
  } catch (_) {
    return fallback;
  }
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
    '# Energy # Utilities Import Template Utilities Import Template',
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
    '- Domain labels use the original schema names for compatibility: brands are manufacturers, products are utility operations, influencers are signal sources, and social_posts are regulatory or supply bulletins.',
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

async function acquireOperationLock(kind, message) {
  const acquired = await beginOperation({
    kind,
    message,
    progress: 0,
    status: 'running',
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
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
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

  for (const table of TABLES) {
    const acceptedNames = getTableAcceptedCsvFileNames(table)
      .map((fileName) => normalizeZipBaseName(fileName));
    const matchingEntries = acceptedNames
      .filter((fileName) => files.has(fileName))
      .map((fileName) => files.get(fileName));
    const canonicalFileName = getTableCsvFileName(table);

    if (matchingEntries.length > 1) {
      errors.push(
        `ZIP contains multiple accepted files for "${table.name}": ${matchingEntries
          .map((entry) => normalizeZipBaseName(entry.entryName))
          .join(', ')}. Keep only one.`
      );
    }

    const entry = matchingEntries[0];
    if (!entry) {
      if (table.required) {
        errors.push(`ZIP is missing required file "${canonicalFileName}".`);
      } else {
        warnings.push(`Optional file "${canonicalFileName}" is missing. The importer will regenerate fallback data.`);
      }
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

async function ensureDemoDateAnchorTable(connection) {
  const exists = await execSql(connection, `
    SELECT COUNT(*) AS cnt
    FROM user_tables
    WHERE table_name = :tableName
  `, { tableName: DEMO_DATE_ANCHOR_TABLE });

  if (Number(exists.rows[0]?.CNT || exists.rows[0]?.cnt || 0) > 0) {
    return;
  }

  await execSql(connection, `
    CREATE TABLE app_demo_date_anchor (
      anchor_id NUMBER(1) PRIMARY KEY
        CHECK (anchor_id = 1),
      anchor_source VARCHAR2(30) NOT NULL,
      anchor_strategy VARCHAR2(80) NOT NULL,
      original_seed_anchor TIMESTAMP,
      restore_anchor TIMESTAMP NOT NULL,
      offset_days NUMBER(12,4) DEFAULT 0 NOT NULL,
      offset_seconds NUMBER(18,3) DEFAULT 0 NOT NULL,
      shifted_table_count NUMBER DEFAULT 0 NOT NULL,
      shifted_column_count NUMBER DEFAULT 0 NOT NULL,
      shifted_value_count NUMBER DEFAULT 0 NOT NULL,
      shifted_columns_json CLOB,
      refreshed_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )
  `);
}

async function persistDemoDateAnchor(connection, metadata, warnings) {
  if (!metadata) return null;

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
    // Operational/audit history is not part of a replaceable dataset
    // generation and must survive both Restore and rollback replay.
    if (tableName === 'agent_actions' || tableName === 'event_stream') continue;
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
  const carriers = ['GridLine', 'Critical Infrastructure Courier', 'SafeTemp', 'Operational Express'];
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
    if (!generatedDemandRegions.length) warnings.push('No fallback demand_regions could be generated because service point geospatial data was missing.');
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

async function regenerateVectorArtifacts(connection) {
  const summary = {};

  const productEmbeddings = await execSql(connection, `
    INSERT INTO product_embeddings (product_id, embedding_text, embedding)
    SELECT p.product_id,
           p.product_name || ' ' || NVL(p.category, '') || ' ' || NVL(p.description, '') || ' ' || b.brand_name,
           VECTOR_EMBEDDING(${VECTOR_MODEL_NAME} USING
             p.product_name || ' ' || NVL(p.category, '') || ' ' || NVL(p.description, '') || ' ' || b.brand_name AS DATA)
    FROM products p
    JOIN brands b ON b.brand_id = p.brand_id
  `);
  summary.product_embeddings = productEmbeddings.rowsAffected || 0;

  const postEmbeddings = await execSql(connection, `
    INSERT INTO post_embeddings (post_id, embedding_text, embedding)
    SELECT sp.post_id,
           SUBSTR(sp.post_text, 1, 500),
           VECTOR_EMBEDDING(${VECTOR_MODEL_NAME} USING SUBSTR(sp.post_text, 1, 500) AS DATA)
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
               ORDER BY VECTOR_DISTANCE(pe.embedding, pre.embedding, COSINE)
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

async function inspectDateSensitiveOmlRefresh(connection) {
  const hookResult = await execSql(connection, `
    SELECT object_name
    FROM user_objects
    WHERE object_type = 'PROCEDURE'
      AND object_name = 'REBUILD_UTILITIES_OML_MODELS'
      AND status = 'VALID'
  `);
  if (!(hookResult.rows || []).length) {
    throw new ImportError(
      'Required OML rebuild procedure REBUILD_UTILITIES_OML_MODELS is missing or invalid.',
      500
    );
  }

  // DBMS_DATA_MINING model replacement performs DDL and may commit.  The
  // generation journal is already APPLYING before this call, so a process
  // stop at any model boundary is recovered from the durable prior snapshot.
  await execSql(connection, 'BEGIN REBUILD_UTILITIES_OML_MODELS; END;');

  const modelResult = await execSql(connection, `
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
  const models = (modelResult.rows || [])
    .map((row) => String(row.MODEL_NAME || row.model_name || '').toUpperCase())
    .filter(Boolean);
  if (
    models.length !== REQUIRED_OML_MODELS.length ||
    REQUIRED_OML_MODELS.some((modelName) => !models.includes(modelName))
  ) {
    throw new ImportError('Required Utilities OML model rebuild did not produce all four exact models.', 500, { models });
  }

  return {
    checked: true,
    ready: true,
    models,
    rebuilt: models,
    rebuildHook: 'REBUILD_UTILITIES_OML_MODELS',
  };
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

function serializeRollbackValue(column, value) {
  if (value == null) return null;
  if (column.type === 'source_id_list') {
    return String(value).split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

function assertProtectedRollbackRows(tables) {
  for (const tableName of PROTECTED_ROLLBACK_TABLES) {
    const rows = tables?.[tableName]?.rows;
    if (!Array.isArray(rows) || rows.length <= 0) {
      throw new ImportError(
        `Rollback snapshot did not capture protected nonzero table ${tableName}; VPD context may be absent or incomplete.`,
        500
      );
    }
  }
  return tables;
}

async function captureRollbackDataset(connection) {
  // Each table is read at one SCN so the durable rollback dataset cannot mix
  // business writes committed between sequential SELECT statements.
  const scnResult = await execSql(connection, 'SELECT TIMESTAMP_TO_SCN(SYSTIMESTAMP) AS snapshot_scn FROM dual');
  const snapshotScn = Number(scnResult.rows[0]?.SNAPSHOT_SCN || scnResult.rows[0]?.snapshot_scn);
  if (!Number.isFinite(snapshotScn)) {
    throw new ImportError('Could not capture a consistent Oracle SCN for the prior dataset generation.', 500);
  }

  const tables = {};
  for (const table of TABLES) {
    const selectList = table.columns.map((column) => {
      if (table.name === 'demand_regions' && column.name === 'boundary') {
        return `SDO_UTIL.TO_WKTGEOMETRY(boundary) AS boundary`;
      }
      return column.name;
    }).join(', ');
    const result = await execSql(
      connection,
      `SELECT ${selectList} FROM ${table.name} AS OF SCN :snapshotScn ORDER BY ${table.pk}`,
      { snapshotScn }
    );
    const rows = (result.rows || []).map((sourceRow, index) => {
      const row = { __lineNumber: index + 2 };
      for (const column of table.columns) {
        row[column.name] = serializeRollbackValue(column, sourceRow[column.name.toUpperCase()]);
      }
      row.__sourceId = normalizeSourceId(row[table.pk]);
      return row;
    });
    tables[table.name] = {
      provided: true,
      rows,
      sourceIds: rows.map((row) => row.__sourceId),
    };
  }
  assertProtectedRollbackRows(tables);

  const anchorResult = await execSql(connection, `
    SELECT anchor_source, anchor_strategy, original_seed_anchor, restore_anchor,
           offset_days, offset_seconds, shifted_table_count, shifted_column_count,
           shifted_value_count, shifted_columns_json
    FROM app_demo_date_anchor AS OF SCN :snapshotScn
    WHERE anchor_id = 1
  `, { snapshotScn });
  const anchorRow = anchorResult.rows[0] || null;
  const demoDateAnchor = anchorRow ? {
    anchorSource: anchorRow.ANCHOR_SOURCE,
    anchorStrategy: anchorRow.ANCHOR_STRATEGY,
    originalSeedAnchor: anchorRow.ORIGINAL_SEED_ANCHOR instanceof Date
      ? anchorRow.ORIGINAL_SEED_ANCHOR.toISOString()
      : anchorRow.ORIGINAL_SEED_ANCHOR,
    restoreAnchor: anchorRow.RESTORE_ANCHOR instanceof Date
      ? anchorRow.RESTORE_ANCHOR.toISOString()
      : anchorRow.RESTORE_ANCHOR,
    offsetDays: Number(anchorRow.OFFSET_DAYS || 0),
    offsetSeconds: Number(anchorRow.OFFSET_SECONDS || 0),
    shiftedTableCount: Number(anchorRow.SHIFTED_TABLE_COUNT || 0),
    shiftedColumnCount: Number(anchorRow.SHIFTED_COLUMN_COUNT || 0),
    shiftedValueCount: Number(anchorRow.SHIFTED_VALUE_COUNT || 0),
    shiftedColumns: parseJsonValue(anchorRow.SHIFTED_COLUMNS_JSON, {}),
  } : null;

  return {
    format: 'utilities-generation-rollback',
    version: IMPORT_VERSION,
    capturedScn: snapshotScn,
    capturedAt: new Date().toISOString(),
    tables,
    metadata: { demoDateAnchor },
  };
}

function rehydrateRollbackDataset(snapshot) {
  if (!snapshot || snapshot.format !== 'utilities-generation-rollback' || !snapshot.tables) {
    throw new ImportError('Generation rollback journal does not contain a valid prior dataset snapshot.', 500);
  }
  const tables = {};
  for (const table of TABLES) {
    const snapshotTable = snapshot.tables[table.name];
    if (!snapshotTable || !Array.isArray(snapshotTable.rows)) {
      throw new ImportError(`Generation rollback journal is missing ${table.name}.`, 500);
    }
    const rows = snapshotTable.rows.map((sourceRow, index) => {
      const row = { __lineNumber: index + 2 };
      for (const column of table.columns) {
        const value = sourceRow[column.name];
        if (value == null) {
          row[column.name] = null;
        } else if (column.type === 'date' || column.type === 'timestamp') {
          const parsedDate = new Date(value);
          if (Number.isNaN(parsedDate.getTime())) {
            throw new ImportError(`Generation rollback journal has an invalid ${table.name}.${column.name} date.`, 500);
          }
          row[column.name] = parsedDate;
        } else if (column.type === 'source_id_list') {
          row[column.name] = Array.isArray(value)
            ? value.map(normalizeSourceId).filter(Boolean)
            : String(value).split(',').map(normalizeSourceId).filter(Boolean);
        } else {
          row[column.name] = value;
        }
      }
      row.__sourceId = normalizeSourceId(row[table.pk]);
      return row;
    });
    tables[table.name] = {
      provided: true,
      rows,
      sourceIds: new Set(rows.map((row) => row.__sourceId)),
    };
  }
  assertProtectedRollbackRows(tables);
  return {
    tables,
    generationMetadata: snapshot.metadata || { demoDateAnchor: null },
  };
}

async function restoreDemoDateAnchorSnapshot(connection, metadata) {
  const anchor = metadata?.demoDateAnchor || null;
  if (!anchor) {
    await execSql(connection, 'DELETE FROM app_demo_date_anchor WHERE anchor_id = 1');
    return null;
  }
  const normalized = {
    ...anchor,
    originalSeedAnchor: anchor.originalSeedAnchor ? new Date(anchor.originalSeedAnchor) : null,
    restoreAnchor: anchor.restoreAnchor ? new Date(anchor.restoreAnchor) : null,
  };
  if (!normalized.restoreAnchor || Number.isNaN(normalized.restoreAnchor.getTime())) {
    throw new ImportError('Generation rollback journal has an invalid demo restore anchor.', 500);
  }
  return persistDemoDateAnchor(connection, normalized, []);
}

async function rebuildNativeJsonArtifacts(connection) {
  await execSql(connection, 'DELETE FROM product_attributes');
  await execSql(connection, `
    INSERT INTO product_attributes (product_id, attributes)
    SELECT p.product_id,
           JSON_OBJECT(
             KEY 'sku' VALUE p.sku,
             KEY 'category' VALUE p.category,
             KEY 'subcategory' VALUE p.subcategory,
             KEY 'active' VALUE p.is_active
             RETURNING JSON
           )
    FROM products p
  `);
}

function generationExpectedCounts(dataset) {
  const rows = (tableName) => dataset?.tables?.[tableName]?.rows || [];
  const spatialPoints = [...rows('fulfillment_centers'), ...rows('customers')]
    .filter((row) => row.latitude != null && row.longitude != null)
    .length;
  return {
    products: rows('products').length,
    socialPosts: rows('social_posts').length,
    spatialPoints,
    serviceRequests: rows('orders').length,
    productInventory: rows('products').length,
  };
}

async function proveRequiredGenerationFeatures(
  connection,
  omlRefresh,
  { generationId, expectedCounts }
) {
  const proofGenerationId = String(generationId || '').trim();
  const vectorResult = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM products) AS product_count,
      (SELECT COUNT(*) FROM product_embeddings WHERE embedding IS NOT NULL) AS product_embeddings,
      (SELECT COUNT(*) FROM social_posts) AS post_count,
      (SELECT COUNT(*) FROM post_embeddings WHERE embedding IS NOT NULL) AS post_embeddings,
      (SELECT COUNT(*) FROM user_mining_models WHERE model_name = :modelName) AS model_count
    FROM dual
  `, { modelName: VECTOR_MODEL_NAME });
  const vectorRow = vectorResult.rows[0] || {};
  const productCount = Number(vectorRow.PRODUCT_COUNT || 0);
  const productEmbeddings = Number(vectorRow.PRODUCT_EMBEDDINGS || 0);
  const postCount = Number(vectorRow.POST_COUNT || 0);
  const postEmbeddings = Number(vectorRow.POST_EMBEDDINGS || 0);
  const vector = {
    ready:
      Number(vectorRow.MODEL_COUNT || 0) === 1 &&
      productCount > 0 &&
      postCount > 0 &&
      productEmbeddings === productCount &&
      postEmbeddings === postCount,
    generationId: proofGenerationId,
    model: VECTOR_MODEL_NAME,
    productCount,
    productEmbeddings,
    postCount,
    postEmbeddings,
  };

  const jsonResult = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM products) AS product_count,
      (SELECT COUNT(*) FROM product_attributes) AS json_rows,
      (
        SELECT COUNT(*)
        FROM product_attributes
        WHERE JSON_VALUE(attributes, '$.sku' RETURNING VARCHAR2(100)) IS NOT NULL
      ) AS executed_rows
    FROM dual
  `);
  const jsonRow = jsonResult.rows[0] || {};
  const nativeJson = {
    ready:
      Number(jsonRow.JSON_ROWS || 0) > 0 &&
      Number(jsonRow.JSON_ROWS || 0) === Number(jsonRow.PRODUCT_COUNT || 0) &&
      Number(jsonRow.EXECUTED_ROWS || 0) === Number(jsonRow.JSON_ROWS || 0),
    generationId: proofGenerationId,
    object: 'PRODUCT_ATTRIBUTES',
    productCount: Number(jsonRow.PRODUCT_COUNT || 0),
    jsonRows: Number(jsonRow.JSON_ROWS || 0),
    executedRows: Number(jsonRow.EXECUTED_ROWS || 0),
  };

  const spatialResult = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM fulfillment_centers WHERE latitude IS NOT NULL AND longitude IS NOT NULL) +
      (SELECT COUNT(*) FROM customers WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS expected_points,
      (SELECT COUNT(*) FROM fulfillment_centers WHERE location IS NOT NULL) +
      (SELECT COUNT(*) FROM customers WHERE location IS NOT NULL) AS point_rows
    FROM dual
  `);
  const spatialIndexResult = await execSql(connection, `
    SELECT index_name
    FROM user_indexes
    WHERE index_name IN ('IDX_FC_SPATIAL', 'IDX_CUST_SPATIAL')
      AND status = 'VALID'
    ORDER BY index_name
  `);
  const spatialRow = spatialResult.rows[0] || {};
  const spatialIndexes = (spatialIndexResult.rows || []).map((row) => String(row.INDEX_NAME || '').toUpperCase());
  const spatial = {
    ready:
      Number(spatialRow.POINT_ROWS || 0) > 0 &&
      Number(spatialRow.POINT_ROWS || 0) === Number(spatialRow.EXPECTED_POINTS || 0) &&
      REQUIRED_SPATIAL_INDEXES.every((indexName) => spatialIndexes.includes(indexName)),
    generationId: proofGenerationId,
    pointRows: Number(spatialRow.POINT_ROWS || 0),
    expectedPoints: Number(spatialRow.EXPECTED_POINTS || 0),
    spatialIndexes,
  };

  const graphObjectResult = await execSql(connection, `
    SELECT graph_name
    FROM user_property_graphs
    WHERE graph_name = 'SERVICE_RESTORATION_NETWORK'
  `);
  const graphNames = (graphObjectResult.rows || []).map((row) => String(row.GRAPH_NAME || '').toUpperCase());
  const graphCountResult = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM utility_graph_entities) AS vertices,
      (SELECT COUNT(*) FROM utility_graph_relationships) AS edges
    FROM dual
  `);
  const graphProbeResult = await execSql(connection, `
    SELECT COUNT(*) AS probe_rows
    FROM GRAPH_TABLE (service_restoration_network
      MATCH (a IS utility_entity) -[e IS restoration_link]-> (b IS utility_entity)
      COLUMNS (a.entity_id AS source_id, b.entity_id AS target_id))
  `);
  const graphRow = graphCountResult.rows[0] || {};
  const graphProbeRow = graphProbeResult.rows[0] || {};
  const graphName = graphNames.length === 1 && graphNames[0] === 'SERVICE_RESTORATION_NETWORK'
    ? 'SERVICE_RESTORATION_NETWORK'
    : null;
  const graphVertices = Number(graphRow.VERTICES || 0);
  const graphEdges = Number(graphRow.EDGES || 0);
  const graphProbeRows = Number(graphProbeRow.PROBE_ROWS || 0);
  const graph = {
    ready: Boolean(graphName) && graphVertices > 0 && graphEdges > 0 && graphProbeRows > 0,
    generationId: proofGenerationId,
    graph: graphName,
    availableGraphs: graphNames,
    vertices: graphVertices,
    edges: graphEdges,
    probeRows: graphProbeRows,
  };

  const dualityObjectResult = await execSql(connection, `
    SELECT object_name
    FROM user_objects
    WHERE object_name IN ('UTILITY_SERVICE_REQUESTS_DV', 'PRODUCTS_INVENTORY_DV')
      AND status = 'VALID'
    ORDER BY object_name
  `);
  const dualityViews = (dualityObjectResult.rows || []).map((row) => String(row.OBJECT_NAME || '').toUpperCase());
  const dualityCountResult = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM utility_service_requests_dv) AS request_rows,
      (SELECT COUNT(*) FROM products_inventory_dv) AS product_rows
    FROM dual
  `);
  const dualityRow = dualityCountResult.rows[0] || {};
  const duality = {
    ready:
      REQUIRED_DUALITY_VIEWS.every((viewName) => dualityViews.includes(viewName)) &&
      Number(dualityRow.REQUEST_ROWS || 0) > 0 &&
      Number(dualityRow.PRODUCT_ROWS || 0) > 0,
    generationId: proofGenerationId,
    views: dualityViews,
    requestRows: Number(dualityRow.REQUEST_ROWS || 0),
    productRows: Number(dualityRow.PRODUCT_ROWS || 0),
  };

  return {
    generationId: proofGenerationId,
    expectedCounts,
    vector,
    oml: {
      ready: omlRefresh?.ready === true,
      generationId: proofGenerationId,
      models: omlRefresh?.models || [],
      rebuildHook: omlRefresh?.rebuildHook || null,
    },
    nativeJson,
    spatial,
    graph,
    duality,
  };
}

async function rebuildAndProveRequiredGenerationFeatures(
  connection,
  { generationId, dataset, progress = null }
) {
  const vectorAvailable = await isVectorModelAvailable(connection);
  if (!vectorAvailable) {
    throw new ImportError(`Required Oracle embedding model ${VECTOR_MODEL_NAME} is not available.`, 500);
  }

  if (progress) await progress({ status: 'running', progress: 88, message: 'Rebuilding required native JSON artifacts...' });
  await rebuildNativeJsonArtifacts(connection);

  if (progress) await progress({ status: 'running', progress: 91, message: 'Rebuilding required Vector artifacts...' });
  const vectorSummary = await regenerateVectorArtifacts(connection);

  // Make base, Spatial, native JSON, and Vector DML durable before OML DDL.
  // The APPLYING journal + prior snapshot makes this boundary recoverable.
  await connection.commit();

  if (progress) await progress({ status: 'running', progress: 94, message: 'Rebuilding four required OML models...' });
  const omlRefresh = await inspectDateSensitiveOmlRefresh(connection);

  if (progress) await progress({ status: 'running', progress: 97, message: 'Proving required Vector, OML, JSON, Spatial, Graph, and Duality readiness...' });
  const expectedCounts = generationExpectedCounts(dataset);
  const evidence = await proveRequiredGenerationFeatures(connection, omlRefresh, {
    generationId,
    expectedCounts,
  });
  assertRequiredFeatureEvidence(evidence, { generationId });

  return {
    evidence,
    generated: {
      ...vectorSummary,
      oml_model_refresh: omlRefresh,
      native_json_rows: evidence.nativeJson.jsonRows,
    },
  };
}

async function executeImportPlan({
  dataset,
  dryRun = false,
  progress = null,
  demoDateRefresh = null,
  generationId = null,
  recoveryMode = false,
  initiatingActor,
}) {
  const actor = requiredInitiatingActor(initiatingActor);
  return db.withActorConnection(actor, async (connection) => {
    const warnings = [];
    try {
    const importDataset = dataset;
    let demoDateRefreshMetadata = null;

    if (!dryRun && !generationId) {
      throw new ImportError('A durable generation ID is required for destructive dataset apply.', 500);
    }

    if (!dryRun && !recoveryMode) {
      if (progress) await progress({ status: 'running', progress: 7, message: 'Capturing the prior active generation rollback journal...' });
      const rollbackDataset = await captureRollbackDataset(connection);
      await stageGenerationSnapshotOnConnection(connection, generationId, rollbackDataset);
      await markGenerationApplyingOnConnection(connection, generationId);
    }

    if (progress) await progress({ status: 'running', progress: 10, message: recoveryMode ? 'Restoring prior generation base data...' : 'Clearing existing importable data...' });
    await deleteExistingImportData(connection);

    if (progress) await progress({ status: 'running', progress: 20, message: 'Loading required and provided optional tables...' });
    const { idMaps, insertedCounts } = await insertProvidedTables(connection, importDataset, progress);

    if (progress) await progress({ status: 'running', progress: 55, message: 'Rebuilding spatial point geometry...' });
    await rebuildSpatialLocations(connection);

    const fallbackCounts = await applyOptionalFallbacks(connection, importDataset, idMaps, warnings, progress);

    if (demoDateRefresh?.enabled) {
      if (progress) await progress({ status: 'running', progress: 78, message: 'Refreshing bundled demo dates to the restore window...' });
      const { targetAnchor, anchorSource } = await resolveDemoRestoreAnchor(connection, demoDateRefresh);
      demoDateRefreshMetadata = await refreshDemoDatesInDatabase(connection, { targetAnchor, anchorSource });
    } else if (recoveryMode) {
      await restoreDemoDateAnchorSnapshot(connection, importDataset.generationMetadata);
    }

    if (progress) await progress({ status: 'running', progress: 80, message: 'Rebuilding fulfillment zones...' });
    const zonesCreated = await rebuildFulfillmentZones(connection);

    const summary = summarizeCounts(insertedCounts, fallbackCounts, zonesCreated);
    if (demoDateRefreshMetadata) {
      summary.demoDateRefresh = formatDemoDateRefresh(demoDateRefreshMetadata);
    }

    if (demoDateRefreshMetadata) {
      if (progress) await progress({ status: 'running', progress: 84, message: 'Validating refreshed demo date windows...' });
      const demoDateValidation = await runDemoDateValidation(connection);
      summary.demoDateValidation = summarizeDemoDateValidation(demoDateValidation);
      if (!demoDateValidation.passed) {
        throw new ImportError('Demo date validation failed after date refresh.', 500, summary.demoDateValidation);
      }
    }

    if (dryRun) {
      await connection.rollback();
      return {
        warnings,
        summary,
      };
    }

    await persistDemoDateAnchor(connection, demoDateRefreshMetadata, warnings);
    const featureResult = await rebuildAndProveRequiredGenerationFeatures(connection, {
      generationId,
      dataset: importDataset,
      progress,
    });
    summary.generated = {
      ...summary.generated,
      ...featureResult.generated,
    };
    summary.requiredFeatures = featureResult.evidence;
    await markGenerationReadyOnConnection(connection, generationId, featureResult.evidence);

    if (typeof ollamaAssistant?.invalidateMetadataCaches === 'function') {
      try {
        if (progress) await progress({ status: 'running', progress: 99, message: 'Refreshing application metadata caches...' });
        ollamaAssistant.invalidateMetadataCaches();
      } catch (_) {
        // Cache invalidation is process-local and does not affect generation readiness.
      }
    }

    return {
      warnings,
      summary,
      requiredFeatures: featureResult.evidence,
    };
    } catch (err) {
      try { await connection.rollback(); } catch (_) {}
      if (err instanceof ImportError) throw err;
      throw new ImportError(err.message || 'Import failed.', 500);
    }
  });
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
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

async function getActiveDataset() {
  let stored = await getStoredDatasetState();
  if (!stored) {
    stored = await saveDatasetState(await inferCurrentDatasetState());
  }

  return {
    activeDataset: stored,
    activeOperation: await getActiveOperation(),
  };
}

async function persistDatasetState(source, warnings) {
  try {
    return await saveDatasetState(buildDatasetState(source));
  } catch (err) {
    warnings.push(`Active dataset metadata could not be updated: ${err.message}`);
    return null;
  }
}

async function runDatasetValidation({
  parsed,
  fileOnly = false,
  lockKind,
  lockMessage,
  initiatingActor,
  executeOptions = {},
}) {
  if (!parsed.valid) {
    return formatValidationResult(parsed);
  }

  if (fileOnly) {
    return {
      ...formatValidationResult(parsed),
      message: 'Archive structure validation passed.',
    };
  }

  const lock = await acquireOperationLock(lockKind, lockMessage);
  try {
    const dryRun = await executeImportPlan({
      dataset: parsed.dataset,
      dryRun: true,
      initiatingActor,
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
    await endOperation({ leaseToken: lock.leaseToken });
  }
}

function createJobProgressHandler(jobId, leaseToken) {
  return async (patch) => {
    // Both writes are fenced by the durable lease heartbeat.  A stale worker
    // cannot silently keep the singleton operation alive after restart.
    const [, operation] = await Promise.all([
      updateJob(jobId, patch),
      updateOperation({
      leaseToken,
      jobId,
      progress: patch.progress,
      message: patch.message,
      status: patch.status,
      }),
    ]);
    if (!operation) throw new ImportError('Dataset worker lease was lost; restore was stopped safely.', 409);
  };
}

function telemetryOperationForJobKind(kind) {
  if (kind === 'restore_demo') return 'restore';
  if (kind === 'upload') return 'upload';
  return 'refresh';
}

async function restoreGenerationSnapshot({
  generationId,
  reason,
  initiatingActor = null,
  progress = null,
}) {
  const persisted = await getGeneration(generationId);
  const actor = await resolvePersistedDatasetAdminActor(
    persisted?.initiatingActor || initiatingActor
  );
  if (initiatingActor && requiredInitiatingActor(initiatingActor) !== actor) {
    throw new ImportError('Lifecycle recovery actor does not match the persisted initiating actor.', 503);
  }
  const generation = await markGenerationRecovering(generationId, reason);
  if (generation.initiatingActor !== actor) {
    throw new ImportError('Generation initiating actor changed during recovery admission.', 503);
  }
  const priorDataset = rehydrateRollbackDataset(generation.rollbackDataset);
  return executeImportPlan({
    dataset: priorDataset,
    dryRun: false,
    generationId,
    recoveryMode: true,
    initiatingActor: actor,
    progress,
  });
}

async function recoverGenerationBeforeRelease({
  generationId,
  jobId,
  leaseToken,
  reason,
  errorMessage,
  initiatingActor,
  progress = null,
}) {
  const generation = await getGeneration(generationId);
  const persistedActor = await resolvePersistedDatasetAdminActor(generation?.initiatingActor);
  if (initiatingActor && requiredInitiatingActor(initiatingActor) !== persistedActor) {
    throw new ImportError('Lifecycle failure recovery actor does not match the persisted initiating actor.', 503);
  }
  if (!generation?.snapshotComplete) {
    return finalizeInterruptedWithoutSnapshot({
      generationId,
      jobId,
      leaseToken,
      reason,
      errorMessage,
    });
  }

  const restored = await restoreGenerationSnapshot({
    generationId,
    reason,
    initiatingActor,
    progress,
  });
  const finalized = await finalizeGenerationRecovery({
    generationId,
    jobId,
    leaseToken,
    reason,
    errorMessage,
    requiredFeatures: restored.requiredFeatures,
  });
  await cleanupGenerationSnapshot(generationId, 'rolled_back');
  return finalized;
}

async function reconcileDatasetLifecycleOnStartup() {
  const lifecycleState = await loadStartupLifecycleState();
  const recoveryPlans = planAllStartupReconciliations(lifecycleState);
  const results = [];

  for (const recoveryPlan of recoveryPlans) {
    const recoveryActor =
      recoveryPlan.restoreGenerationId ||
      recoveryPlan.failJobId ||
      recoveryPlan.cleanupGenerationId
        ? await resolvePersistedDatasetAdminActor(recoveryPlan.initiatingActor)
        : null;

    if (recoveryPlan.restoreGenerationId) {
      const generation = lifecycleState.generations.find(
        (candidate) => candidate.generationId === recoveryPlan.restoreGenerationId
      );
      const restored = await restoreGenerationSnapshot({
        generationId: recoveryPlan.restoreGenerationId,
        reason: 'APPLICATION_RESTART',
        initiatingActor: recoveryActor,
      });
      // restoreGenerationSnapshot invokes the same
      // rebuildAndProveRequiredGenerationFeatures gate as forward apply.
      const finalized = await finalizeGenerationRecovery({
        generationId: recoveryPlan.restoreGenerationId,
        jobId: recoveryPlan.failJobId || generation?.jobId || null,
        leaseToken: recoveryPlan.leaseToken || null,
        reason: 'APPLICATION_RESTART',
        requiredFeatures: restored.requiredFeatures,
      });
      await cleanupGenerationSnapshot(recoveryPlan.restoreGenerationId, 'rolled_back');
      results.push(finalized);
      continue;
    }

    if (recoveryPlan.failJobId || recoveryPlan.cleanupGenerationId) {
      results.push(await finalizeInterruptedWithoutSnapshot({
        generationId: recoveryPlan.cleanupGenerationId,
        jobId: recoveryPlan.failJobId,
        leaseToken: recoveryPlan.leaseToken || null,
        reason: recoveryPlan.reason,
      }));
      continue;
    }

    if (recoveryPlan.releaseLease) {
      const released = await releaseStartupLease({
        leaseToken: recoveryPlan.leaseToken,
        jobId: recoveryPlan.leaseJobId,
      });
      const terminalGeneration = lifecycleState.generations.find(
        (generation) =>
          generation.jobId === recoveryPlan.leaseJobId &&
          ['active', 'rolled_back', 'failed', 'superseded'].includes(
            String(generation.status || '').toLowerCase()
          )
      );
      if (terminalGeneration) {
        await cleanupGenerationSnapshot(terminalGeneration.generationId, terminalGeneration.status);
      }
      results.push({
        reason: recoveryPlan.reason,
        released,
        cleanedGenerationId: terminalGeneration?.generationId || null,
      });
    }
  }

  return {
    reconciled: results.length,
    results,
  };
}

async function startDatasetJob({
  parsed,
  kind,
  lockMessage,
  queuedMessage,
  startMessage,
  completeMessage,
  datasetSource,
  initiatingActor,
  executeOptions = {},
}) {
  const actor = requiredInitiatingActor(initiatingActor);
  // Raise the process-local side of the serving fence before the first await.
  // The Oracle journal remains the durable/cross-restart authority.
  const transitionToken = beginDatasetServingTransition({
    status: 'admitted',
  });
  let admission;
  try {
    admission = await admitDatasetJob({
      operation: kind,
      message: queuedMessage,
      warnings: [...parsed.warnings],
      counts: parsed.counts,
      initiatingActor: actor,
    });
  } catch (error) {
    endDatasetServingTransition({ transitionToken });
    throw error;
  }
  if (!admission) {
    endDatasetServingTransition({ transitionToken });
    const activeOperation = await getActiveOperation();
    throw new ImportError(
      `Another dataset operation is already in progress${activeOperation?.kind ? ` (${activeOperation.kind}).` : '.'}`,
      409,
      { activeOperation }
    );
  }
  const { job, lock, generationId } = admission;
  associateDatasetServingTransition(transitionToken, {
    generationId,
    jobId: job.jobId,
    status: 'admitted',
  });

  setImmediate(async () => {
    let terminalCommitted = false;
    try {
      // No in-flight governed reader can cross the first destructive write.
      // New readers already receive retryable 503 from the serving middleware.
      await waitForDatasetReadersToDrain({ transitionToken });
      const claimed = await claimDatasetJob(job.jobId, { leaseToken: lock.leaseToken, leaseSeconds: lock.leaseSeconds });
      if (!claimed) throw new ImportError('Dataset job could not be claimed by this worker; it was stopped safely.', 409);
      await updateJob(job.jobId, { message: startMessage });
      const operation = await updateOperation({
        leaseToken: lock.leaseToken,
        jobId: job.jobId,
        progress: 5,
        message: startMessage,
        status: 'running',
      });
      if (!operation) throw new ImportError('Dataset worker lease was lost before Restore began.', 409);

      if (kind === 'restore_demo') {
        const telemetry = await recordRestoreTelemetry({
          eventType: 'restore_requested',
          lifecycleStatus: 'requested',
          jobId: job.jobId,
          operation: 'restore',
          datasetSource,
        });
        if (!telemetry.recorded && !telemetry.skipped) {
          await appendJobWarnings(job.jobId, ['Restore telemetry requested event could not be recorded.']);
        }
      }

      const result = await executeImportPlan({
        dataset: parsed.dataset,
        dryRun: false,
        progress: createJobProgressHandler(job.jobId, lock.leaseToken),
        generationId,
        initiatingActor: actor,
        ...executeOptions,
      });

      const warnings = [...result.warnings];
      // One Oracle transaction makes the generation and terminal status
      // inseparable: a restarted app always observes both or neither.
      const completion = await completeDatasetJobTransaction({
        jobId: job.jobId,
        generationId,
        leaseToken: lock.leaseToken,
        activeDataset: buildDatasetState(datasetSource),
        warnings,
        summary: result.summary,
        requiredFeatures: result.requiredFeatures,
        completeMessage,
      });
      const activeDataset = completion.activeDataset;
      terminalCommitted = true;
      const terminalState = { status: 'completed' };
      if (completion.job?.status !== terminalState.status) {
        throw new ImportError('Restore completion state was not committed.', 500);
      }
      await cleanupGenerationSnapshot(generationId, 'active');
      await recordDatasetRefresh({
        jobId: job.jobId,
        operation: telemetryOperationForJobKind(kind),
        datasetSource,
        activeDataset,
        summary: result.summary,
      });

      if (kind === 'restore_demo') {
        const telemetry = await recordRestoreTelemetry({
          eventType: 'restore_completed',
          lifecycleStatus: 'completed',
          jobId: job.jobId,
          operation: 'restore',
          datasetSource,
          activeDataset,
          summary: result.summary,
        });
        if (!telemetry.recorded && !telemetry.skipped) {
          await appendJobWarnings(job.jobId, ['Restore telemetry completed event could not be recorded.']);
        }
      }
    } catch (err) {
      // OCI telemetry is deliberately fail-open. Once the state/job commit has
      // succeeded, a later warning-write fault must not rewrite it as failed.
      if (terminalCommitted) {
        console.warn(`Post-completion dataset telemetry warning: ${err.message || err}`);
        return;
      }

      try {
        await recoverGenerationBeforeRelease({
          generationId,
          jobId: job.jobId,
          leaseToken: lock.leaseToken,
          reason: 'FORWARD_APPLY_FAILED',
          errorMessage: err.message || 'Import failed.',
          initiatingActor: actor,
        });
      } catch (recoveryError) {
        // Never keep serving a partially committed OML/base generation.  The
        // APPLYING/RECOVERING journal remains durable, and the next process
        // must finish rollback before server readiness.
        console.error(`Fatal dataset generation recovery failure: ${recoveryError.message || recoveryError}`);
        process.exit(1);
        return;
      }

      if (kind === 'restore_demo') {
        const telemetry = await recordRestoreTelemetry({
          eventType: 'restore_failed',
          lifecycleStatus: 'failed',
          jobId: job.jobId,
          operation: 'restore',
          datasetSource,
          error: String(err.message || 'Restore failed.').slice(0, 500),
        });
        if (!telemetry.recorded && !telemetry.skipped) {
          await appendJobWarnings(job.jobId, ['Restore telemetry failed event could not be recorded.']);
        }
      }
    } finally {
      endDatasetServingTransition({ transitionToken });
    }
  });

  return {
    jobId: job.jobId,
    generationId,
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
    fileName: `utilities-import-template-${version}.zip`,
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
    initiatingActor: req?.authenticatedActor,
  });
}

async function startImport({ req, body = {}, version = IMPORT_VERSION }) {
  if (String(body.confirmation || '') !== 'REPLACE_DATASET') {
    throw new ImportError('Replacing a dataset requires confirmation REPLACE_DATASET.', 403);
  }
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
    initiatingActor: req?.authenticatedActor,
  });
}

async function validateDemoRestore({ req, body = {}, query = {}, headers = {}, version = IMPORT_VERSION } = {}) {
  const demoDataset = getBundledDemoDataset(version);
  const demoDateRefresh = buildDemoDateRefreshOptions({ body, query, headers });
  return runDatasetValidation({
    parsed: demoDataset.parsed,
    fileOnly: false,
    lockKind: 'validate_restore_demo',
    lockMessage: 'Validating demo dataset restore...',
    initiatingActor: req?.authenticatedActor,
    executeOptions: { demoDateRefresh },
  });
}

async function startDemoRestore({ req, body = {}, query = {}, headers = {}, version = IMPORT_VERSION } = {}) {
  if (String(body.confirmation || '') !== 'RESTORE_DEMO') {
    throw new ImportError('Restoring the demo requires confirmation RESTORE_DEMO.', 403);
  }
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
    initiatingActor: req?.authenticatedActor,
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
  reconcileDatasetLifecycleOnStartup,

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
    inspectDateSensitiveOmlRefresh,
    captureRollbackDataset,
    rehydrateRollbackDataset,
    proveRequiredGenerationFeatures,
    rebuildAndProveRequiredGenerationFeatures,
    restoreGenerationSnapshot,
    parseArchiveDataset,
    parseDemoAnchorDate,
    reanchorDemoDates,
    refreshDemoDatesInDatabase,
  },
};
