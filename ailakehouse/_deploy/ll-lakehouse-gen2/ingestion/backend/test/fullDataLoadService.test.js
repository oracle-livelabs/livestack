const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const service = require('../lib/fullDataLoadService');

const GOLD_DATA_DIR = path.resolve(__dirname, '../../gold-data');
const GOLD_DATA_MANIFEST = path.resolve(GOLD_DATA_DIR, '_export_manifest.json');

function makeTable(tableName, csvFile, expectedRows = 0) {
  return {
    tableName,
    csvFile,
    expectedRows,
    columns: [
      { name: 'ID', dataType: 'VARCHAR2(4000)' },
      { name: 'NAME', dataType: 'VARCHAR2(4000)' },
    ],
  };
}

function makeCsvTempDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peakgear-full-data-'));
  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, fileName), content);
  }
  return dir;
}

function makeRows(count) {
  const rows = ['ID,NAME'];
  for (let index = 1; index <= count; index += 1) {
    rows.push(`${index},Name ${index}`);
  }
  return `${rows.join('\n')}\n`;
}

function makeMockDb(options = {}) {
  const state = {
    jobs: new Map(),
    tableStatuses: new Map(),
    tables: new Map(),
    lockOwner: options.lockHeld ? { external: true } : null,
    executeManyCalls: 0,
    ddlEvents: [],
  };

  const normalizeTableName = (name) => String(name || '').replace(/"/g, '').toUpperCase();
  const extractQuotedTableName = (sql, pattern) => normalizeTableName(sql.match(pattern)?.[1]);
  const makeColumnRows = (tableName) => (state.tables.get(normalizeTableName(tableName))?.columns || []).map((column, index) => ({
    COLUMN_NAME: column.name,
    DATA_TYPE: column.dataType || 'VARCHAR2',
    DATA_LENGTH: column.dataLength || 4000,
    IDENTITY_COLUMN: column.identity ? 'YES' : 'NO',
    COLUMN_ID: index + 1,
  }));

  class MockConnection {
    constructor(name) {
      this.name = name;
      this.closed = false;
      this.pendingTargetInserts = [];
    }

    async execute(sql, binds = {}) {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (normalized.startsWith('BEGIN EXECUTE IMMEDIATE')) {
        return { rows: [] };
      }
      if (/SELECT COUNT\(\*\) AS cnt FROM "PG_FULL_DATA_LOAD_JOB" WHERE id = 0/i.test(normalized)) {
        return { rows: [{ CNT: state.jobs.has(0) ? 1 : 0 }] };
      }
      if (/INSERT INTO "PG_FULL_DATA_LOAD_JOB" \(id, status\) VALUES \(0, 'LOCK'\)/i.test(normalized)) {
        if (state.jobs.has(0)) {
          const err = new Error('ORA-00001: unique constraint violated');
          err.errorNum = 1;
          throw err;
        }
        state.jobs.set(0, { ID: 0, STATUS: 'LOCK' });
        return { rowsAffected: 1 };
      }
      if (/SELECT id FROM "PG_FULL_DATA_LOAD_JOB" WHERE id = 0 FOR UPDATE NOWAIT/i.test(normalized)) {
        if (state.lockOwner && state.lockOwner !== this) {
          const err = new Error('ORA-00054: resource busy and acquire with NOWAIT specified');
          err.errorNum = 54;
          throw err;
        }
        state.lockOwner = this;
        return { rows: [{ ID: 0 }] };
      }
      // Oracle infers untyped null binds as CHAR. Protect the live ORA-00932 regression.
      if (/MERGE INTO "PG_FULL_DATA_LOAD_(JOB|TABLES)"/i.test(normalized)) {
        for (const [name, type] of Object.entries({
          startedAt: 'TIMESTAMP', completedAt: 'TIMESTAMP', totalTables: 'NUMBER',
          completedTables: 'NUMBER', rowsLoaded: 'NUMBER', expectedRows: 'NUMBER',
        })) {
          if (Object.hasOwn(binds, name)) {
            assert(normalized.includes(`CAST(:${name} AS ${type})`), `${name} must have an explicit Oracle type`);
            assert(!normalized.includes(`COALESCE(:${name},`), `${name} cannot use an untyped nullable COALESCE bind`);
          }
        }
      }
      if (/MERGE INTO "PG_FULL_DATA_LOAD_JOB"/i.test(normalized)) {
        const existing = state.jobs.get(binds.id) || { ID: binds.id };
        state.jobs.set(binds.id, {
          ...existing,
          STATUS: binds.status ?? existing.STATUS ?? 'DEMO',
          OWNER_ID: binds.ownerId ?? existing.OWNER_ID,
          STARTED_AT: binds.startedAt ?? existing.STARTED_AT,
          UPDATED_AT: new Date(),
          COMPLETED_AT: binds.clearCompletedAt ? null : (binds.completedAt ?? existing.COMPLETED_AT),
          CURRENT_TABLE: binds.currentTable ?? null,
          TOTAL_TABLES: binds.totalTables ?? existing.TOTAL_TABLES ?? 0,
          COMPLETED_TABLES: binds.completedTables ?? existing.COMPLETED_TABLES ?? 0,
          ROWS_LOADED: binds.rowsLoaded ?? existing.ROWS_LOADED ?? 0,
          MESSAGE: binds.message ?? existing.MESSAGE,
          ERROR_MESSAGE: binds.errorMessage ?? null,
        });
        return { rowsAffected: 1 };
      }
      if (/MERGE INTO "PG_FULL_DATA_LOAD_TABLES"/i.test(normalized)) {
        if (options.failCompleteTableStatus && binds.status === 'COMPLETE') {
          throw new Error('mock completion metadata failure');
        }
        const existing = state.tableStatuses.get(binds.tableName) || { TABLE_NAME: binds.tableName };
        state.tableStatuses.set(binds.tableName, {
          ...existing,
          CSV_FILE: binds.csvFile ?? existing.CSV_FILE,
          STATUS: binds.status ?? existing.STATUS ?? 'PENDING',
          ROWS_LOADED: binds.rowsLoaded ?? existing.ROWS_LOADED ?? 0,
          EXPECTED_ROWS: binds.expectedRows ?? existing.EXPECTED_ROWS ?? 0,
          STARTED_AT: binds.startedAt ?? existing.STARTED_AT,
          UPDATED_AT: new Date(),
          COMPLETED_AT: binds.completedAt ?? existing.COMPLETED_AT,
          ERROR_MESSAGE: binds.errorMessage ?? null,
        });
        return { rowsAffected: 1 };
      }
      if (/SELECT status, owner_id, started_at/i.test(normalized)) {
        return { rows: state.jobs.has(binds.id) ? [state.jobs.get(binds.id)] : [] };
      }
      if (/SELECT table_name, csv_file, status, rows_loaded, expected_rows, error_message/i.test(normalized)) {
        return { rows: [...state.tableStatuses.values()].sort((a, b) => a.TABLE_NAME.localeCompare(b.TABLE_NAME)) };
      }
      if (/SELECT COUNT\(\*\) AS table_count FROM user_tables WHERE table_name = :tableName/i.test(normalized)) {
        return { rows: [{ TABLE_COUNT: state.tables.has(binds.tableName) ? 1 : 0 }] };
      }
      if (/^CREATE TABLE "/i.test(normalized) && !/ AS SELECT \* FROM /i.test(normalized)) {
        const tableName = extractQuotedTableName(normalized, /^CREATE TABLE "([^"]+)"/i);
        const rawColumns = normalized.match(/\((.*)\)$/)?.[1] || '';
        const columns = rawColumns.split(',').map((columnDefinition) => ({
          name: normalizeTableName(columnDefinition.trim().match(/^"([^"]+)"/)?.[1]),
          dataType: 'VARCHAR2',
          dataLength: 4000,
          identity: false,
        })).filter((column) => column.name);
        state.tables.set(tableName, { columns, rows: [] });
        state.ddlEvents.push(`CREATE ${tableName}`);
        return { rowsAffected: 0 };
      }
      if (/^CREATE TABLE ".*" AS SELECT \* FROM ".*" WHERE 1=0$/i.test(normalized)) {
        const [, stageName, sourceName] = normalized.match(/^CREATE TABLE "([^"]+)" AS SELECT \* FROM "([^"]+)" WHERE 1=0$/i);
        const source = state.tables.get(normalizeTableName(sourceName));
        state.tables.set(normalizeTableName(stageName), {
          columns: source.columns.map((column) => ({ ...column })),
          rows: [],
        });
        state.ddlEvents.push(`CREATE ${normalizeTableName(stageName)}`);
        return { rowsAffected: 0 };
      }
      if (/^DROP TABLE "/i.test(normalized)) {
        const tableName = extractQuotedTableName(normalized, /^DROP TABLE "([^"]+)"/i);
        if (!state.tables.has(tableName)) {
          const err = new Error('ORA-00942: table or view does not exist');
          err.errorNum = 942;
          throw err;
        }
        state.tables.delete(tableName);
        state.ddlEvents.push(`DROP ${tableName}`);
        return { rowsAffected: 0 };
      }
      if (/SELECT column_name, data_type, data_length, identity_column FROM user_tab_cols/i.test(normalized)) {
        return { rows: makeColumnRows(binds.tableName) };
      }
      if (/^SELECT COUNT\(\*\) AS row_count FROM "/i.test(normalized)) {
        const tableName = extractQuotedTableName(normalized, /^SELECT COUNT\(\*\) AS row_count FROM "([^"]+)"/i);
        const committedRows = state.tables.get(tableName)?.rows.length || 0;
        const pendingRows = this.pendingTargetInserts
          .filter((insert) => insert.tableName === tableName)
          .reduce((sum, insert) => sum + insert.rows.length, 0);
        return { rows: [{ ROW_COUNT: committedRows + pendingRows }] };
      }
      if (/SELECT status, rows_loaded FROM "PG_FULL_DATA_LOAD_TABLES" WHERE table_name = :tableName/i.test(normalized)) {
        const row = state.tableStatuses.get(binds.tableName);
        return { rows: row ? [row] : [] };
      }
      if (/^LOCK TABLE "/i.test(normalized)) {
        return { rows: [] };
      }
      if (/^INSERT INTO ".*" \(.*\) SELECT .* FROM "/i.test(normalized)) {
        const [, targetName, sourceName] = normalized.match(/^INSERT INTO "([^"]+)" \(.*\) SELECT .* FROM "([^"]+)"/i);
        const source = state.tables.get(normalizeTableName(sourceName));
        this.pendingTargetInserts.push({
          tableName: normalizeTableName(targetName),
          rows: source.rows.map((row) => ({ ...row })),
        });
        return { rowsAffected: source.rows.length };
      }

      throw new Error(`Unhandled SQL in mock: ${normalized}`);
    }

    async executeMany(sql, rows) {
      state.executeManyCalls += 1;
      if (options.failExecuteManyCall === state.executeManyCalls) {
        throw new Error(options.failExecuteManyMessage || 'mock executeMany failure');
      }
      const tableName = extractQuotedTableName(sql, /^INSERT INTO "([^"]+)"/i);
      const table = state.tables.get(tableName);
      table.rows.push(...rows.map((row) => ({ ...row })));
      return { rowsAffected: rows.length };
    }

    async commit() {
      for (const insert of this.pendingTargetInserts) {
        state.tables.get(insert.tableName).rows.push(...insert.rows);
      }
      this.pendingTargetInserts = [];
    }

    async rollback() {
      this.pendingTargetInserts = [];
      if (state.lockOwner === this) state.lockOwner = null;
    }

    async close() {
      await this.rollback();
      this.closed = true;
    }
  }

  return {
    state,
    connectionFactory: async () => new MockConnection(`conn-${Math.random().toString(16).slice(2)}`),
  };
}

