const fs = require('fs');
const path = require('path');
const { parse: parseCsv } = require('csv-parse');
const { oracledb } = require('../config/database');

const GOLD_DATA_DIR = path.resolve(__dirname, '../../gold-data');
const GOLD_DATA_MANIFEST = path.resolve(GOLD_DATA_DIR, '_export_manifest.json');
const BASELINE_TABLE_NAMES = new Set([
  'CUSTOMER_ORDER_STATUS',
  'DIM_PRODUCT',
  'PRODUCT_MANUALS_SOURCE',
  'PRODUCT_VECTOR_STORE',
]);
const JOB_TABLE = 'PG_FULL_DATA_LOAD_JOB';
const TABLE_STATUS_TABLE = 'PG_FULL_DATA_LOAD_TABLES';
const JOB_ID = 1;
const LOAD_BATCH_SIZE = Number(process.env.ADB_FULL_DATA_LOAD_BATCH_SIZE || 5000);

let activeJob = null;

function quoteOracleIdentifier(value) {
  const text = String(value || '').trim();
  if (!text || text.includes('"') || text.length > 128) {
    throw new Error(`Unsafe Oracle identifier: ${text || '<empty>'}`);
  }
  return `"${text}"`;
}

function normalizeWarehouseTableName(csvFile) {
  const stem = path.basename(String(csvFile || ''), path.extname(String(csvFile || '')));
  return stem.toUpperCase().replace(/[^A-Z0-9_$#]+/g, '_');
}

function normalizeWarehouseDataType(dataType) {
  const normalized = String(dataType || '').trim().toUpperCase();
  if (['CLOB', 'JSON', 'VECTOR', 'SDO_GEOMETRY'].includes(normalized)) return 'CLOB';
  return 'VARCHAR2(4000)';
}

function parseCsvHeaderLine(line) {
  const headers = [];
  let current = '';
  let quoted = false;
  const source = String(line || '').replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      headers.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  headers.push(current.trim());
  return headers.filter(Boolean);
}

function readCsvHeaderColumns(csvPath) {
  const firstLine = String(fs.readFileSync(csvPath, 'utf8')).split(/\r?\n/, 1)[0] || '';
  return parseCsvHeaderLine(firstLine).map((header) => ({
    name: header.trim(),
    dataType: 'VARCHAR2(4000)',
  }));
}

function readGoldDataInventory(goldDataDir = GOLD_DATA_DIR, manifestPath = GOLD_DATA_MANIFEST) {
  const csvFiles = new Set(
    fs.existsSync(goldDataDir)
      ? fs.readdirSync(goldDataDir).filter((fileName) => fileName.toLowerCase().endsWith('.csv'))
      : []
  );

  if (!csvFiles.size) return [];

  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const manifestTables = Array.isArray(manifest?.tables) ? manifest.tables : [];
      const tables = manifestTables
        .filter((table) => table?.csv_file && csvFiles.has(table.csv_file))
        .map((table) => ({
          tableName: String(table.table_name || normalizeWarehouseTableName(table.csv_file)).trim().toUpperCase(),
          csvFile: table.csv_file,
          expectedRows: Number(table.row_count_exported || 0),
          columns: (Array.isArray(table.columns) ? table.columns : [])
            .map((column) => ({
              name: String(column.name || '').trim(),
              dataType: normalizeWarehouseDataType(column.data_type),
            }))
            .filter((column) => column.name),
        }))
        .filter((table) => table.tableName && table.columns.length);

      const manifestCsvFiles = new Set(tables.map((table) => table.csvFile));
      const extraTables = [...csvFiles]
        .filter((csvFile) => !manifestCsvFiles.has(csvFile))
        .map((csvFile) => ({
          tableName: normalizeWarehouseTableName(csvFile),
          csvFile,
          expectedRows: 0,
          columns: readCsvHeaderColumns(path.join(goldDataDir, csvFile)),
        }))
        .filter((table) => table.columns.length);

      return [...tables, ...extraTables].sort((a, b) => a.csvFile.localeCompare(b.csvFile));
    } catch (err) {
      console.warn('[full-data] Could not read export manifest; falling back to CSV headers:', err.message);
    }
  }

  return [...csvFiles].sort().map((csvFile) => ({
    tableName: normalizeWarehouseTableName(csvFile),
    csvFile,
    expectedRows: 0,
    columns: readCsvHeaderColumns(path.join(goldDataDir, csvFile)),
  })).filter((table) => table.columns.length);
}

