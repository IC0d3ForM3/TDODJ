#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const backendRoot = path.resolve(__dirname, '..');
const backupsDir = path.join(backendRoot, 'backups');
fs.mkdirSync(backupsDir, { recursive: true });

const localEnv = dotenv.parse(fs.readFileSync(path.join(backendRoot, '.env'), 'utf8'));
const prodEnv = dotenv.parse(fs.readFileSync(path.join(backendRoot, '.prod.env'), 'utf8'));

const localUrl = localEnv.DATABASE_URL;
const prodUrl = prodEnv.DATABASE_URL || localEnv.DATABASE_URL_Remote || localEnv.DATABASE_URLRemote;

if (!localUrl) {
  throw new Error('Missing DATABASE_URL in backend/.env');
}
if (!prodUrl) {
  throw new Error('Missing prod database URL (expected DATABASE_URL in backend/.prod.env)');
}

const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const backupPath = path.join(backupsDir, `local_pre_restore_${ts}.json`);

function qIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function connectClients() {
  const local = new Client({ connectionString: localUrl });
  const prod = new Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
  await local.connect();
  await prod.connect();
  return { local, prod };
}

async function getPublicTables(client) {
  const res = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  return res.rows.map((r) => r.tablename);
}

async function getTableColumns(client, tableName) {
  const res = await client.query(
    `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position`,
    [tableName]
  );
  return res.rows.map((r) => ({
    name: r.column_name,
    dataType: r.data_type,
    udtName: r.udt_name,
  }));
}