test('full data inventory excludes the four provisioning baseline CSV tables', () => {
  const inventory = service.readGoldDataInventory(GOLD_DATA_DIR, GOLD_DATA_MANIFEST);
  const fullTables = service.getFullDataTables(inventory);
  const fullTableNames = new Set(fullTables.map((table) => table.tableName));

  assert.equal(inventory.length, 30);
  assert.equal(fullTables.length, 26);
  for (const tableName of service.BASELINE_TABLE_NAMES) {
    assert.equal(fullTableNames.has(tableName), false);
  }
  assert.equal(fullTableNames.has('FACT_SALES'), true);
  assert.equal(fullTableNames.has('DIM_CUSTOMER'), true);
});

test('load column resolution rejects older typed tables with generated identity columns', () => {
  const table = {
    tableName: 'DIM_CUSTOMER',
    columns: [
      { name: 'CUSTOMER_SK' },
      { name: 'CUSTOMER_NAME' },
    ],
  };
  const targetColumns = [
    { name: 'CUSTOMER_SK', dataType: 'NUMBER', dataLength: 22, identity: true },
    { name: 'CUSTOMER_NAME', dataType: 'VARCHAR2', dataLength: 255, identity: false },
  ];

  assert.throws(
    () => service.resolveLoadColumns(table, targetColumns, ['CUSTOMER_SK', 'CUSTOMER_NAME']),
    /generated identity column/
  );
});