function getFullDataTables(inventory = readGoldDataInventory()) {
  return inventory.filter((table) => !BASELINE_TABLE_NAMES.has(table.tableName));
}

function getBindDef(column) {
  const dataType = String(column.dataType || '').toUpperCase();
  if (dataType.includes('NUMBER') || dataType.includes('FLOAT') || dataType.includes('BINARY_DOUBLE') || dataType.includes('BINARY_FLOAT')) {
    return { type: oracledb.NUMBER };
  }
  if (dataType.includes('DATE') || dataType.includes('TIMESTAMP')) {
    return { type: oracledb.DATE };
  }
  if (dataType.includes('CLOB')) {
    return { type: oracledb.STRING, maxSize: 32767 };
  }
  return {
    type: oracledb.STRING,
    maxSize: Math.max(1, Math.min(Number(column.dataLength || 4000), 32767)),
  };
}

function convertCsvValueForColumn(value, column) {
  if (value === undefined || value === null) return null;
  const rawValue = String(value);
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const dataType = String(column.dataType || '').toUpperCase();
  if (dataType.includes('NUMBER') || dataType.includes('FLOAT') || dataType.includes('BINARY_DOUBLE') || dataType.includes('BINARY_FLOAT')) {
    const numericValue = Number(trimmed);
    return Number.isFinite(numericValue) ? numericValue : null;
  }
  if (dataType.includes('DATE') || dataType.includes('TIMESTAMP')) {
    const dateValue = new Date(trimmed);
    return Number.isNaN(dateValue.getTime()) ? null : dateValue;
  }

  return rawValue;
}