async function tableHasIdentityAlwaysColumn(client, tableName) {
  const res = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND is_identity = 'YES'
        AND identity_generation = 'ALWAYS'
      LIMIT 1`,
    [tableName]
  );
  return res.rowCount > 0;
}

async function backupLocal(local, tables) {
  const payload = {
    createdAt: new Date().toISOString(),
    source: 'local-before-prod-restore',
    tables: {},
  };

  for (const table of tables) {
    const cols = await getTableColumns(local, table);
    const sql = `SELECT * FROM ${qIdent(table)}`;
    const rows = (await local.query(sql)).rows;
    payload.tables[table] = { columns: cols, rows };
    console.log(`[backup] ${table}: ${rows.length} rows`);
  }

  fs.writeFileSync(backupPath, JSON.stringify(payload));
  console.log(`\n[backup] wrote ${backupPath}`);
}

async function topoSortByFk(client, tables) {
  const tableSet = new Set(tables);
  const deps = new Map(tables.map((t) => [t, new Set()]));

  const fk = await client.query(`
    SELECT
      tc.table_name AS child_table,
      ccu.table_name AS parent_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_schema = 'public'
  `);

  for (const row of fk.rows) {
    if (!tableSet.has(row.child_table) || !tableSet.has(row.parent_table)) continue;
    deps.get(row.child_table).add(row.parent_table);
  }

  const remaining = new Set(tables);
  const sorted = [];

  while (remaining.size > 0) {
    const ready = [...remaining].filter((t) => {
      const d = deps.get(t);
      for (const dep of d) {
        if (remaining.has(dep)) return false;
      }
      return true;
    }).sort((a, b) => a.localeCompare(b));

    if (ready.length === 0) {
      // Fallback for cycles: process remaining alphabetically.
      sorted.push(...[...remaining].sort((a, b) => a.localeCompare(b)));
      break;
    }

    for (const t of ready) {
      remaining.delete(t);
      sorted.push(t);
    }
  }

  return sorted;
}

function normalizeValueForColumn(column, value) {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }

  const isJsonColumn = column.udtName === 'json' || column.udtName === 'jsonb';
  if (!isJsonColumn) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      // Preserve invalid JSON text as a JSON string literal so insert succeeds.
      return JSON.stringify(value);
    }
  }

  return JSON.stringify(value);
}

async function insertRows(local, table, columns, rows, overrideIdentity = false) {
  if (rows.length === 0 || columns.length === 0) return;

  const colSql = columns.map((c) => qIdent(c.name)).join(', ');
  const batches = chunk(rows, 300);

  for (const batch of batches) {
    const values = [];
    const placeholders = [];
    let idx = 1;

    for (const row of batch) {
      const rowPlace = [];
      for (const col of columns) {
        rowPlace.push(`$${idx++}`);
        values.push(normalizeValueForColumn(col, row[col.name]));
      }
      placeholders.push(`(${rowPlace.join(', ')})`);
    }

    const overrideClause = overrideIdentity ? ' OVERRIDING SYSTEM VALUE' : '';
    const sql = `INSERT INTO ${qIdent(table)} (${colSql})${overrideClause} VALUES ${placeholders.join(', ')}`;
    await local.query(sql, values);
  }
}

async function resetSequences(local) {
  const seqRes = await local.query(`
    SELECT
      c.table_name,
      c.column_name,
      pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) AS seq_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_default LIKE 'nextval(%'
  `);

  for (const row of seqRes.rows) {
    if (!row.seq_name) continue;
    const sql = `
      SELECT setval(
        $1,
        COALESCE((SELECT MAX(${qIdent(row.column_name)}) FROM ${qIdent(row.table_name)}), 1),
        EXISTS(SELECT 1 FROM ${qIdent(row.table_name)})
      )
    `;
    await local.query(sql, [row.seq_name]);
  }
}

async function restoreProdToLocal(local, prod, tables) {
  const loadOrder = await topoSortByFk(local, tables);
  const truncList = loadOrder.map(qIdent).join(', ');

  await local.query('BEGIN');
  try {
    await local.query(`TRUNCATE TABLE ${truncList} RESTART IDENTITY CASCADE`);

    for (const table of loadOrder) {
      const prodColumns = await getTableColumns(prod, table);
      const localColumns = await getTableColumns(local, table);
      const localColumnByName = new Map(localColumns.map((c) => [c.name, c]));
      const columns = prodColumns
        .filter((c) => localColumnByName.has(c.name))
        .map((c) => localColumnByName.get(c.name));

      if (columns.length === 0) {
        console.log(`[restore] ${table}: skipped (no shared columns)`);
        continue;
      }

      const overrideIdentity = await tableHasIdentityAlwaysColumn(local, table);
      const selectCols = columns.map((c) => qIdent(c.name)).join(', ');
      const rows = (await prod.query(`SELECT ${selectCols} FROM ${qIdent(table)}`)).rows;
      try {
        await insertRows(local, table, columns, rows, overrideIdentity);
        console.log(`[restore] ${table}: ${rows.length} rows`);
      } catch (err) {
        throw new Error(`restore failed for table ${table}: ${err.message || err}`);
      }
    }

    await resetSequences(local);
    await local.query('COMMIT');
  } catch (err) {
    await local.query('ROLLBACK');
    throw err;
  }
}

async function verifyCounts(local, prod, tables) {
  let mismatch = 0;
  for (const table of tables) {
    const localCount = Number((await local.query(`SELECT COUNT(*)::int AS c FROM ${qIdent(table)}`)).rows[0].c);
    const prodCount = Number((await prod.query(`SELECT COUNT(*)::int AS c FROM ${qIdent(table)}`)).rows[0].c);
    if (localCount !== prodCount) {
      mismatch++;
      console.log(`[verify] mismatch ${table}: local=${localCount} prod=${prodCount}`);
    }
  }
  if (mismatch === 0) {
    console.log('[verify] all table counts match');
  } else {
    console.log(`[verify] ${mismatch} table(s) have count mismatches`);
  }
}

(async () => {
  const { local, prod } = await connectClients();
  try {
    const localTables = await getPublicTables(local);
    const prodTables = await getPublicTables(prod);
    const tableSet = new Set(localTables.filter((t) => prodTables.includes(t)));
    const tables = [...tableSet].sort((a, b) => a.localeCompare(b));

    console.log(`[info] common public tables: ${tables.length}`);

    await backupLocal(local, tables);
    await restoreProdToLocal(local, prod, tables);
    await verifyCounts(local, prod, tables);

    console.log('\nDone: prod restored into local successfully.');
  } finally {
    await Promise.allSettled([local.end(), prod.end()]);
  }
})().catch((err) => {
  console.error('Sync failed:', err.message || err);
  process.exit(1);
});