test('job status mapping reports demo, running, and complete progress consistently', () => {
  assert.deepEqual(
    service.mapJobStatus(null, [], 26),
    {
      status: 'demo',
      progress: 0,
      message: 'Provisioned demo data is loaded. Full warehouse data has not been requested.',
      completedTables: 0,
      totalTables: 26,
      rowsLoaded: 0,
      currentTable: null,
    }
  );

  const running = service.mapJobStatus({
    STATUS: 'RUNNING',
    MESSAGE: 'Loading FACT_SALES.csv...',
    COMPLETED_TABLES: 13,
    TOTAL_TABLES: 26,
    ROWS_LOADED: 1000000,
    CURRENT_TABLE: 'FACT_SALES',
  }, [], 26);
  assert.equal(running.status, 'running');
  assert.equal(running.progress, 50);
  assert.equal(running.currentTable, 'FACT_SALES');

  const complete = service.mapJobStatus({
    STATUS: 'COMPLETE',
    MESSAGE: 'Full warehouse data set loaded.',
    COMPLETED_TABLES: 26,
    TOTAL_TABLES: 26,
    ROWS_LOADED: 2602915,
  }, [], 26);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.progress, 100);
});

test('header-only CSV exports are counted as valid zero-row inputs', async () => {
  const csvPath = path.join(GOLD_DATA_DIR, 'STORE_ADDRESS_GEO.csv');
  assert.equal(await service._private.countCsvRows(csvPath), 0);
});