function makeStageTableName(tableName) {
  const normalized = String(tableName || '').replace(/[^A-Z0-9_$#]/gi, '_').toUpperCase();
  return `PG_FULL_DATA_STAGE_${normalized}`.slice(0, 128);
}

function mapJobStatus(row, tableRows = [], totalTables = 0) {
  if (!row) {
    return {
      status: 'demo',
      progress: 0,
      message: 'Provisioned demo data is loaded. Full warehouse data has not been requested.',
      completedTables: 0,
      totalTables,
      rowsLoaded: 0,
      currentTable: null,
    };
  }

  const status = String(row.STATUS || '').toLowerCase() || 'demo';
  const completedTables = Number(row.COMPLETED_TABLES ?? tableRows.filter((item) => (
    String(item.STATUS || '').toUpperCase() === 'COMPLETE'
  )).length);
  const resolvedTotalTables = Number(row.TOTAL_TABLES ?? totalTables);
  return {
    status,
    progress: resolvedTotalTables > 0 ? Math.min(100, Math.round((completedTables / resolvedTotalTables) * 100)) : 0,
    message: row.MESSAGE || '',
    completedTables,
    totalTables: resolvedTotalTables,
    rowsLoaded: Number(row.ROWS_LOADED || 0),
    currentTable: row.CURRENT_TABLE || null,
    error: row.ERROR_MESSAGE || undefined,
    updatedAt: row.UPDATED_AT || undefined,
    tables: tableRows.map((table) => ({
      tableName: table.TABLE_NAME,
      csvFile: table.CSV_FILE,
      status: String(table.STATUS || '').toLowerCase(),
      rowsLoaded: Number(table.ROWS_LOADED || 0),
      expectedRows: Number(table.EXPECTED_ROWS || 0),
      error: table.ERROR_MESSAGE || undefined,
    })),
  };
}

async function executeIgnoringMissing(connection, sql) {
  try {
    await connection.execute(sql, {}, { autoCommit: false });
  } catch (err) {
    const message = String(err?.message || '');
    if (!message.includes('ORA-00942')) throw err;
  }
}

async function ensureStateTables(connection) {
  await connection.execute(`
    BEGIN
      EXECUTE IMMEDIATE '
        CREATE TABLE ${quoteOracleIdentifier(JOB_TABLE)} (
          id NUMBER PRIMARY KEY,
          status VARCHAR2(30) NOT NULL,
          owner_id VARCHAR2(128),
          started_at TIMESTAMP,
          updated_at TIMESTAMP,
          completed_at TIMESTAMP,
          current_table VARCHAR2(128),
          total_tables NUMBER,
          completed_tables NUMBER,
          rows_loaded NUMBER,
          message VARCHAR2(1000),
          error_message CLOB
        )';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
    END;`,
    {},
    { autoCommit: true }
  );
  await connection.execute(`
    BEGIN
      EXECUTE IMMEDIATE '
        CREATE TABLE ${quoteOracleIdentifier(TABLE_STATUS_TABLE)} (
          table_name VARCHAR2(128) PRIMARY KEY,
          csv_file VARCHAR2(512),
          status VARCHAR2(30) NOT NULL,
          rows_loaded NUMBER,
          expected_rows NUMBER,
          started_at TIMESTAMP,
          updated_at TIMESTAMP,
          completed_at TIMESTAMP,
          error_message CLOB
        )';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
    END;`,
    {},
    { autoCommit: true }
  );
}

async function fetchStatusFromConnection(connection, totalTables = 0) {
  await ensureStateTables(connection);
  const jobResult = await connection.execute(
    `SELECT status, owner_id, started_at, updated_at, completed_at, current_table,
            total_tables, completed_tables, rows_loaded, message, error_message
     FROM ${quoteOracleIdentifier(JOB_TABLE)}
     WHERE id = :id`,
    { id: JOB_ID },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { ERROR_MESSAGE: { type: oracledb.STRING } } }
  );
  const tableResult = await connection.execute(
    `SELECT table_name, csv_file, status, rows_loaded, expected_rows, error_message
     FROM ${quoteOracleIdentifier(TABLE_STATUS_TABLE)}
     ORDER BY table_name`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { ERROR_MESSAGE: { type: oracledb.STRING } } }
  );
  return mapJobStatus(jobResult.rows?.[0] || null, tableResult.rows || [], totalTables);
}

// Explicit casts keep null driver binds from becoming CHAR in Oracle COALESCE expressions.
async function updateJob(connection, patch) {
  await connection.execute(
    `MERGE INTO ${quoteOracleIdentifier(JOB_TABLE)} target
     USING (SELECT :id AS id FROM dual) source
     ON (target.id = source.id)
     WHEN MATCHED THEN UPDATE SET
       status = COALESCE(:status, target.status),
       owner_id = COALESCE(:ownerId, target.owner_id),
       started_at = COALESCE(CAST(:startedAt AS TIMESTAMP), target.started_at),
       updated_at = SYSTIMESTAMP,
       completed_at = CASE
         WHEN :clearCompletedAt = 1 THEN NULL
         ELSE COALESCE(CAST(:completedAt AS TIMESTAMP), target.completed_at)
       END,
       current_table = :currentTable,
       total_tables = COALESCE(CAST(:totalTables AS NUMBER), target.total_tables),
       completed_tables = COALESCE(CAST(:completedTables AS NUMBER), target.completed_tables),
       rows_loaded = COALESCE(CAST(:rowsLoaded AS NUMBER), target.rows_loaded),
       message = COALESCE(:message, target.message),
       error_message = :errorMessage
     WHEN NOT MATCHED THEN INSERT
       (id, status, owner_id, started_at, updated_at, completed_at, current_table, total_tables, completed_tables, rows_loaded, message, error_message)
       VALUES
       (:id, COALESCE(:status, 'DEMO'), :ownerId, COALESCE(CAST(:startedAt AS TIMESTAMP), SYSTIMESTAMP), SYSTIMESTAMP, CAST(:completedAt AS TIMESTAMP), :currentTable,
        COALESCE(CAST(:totalTables AS NUMBER), 0), COALESCE(CAST(:completedTables AS NUMBER), 0), COALESCE(CAST(:rowsLoaded AS NUMBER), 0), :message, :errorMessage)`,
    {
      id: JOB_ID,
      status: patch.status || null,
      ownerId: patch.ownerId || null,
      startedAt: patch.startedAt || null,
      completedAt: patch.completedAt || null,
      clearCompletedAt: patch.clearCompletedAt ? 1 : 0,
      currentTable: patch.currentTable || null,
      totalTables: patch.totalTables ?? null,
      completedTables: patch.completedTables ?? null,
      rowsLoaded: patch.rowsLoaded ?? null,
      message: patch.message || null,
      errorMessage: patch.errorMessage || null,
    },
    { autoCommit: false }
  );
}

async function updateTableStatus(connection, tableName, patch) {
  await connection.execute(
    `MERGE INTO ${quoteOracleIdentifier(TABLE_STATUS_TABLE)} target
     USING (SELECT :tableName AS table_name FROM dual) source
     ON (target.table_name = source.table_name)
     WHEN MATCHED THEN UPDATE SET
       csv_file = COALESCE(:csvFile, target.csv_file),
       status = COALESCE(:status, target.status),
       rows_loaded = COALESCE(CAST(:rowsLoaded AS NUMBER), target.rows_loaded),
       expected_rows = COALESCE(CAST(:expectedRows AS NUMBER), target.expected_rows),
       started_at = COALESCE(CAST(:startedAt AS TIMESTAMP), target.started_at),
       updated_at = SYSTIMESTAMP,
       completed_at = COALESCE(CAST(:completedAt AS TIMESTAMP), target.completed_at),
       error_message = :errorMessage
     WHEN NOT MATCHED THEN INSERT
       (table_name, csv_file, status, rows_loaded, expected_rows, started_at, updated_at, completed_at, error_message)
       VALUES
       (:tableName, :csvFile, COALESCE(:status, 'PENDING'), COALESCE(CAST(:rowsLoaded AS NUMBER), 0), COALESCE(CAST(:expectedRows AS NUMBER), 0),
        CAST(:startedAt AS TIMESTAMP), SYSTIMESTAMP, CAST(:completedAt AS TIMESTAMP), :errorMessage)`,
    {
      tableName,
      csvFile: patch.csvFile || null,
      status: patch.status || null,
      rowsLoaded: patch.rowsLoaded ?? null,
      expectedRows: patch.expectedRows ?? null,
      startedAt: patch.startedAt || null,
      completedAt: patch.completedAt || null,
      errorMessage: patch.errorMessage || null,
    },
    { autoCommit: false }
  );
}

// A separate connection holds this sentinel row for the lifetime of the import.
// Batch commits and DDL on the worker connection cannot release the job lock.
async function ensureLockRow(connection) {
  const existing = await connection.execute(
    `SELECT COUNT(*) AS cnt FROM ${quoteOracleIdentifier(JOB_TABLE)} WHERE id = 0`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
  );
  if (Number(existing.rows?.[0]?.CNT || 0)) return;
  try {
    await connection.execute(
      `INSERT INTO ${quoteOracleIdentifier(JOB_TABLE)} (id, status) VALUES (0, 'LOCK')`,
      {}, { autoCommit: false }
    );
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    if (err.errorNum !== 1 && !String(err.message).includes('ORA-00001')) throw err;
  }
}

async function tryJobLock(connection) {
  try {
    await connection.execute(
      `SELECT id FROM ${quoteOracleIdentifier(JOB_TABLE)} WHERE id = 0 FOR UPDATE NOWAIT`,
      {}, { autoCommit: false }
    );
    return true;
  } catch (err) {
    if (err.errorNum === 54 || String(err.message).includes('ORA-00054')) return false;
    throw err;
  }
}