test('full data load clears the stage and leaves the target empty when a later batch fails', async () => {
  const goldDataDir = makeCsvTempDir({
    'BIG_FACT.csv': makeRows(5001),
  });
  const inventory = [makeTable('BIG_FACT', 'BIG_FACT.csv', 5001)];
  const db = makeMockDb({ failExecuteManyCall: 2 });

  await assert.rejects(
    () => service._private.runFullDataLoad('test-owner', {
      inventory,
      goldDataDir,
      connectionFactory: db.connectionFactory,
    }),
    /mock executeMany failure/
  );

  assert.equal(db.state.tables.get('BIG_FACT').rows.length, 0);
  assert.equal(db.state.tables.has('PG_FULL_DATA_STAGE_BIG_FACT'), false);
  assert.equal(db.state.jobs.get(1).STATUS, 'ERROR');
  assert.match(db.state.jobs.get(1).MESSAGE, /Retry to resume from the last completed table/);
});

test('full data load rolls back target publish before staging cleanup when completion metadata fails', async () => {
  const goldDataDir = makeCsvTempDir({
    'PUBLISH_FACT.csv': makeRows(2),
  });
  const inventory = [makeTable('PUBLISH_FACT', 'PUBLISH_FACT.csv', 2)];
  const db = makeMockDb({ failCompleteTableStatus: true });

  await assert.rejects(
    () => service._private.runFullDataLoad('publish-owner', {
      inventory,
      goldDataDir,
      connectionFactory: db.connectionFactory,
    }),
    /mock completion metadata failure/
  );

  assert.equal(db.state.tables.get('PUBLISH_FACT').rows.length, 0);
  assert.equal(db.state.tables.has('PG_FULL_DATA_STAGE_PUBLISH_FACT'), false);
  assert.equal(db.state.jobs.get(1).STATUS, 'ERROR');
});