async function acquireJob(connection, ownerId, totalTables) {
  await updateJob(connection, {
    status: 'RUNNING', ownerId, startedAt: new Date(), totalTables,
    completedTables: 0, rowsLoaded: 0,
    message: 'Preparing full warehouse data load...',
    clearCompletedAt: true,
  });
  await connection.commit();
}

async function fetchTableColumnMetadata(connection, tableName) {
  const result = await connection.execute(
    `SELECT column_name, data_type, data_length, identity_column
     FROM user_tab_cols
     WHERE table_name = :tableName
       AND hidden_column = 'NO'
     ORDER BY column_id`,
    { tableName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return (result.rows || []).map((row) => ({
    name: row.COLUMN_NAME,
    dataType: row.DATA_TYPE,
    dataLength: row.DATA_LENGTH,
    identity: row.IDENTITY_COLUMN === 'YES',
  }));
}

async function fetchTableRowCount(connection, tableName) {
  const result = await connection.execute(
    `SELECT COUNT(*) AS row_count FROM ${quoteOracleIdentifier(tableName)}`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return Number(result.rows?.[0]?.ROW_COUNT || 0);
}

async function createWarehouseTableIfMissing(connection, table) {
  const existing = await connection.execute(
    `SELECT COUNT(*) AS table_count FROM user_tables WHERE table_name = :tableName`,
    { tableName: table.tableName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (Number(existing.rows?.[0]?.TABLE_COUNT || 0) > 0) return false;

  const columns = table.columns.map((column) => (
    `${quoteOracleIdentifier(column.name)} ${normalizeWarehouseDataType(column.dataType)}`
  ));
  await connection.execute(
    `CREATE TABLE ${quoteOracleIdentifier(table.tableName)} (\n${columns.join(',\n')}\n)`,
    {},
    { autoCommit: true }
  );
  return true;
}

function resolveLoadColumns(table, targetColumns, csvHeaders) {
  const headersByName = new Map(csvHeaders.map((header) => [header.trim(), header]));
  const targetByName = new Map(targetColumns.map((column) => [column.name, column]));
  const missingTargetColumns = table.columns
    .map((column) => column.name)
    .filter((columnName) => !targetByName.has(columnName));
  const missingCsvColumns = table.columns
    .map((column) => column.name)
    .filter((columnName) => !headersByName.has(columnName));

  if (missingTargetColumns.length || missingCsvColumns.length) {
    throw new Error(
      `CSV/table column mismatch for ${table.tableName}. ` +
      `Missing target columns: ${missingTargetColumns.join(', ') || 'none'}; ` +
      `missing CSV columns: ${missingCsvColumns.join(', ') || 'none'}.`
    );
  }

  const loadColumns = table.columns.map((manifestColumn) => ({
    ...targetByName.get(manifestColumn.name),
    csvHeader: headersByName.get(manifestColumn.name),
  }));
  const identityColumns = loadColumns.filter((column) => column.identity).map((column) => column.name);
  if (identityColumns.length) {
    throw new Error(
      `CSV/table column mismatch for ${table.tableName}. ` +
      `The target table has generated identity column(s): ${identityColumns.join(', ')}.`
    );
  }

  return loadColumns;
}

// Manifest row counts can describe an older export. The intact CSV is authoritative.
async function countCsvRows(csvPath) {
  let rows = 0;
  const source = fs.createReadStream(csvPath);
  const parser = source.pipe(parseCsv({
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
    trim: false,
  }));
  source.on('error', (err) => parser.destroy(err));
  for await (const _record of parser) rows += 1;
  return rows;
}

async function loadCsvIntoStage({ connection, table, csvPath, stageTableName, onProgress }) {
  const targetColumns = await fetchTableColumnMetadata(connection, table.tableName);
  if (!targetColumns.length) {
    throw new Error(`Full-data target table ${table.tableName} does not exist.`);
  }

  const stageColumns = await fetchTableColumnMetadata(connection, stageTableName);
  let loadColumns = null;
  let insertSql = '';
  let bindDefs = null;
  let rowsLoaded = 0;
  let batch = [];

  const source = fs.createReadStream(csvPath);
  const parser = source.pipe(parseCsv({
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
    trim: false,
  }));
  source.on('error', (err) => parser.destroy(err));

  for await (const record of parser) {
    if (!loadColumns) {
      resolveLoadColumns(table, targetColumns, Object.keys(record));
      loadColumns = resolveLoadColumns(table, stageColumns, Object.keys(record));
      const quotedColumnList = loadColumns.map((column) => quoteOracleIdentifier(column.name)).join(', ');
      const bindList = loadColumns.map((_, index) => `:c${index}`).join(', ');
      insertSql = `INSERT INTO ${quoteOracleIdentifier(stageTableName)} (${quotedColumnList}) VALUES (${bindList})`;
      bindDefs = Object.fromEntries(loadColumns.map((column, index) => [`c${index}`, getBindDef(column)]));
    }

    const row = {};
    for (let index = 0; index < loadColumns.length; index += 1) {
      const column = loadColumns[index];
      row[`c${index}`] = convertCsvValueForColumn(record[column.csvHeader], column);
    }
    batch.push(row);

    if (batch.length >= LOAD_BATCH_SIZE) {
      await connection.executeMany(insertSql, batch, { bindDefs, batchErrors: false, autoCommit: false });
      rowsLoaded += batch.length;
      batch = [];
      await onProgress(rowsLoaded);
    }
  }

  if (!loadColumns) {
    const stat = fs.statSync(csvPath);
    if (stat.size === 0) {
      return { rowsLoaded: 0, loadColumns: [] };
    }
    const headers = readCsvHeaderColumns(csvPath).map((column) => column.name);
    resolveLoadColumns(table, targetColumns, headers);
    loadColumns = resolveLoadColumns(table, stageColumns, headers);
  }

  if (batch.length) {
    await connection.executeMany(insertSql, batch, { bindDefs, batchErrors: false, autoCommit: false });
    rowsLoaded += batch.length;
    await onProgress(rowsLoaded);
  }
  return { rowsLoaded, loadColumns: loadColumns || [] };
}

async function finishExistingCompleteTable(connection, table, rowsLoaded, totals) {
  await updateTableStatus(connection, table.tableName, {
    csvFile: table.csvFile,
    status: 'COMPLETE',
    rowsLoaded,
    expectedRows: table.expectedRows,
    completedAt: new Date(),
    errorMessage: null,
  });
  await updateJob(connection, {
    status: 'RUNNING',
    completedTables: totals.completedTables,
    rowsLoaded: totals.rowsLoaded,
    message: `${table.tableName} already contains the full CSV row count.`,
    errorMessage: null,
  });
  await connection.commit();
}

async function loadOneTable(connection, table, totals, goldDataDir = GOLD_DATA_DIR) {
  const csvPath = path.join(goldDataDir, table.csvFile);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Full-data CSV file is missing: ${table.csvFile}`);
  }

  await createWarehouseTableIfMissing(connection, table);
  const currentCount = await fetchTableRowCount(connection, table.tableName);
  const existingStatus = await connection.execute(
    `SELECT status, rows_loaded FROM ${quoteOracleIdentifier(TABLE_STATUS_TABLE)} WHERE table_name = :tableName`,
    { tableName: table.tableName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (existingStatus.rows?.[0]?.STATUS === 'COMPLETE' && currentCount === Number(existingStatus.rows[0].ROWS_LOADED || 0)) {
    totals.completedTables += 1;
    totals.rowsLoaded += Number(existingStatus.rows[0].ROWS_LOADED || currentCount);
    await updateJob(connection, {
      status: 'RUNNING',
      completedTables: totals.completedTables,
      rowsLoaded: totals.rowsLoaded,
      message: `${table.tableName} already loaded.`,
      errorMessage: null,
    });
    await connection.commit();
    return;
  }

  await updateTableStatus(connection, table.tableName, {
    csvFile: table.csvFile,
    status: 'RUNNING',
    rowsLoaded: 0,
    expectedRows: table.expectedRows,
    startedAt: new Date(),
    errorMessage: null,
  });
  await updateJob(connection, {
    status: 'RUNNING',
    currentTable: table.tableName,
    message: `Loading ${table.csvFile}...`,
    errorMessage: null,
  });
  await connection.commit();

  if (currentCount > 0) {
    const csvRows = await countCsvRows(csvPath);
    if (currentCount === csvRows) {
      totals.completedTables += 1;
      totals.rowsLoaded += currentCount;
      await finishExistingCompleteTable(connection, table, currentCount, totals);
      return;
    }
    throw new Error(`${table.tableName} already has ${currentCount.toLocaleString()} row(s), but ${table.csvFile} has ${csvRows.toLocaleString()} row(s). The full-data loader left the table unchanged.`);
  }

  const stageTableName = makeStageTableName(table.tableName);
  let tableCommitted = false;
  await executeIgnoringMissing(connection, `DROP TABLE ${quoteOracleIdentifier(stageTableName)} PURGE`);
  await connection.execute(
    `CREATE TABLE ${quoteOracleIdentifier(stageTableName)} AS SELECT * FROM ${quoteOracleIdentifier(table.tableName)} WHERE 1=0`,
    {},
    { autoCommit: true }
  );

  try {
    const { rowsLoaded, loadColumns } = await loadCsvIntoStage({
      connection,
      table,
      csvPath,
      stageTableName,
      onProgress: async (rowsLoadedForTable) => {
        await updateTableStatus(connection, table.tableName, {
          csvFile: table.csvFile,
          status: 'RUNNING',
          rowsLoaded: rowsLoadedForTable,
          expectedRows: table.expectedRows,
          errorMessage: null,
        });
        await updateJob(connection, {
          status: 'RUNNING',
          currentTable: table.tableName,
          rowsLoaded: totals.rowsLoaded + rowsLoadedForTable,
          message: `Loading ${table.csvFile}: ${rowsLoadedForTable.toLocaleString()} rows staged...`,
          errorMessage: null,
        });
        await connection.commit();
      },
    });
    if (!loadColumns.length && rowsLoaded > 0) {
      throw new Error(`Full-data CSV ${table.csvFile} has no loadable columns for ${table.tableName}.`);
    }

    // Publish only into an empty table. A concurrent user's SQL must not be
    // overwritten or silently mixed with this import while staging is in progress.
    await connection.execute(`LOCK TABLE ${quoteOracleIdentifier(table.tableName)} IN EXCLUSIVE MODE NOWAIT`, {}, { autoCommit: false });
    if (await fetchTableRowCount(connection, table.tableName) !== 0) {
      throw new Error(`${table.tableName} changed during the import; its data was preserved. Retry after reviewing the table.`);
    }
    const quotedColumnList = loadColumns.map((column) => quoteOracleIdentifier(column.name)).join(', ');
    await connection.execute(
      quotedColumnList
        ? `INSERT INTO ${quoteOracleIdentifier(table.tableName)} (${quotedColumnList}) SELECT ${quotedColumnList} FROM ${quoteOracleIdentifier(stageTableName)}`
        : `INSERT INTO ${quoteOracleIdentifier(table.tableName)} SELECT * FROM ${quoteOracleIdentifier(stageTableName)}`,
      {},
      { autoCommit: false }
    );
    totals.completedTables += 1;
    totals.rowsLoaded += rowsLoaded;
    await updateTableStatus(connection, table.tableName, {
      csvFile: table.csvFile,
      status: 'COMPLETE',
      rowsLoaded,
      expectedRows: table.expectedRows,
      completedAt: new Date(),
      errorMessage: null,
    });
    await updateJob(connection, {
      status: 'RUNNING',
      completedTables: totals.completedTables,
      rowsLoaded: totals.rowsLoaded,
      message: `${table.tableName} loaded from ${table.csvFile}.`,
      errorMessage: null,
    });
    await connection.commit();
    tableCommitted = true;
  } finally {
    if (!tableCommitted) {
      try { await connection.rollback(); } catch (_) { /* ignore rollback failures before staging cleanup */ }
    }
    await executeIgnoringMissing(connection, `DROP TABLE ${quoteOracleIdentifier(stageTableName)} PURGE`);
    await connection.commit();
  }
}

async function getAutoPgConnection() {
  const lakehouseRoutes = require('../routes/lakehouse');
  return lakehouseRoutes._private.getAutoLakehousePgConnection();
}

async function runFullDataLoad(ownerId, options = {}) {
  const inventory = options.inventory || readGoldDataInventory();
  const tables = getFullDataTables(inventory);
  const connectionFactory = options.connectionFactory || getAutoPgConnection;
  let connection;
  let lockConnection;
  let ownsLock = false;
  try {
    connection = await connectionFactory();
    await ensureStateTables(connection);
    await ensureLockRow(connection);
    lockConnection = await connectionFactory();
    ownsLock = await tryJobLock(lockConnection);
    if (!ownsLock) return await fetchStatusFromConnection(connection, tables.length);
    await acquireJob(connection, ownerId, tables.length);

    const totals = { completedTables: 0, rowsLoaded: 0 };
    for (const table of tables) {
      await loadOneTable(connection, table, totals, options.goldDataDir || GOLD_DATA_DIR);
    }

    await updateJob(connection, {
      status: 'COMPLETE', completedAt: new Date(), currentTable: null,
      completedTables: tables.length, rowsLoaded: totals.rowsLoaded,
      message: `Full warehouse data set loaded: ${totals.rowsLoaded.toLocaleString()} rows across ${tables.length} tables.`,
      errorMessage: null,
    });
    await connection.commit();
    return await fetchStatusFromConnection(connection, tables.length);
  } catch (err) {
    if (connection && ownsLock) {
      try {
        await connection.rollback();
        await updateJob(connection, {
          status: 'ERROR', message: 'Full warehouse data load failed. Retry to resume from the last completed table.',
          errorMessage: err.message,
        });
        await connection.commit();
      } catch (statusErr) {
        console.error('[full-data] Failed to persist error status:', statusErr);
      }
    }
    throw err;
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* connection teardown rolls back pending work */ }
    }
    if (lockConnection) {
      try { await lockConnection.rollback(); } catch (_) { /* close also releases the lock */ }
      try { await lockConnection.close(); } catch (_) { /* session teardown */ }
    }
  }
}

function startFullDataLoad(options = {}) {
  if (activeJob) return activeJob;
  const ownerId = `${process.pid}-${Date.now()}`;
  activeJob = runFullDataLoad(ownerId, options)
    .catch((err) => {
      console.error('[full-data] Full warehouse data load failed:', err);
      return { status: 'error', error: err.message, message: 'Full warehouse data load failed.' };
    })
    .finally(() => {
      activeJob = null;
    });
  return activeJob;
}

async function getFullDataLoadStatus(options = {}) {
  const inventory = options.inventory || readGoldDataInventory();
  const tables = getFullDataTables(inventory);
  let connection;
  try {
    connection = await (options.connectionFactory || getAutoPgConnection)();
    const status = await fetchStatusFromConnection(connection, tables.length);
    await ensureLockRow(connection);
    const unlocked = await tryJobLock(connection);
    await connection.rollback();
    if (activeJob && unlocked) return { ...status, status: 'running', message: 'Preparing full warehouse data load...' };
    if (status.status === 'running' && unlocked) {
      return { ...status, status: 'error', message: 'The import was interrupted. Retry to resume from the last completed table.', error: 'The previous import session is no longer running.' };
    }
    if (!unlocked) return { ...status, status: 'running' };
    return status;
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
  }
}

module.exports = {
  BASELINE_TABLE_NAMES,
  getFullDataTables,
  getFullDataLoadStatus,
  mapJobStatus,
  readGoldDataInventory,
  resolveLoadColumns,
  startFullDataLoad,
  _private: {
    countCsvRows,
    runFullDataLoad,
    loadOneTable,
    tryJobLock,
    makeStageTableName,
    quoteOracleIdentifier,
  },
};