test('full data load retries from completed tables without duplicating committed rows', async () => {
  const goldDataDir = makeCsvTempDir({
    'FIRST_FACT.csv': makeRows(2),
    'SECOND_FACT.csv': makeRows(2),
  });
  const inventory = [
    makeTable('FIRST_FACT', 'FIRST_FACT.csv', 2),
    makeTable('SECOND_FACT', 'SECOND_FACT.csv', 2),
  ];
  const firstAttempt = makeMockDb({ failExecuteManyCall: 2 });

  await assert.rejects(
    () => service._private.runFullDataLoad('first-owner', {
      inventory,
      goldDataDir,
      connectionFactory: firstAttempt.connectionFactory,
    }),
    /mock executeMany failure/
  );
  assert.equal(firstAttempt.state.tables.get('FIRST_FACT').rows.length, 2);
  assert.equal(firstAttempt.state.tables.get('SECOND_FACT').rows.length, 0);
  assert.equal(firstAttempt.state.tableStatuses.get('FIRST_FACT').STATUS, 'COMPLETE');

  const secondAttempt = {
    state: firstAttempt.state,
    connectionFactory: firstAttempt.connectionFactory,
  };
  const result = await service._private.runFullDataLoad('second-owner', {
    inventory,
    goldDataDir,
    connectionFactory: secondAttempt.connectionFactory,
  });

  assert.equal(result.status, 'complete');
  assert.equal(secondAttempt.state.tables.get('FIRST_FACT').rows.length, 2);
  assert.equal(secondAttempt.state.tables.get('SECOND_FACT').rows.length, 2);
  assert.equal(secondAttempt.state.jobs.get(1).ROWS_LOADED, 4);
});

test('full data load returns persisted status and leaves state unchanged when another session owns the lock', async () => {
  const goldDataDir = makeCsvTempDir({
    'LOCKED_FACT.csv': makeRows(1),
  });
  const inventory = [makeTable('LOCKED_FACT', 'LOCKED_FACT.csv', 1)];
  const db = makeMockDb({ lockHeld: true });

  const result = await service._private.runFullDataLoad('locked-owner', {
    inventory,
    goldDataDir,
    connectionFactory: db.connectionFactory,
  });

  assert.equal(result.status, 'demo');
  assert.equal(db.state.tables.has('LOCKED_FACT'), false);
  assert.equal(db.state.tableStatuses.size, 0);
  assert.equal(db.state.jobs.has(1), false);
});

test('full data load accepts header-only CSVs even when manifest row counts are stale', async () => {
  const goldDataDir = makeCsvTempDir({
    'EMPTY_DIM.csv': 'ID,NAME\n',
  });
  const inventory = [makeTable('EMPTY_DIM', 'EMPTY_DIM.csv', 42)];
  const db = makeMockDb();

  const result = await service._private.runFullDataLoad('header-only-owner', {
    inventory,
    goldDataDir,
    connectionFactory: db.connectionFactory,
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.rowsLoaded, 0);
  assert.equal(db.state.tables.get('EMPTY_DIM').rows.length, 0);
  assert.equal(db.state.tableStatuses.get('EMPTY_DIM').STATUS, 'COMPLETE');
  assert.equal(db.state.tableStatuses.get('EMPTY_DIM').EXPECTED_ROWS, 42);
});

test('full data status marks persisted running jobs as interrupted when the lock is free', async () => {
  const inventory = [makeTable('INTERRUPTED_FACT', 'INTERRUPTED_FACT.csv', 1)];
  const db = makeMockDb();
  db.state.jobs.set(1, {
    ID: 1,
    STATUS: 'RUNNING',
    CURRENT_TABLE: 'INTERRUPTED_FACT',
    TOTAL_TABLES: 1,
    COMPLETED_TABLES: 0,
    ROWS_LOADED: 0,
    MESSAGE: 'Loading INTERRUPTED_FACT.csv...',
  });

  const status = await service.getFullDataLoadStatus({
    inventory,
    connectionFactory: db.connectionFactory,
  });

  assert.equal(status.status, 'error');
  assert.match(status.message, /interrupted/);
  assert.match(status.error, /previous import session is no longer running/);
});

test('quoted mixed-case export columns stay distinct in inventory and CSV mapping', () => {
  const table = service.readGoldDataInventory(GOLD_DATA_DIR, GOLD_DATA_MANIFEST)
    .find(item => item.tableName === 'STORE_ADDRESS_GEO');
  assert(table.columns.some(column => column.name === 'houseNumber'));
  assert(table.columns.some(column => column.name === 'street'));
  assert(table.columns.some(column => column.name === 'STREET'));
  const resolved = service.resolveLoadColumns(table, table.columns, table.columns.map(column => column.name));
  assert.equal(resolved.find(column => column.name === 'street').csvHeader, 'street');
  assert.equal(resolved.find(column => column.name === 'STREET').csvHeader, 'STREET');
});
