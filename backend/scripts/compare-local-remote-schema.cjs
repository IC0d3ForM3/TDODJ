const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const LOCAL_URL = process.env.DATABASE_URL;
const REMOTE_URL = process.env.DATABASE_URL_Remote || process.env.DATABASE_URLRemote;

if (!LOCAL_URL) {
  console.error('DATABASE_URL is not set in backend/.env');
  process.exit(1);
}

if (!REMOTE_URL) {
  console.error('DATABASE_URL_Remote is not set in backend/.env');
  process.exit(1);
}

const LOCAL_NAME = 'local';
const REMOTE_NAME = 'remote';

function createClient(url, useSsl) {
  return new Client({
    connectionString: url,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

async function fetchSchema(client) {
  const tablesRes = await client.query(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`
  );

  const colsRes = await client.query(
    `SELECT
       table_name,
       column_name,
       data_type,
       udt_name,
       is_nullable,
       column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`
  );

  const tables = tablesRes.rows.map((r) => r.tablename);
  const columnsByTable = new Map();

  for (const row of colsRes.rows) {
    if (!columnsByTable.has(row.table_name)) {
      columnsByTable.set(row.table_name, []);
    }

    columnsByTable.get(row.table_name).push({
      name: row.column_name,
      type: row.data_type,
      udt: row.udt_name,
      nullable: row.is_nullable,
      defaultValue: row.column_default,
    });
  }

  return { tables, columnsByTable };
}

function toSet(values) {
  return new Set(values);
}

function difference(a, b) {
  return [...a].filter((v) => !b.has(v)).sort((x, y) => x.localeCompare(y));
}

function compareColumns(localCols, remoteCols) {
  const localMap = new Map(localCols.map((c) => [c.name, c]));
  const remoteMap = new Map(remoteCols.map((c) => [c.name, c]));

  const localNames = toSet(localMap.keys());
  const remoteNames = toSet(remoteMap.keys());

  const missingOnRemote = difference(localNames, remoteNames);
  const extraOnRemote = difference(remoteNames, localNames);

  const changed = [];
  for (const name of [...localNames].sort((a, b) => a.localeCompare(b))) {
    if (!remoteMap.has(name)) continue;

    const l = localMap.get(name);
    const r = remoteMap.get(name);
    const diffs = [];

    if (l.type !== r.type || l.udt !== r.udt) {
      diffs.push(`type local=${l.type}/${l.udt} remote=${r.type}/${r.udt}`);
    }

    if (l.nullable !== r.nullable) {
      diffs.push(`nullable local=${l.nullable} remote=${r.nullable}`);
    }

    const lDefault = l.defaultValue ?? null;
    const rDefault = r.defaultValue ?? null;
    if (lDefault !== rDefault) {
      diffs.push(`default local=${JSON.stringify(lDefault)} remote=${JSON.stringify(rDefault)}`);
    }

    if (diffs.length > 0) {
      changed.push({ column: name, diffs });
    }
  }

  return { missingOnRemote, extraOnRemote, changed };
}

async function main() {
  const localClient = createClient(LOCAL_URL, false);
  const remoteClient = createClient(REMOTE_URL, true);

  await localClient.connect();
  await remoteClient.connect();

  try {
    const local = await fetchSchema(localClient);
    const remote = await fetchSchema(remoteClient);

    const localTables = toSet(local.tables);
    const remoteTables = toSet(remote.tables);

    const missingTablesOnRemote = difference(localTables, remoteTables);
    const extraTablesOnRemote = difference(remoteTables, localTables);
    const commonTables = [...localTables].filter((t) => remoteTables.has(t)).sort((a, b) => a.localeCompare(b));

    console.log(`Schema comparison: ${LOCAL_NAME} -> ${REMOTE_NAME}`);
    console.log(`Local tables: ${local.tables.length}`);
    console.log(`Remote tables: ${remote.tables.length}`);
    console.log('');

    console.log('Tables missing on remote (need create):');
    if (missingTablesOnRemote.length === 0) {
      console.log('  (none)');
    } else {
      for (const t of missingTablesOnRemote) {
        console.log(`  - ${t}`);
      }
    }

    console.log('');
    console.log('Tables extra on remote (candidate drop):');
    if (extraTablesOnRemote.length === 0) {
      console.log('  (none)');
    } else {
      for (const t of extraTablesOnRemote) {
        console.log(`  - ${t}`);
      }
    }

    console.log('');
    console.log('Column-level differences on common tables:');
    let anyColumnDiff = false;

    for (const table of commonTables) {
      const localCols = local.columnsByTable.get(table) ?? [];
      const remoteCols = remote.columnsByTable.get(table) ?? [];
      const diff = compareColumns(localCols, remoteCols);

      if (diff.missingOnRemote.length === 0 && diff.extraOnRemote.length === 0 && diff.changed.length === 0) {
        continue;
      }

      anyColumnDiff = true;
      console.log(`  * ${table}`);

      if (diff.missingOnRemote.length > 0) {
        console.log(`    - missing on remote: ${diff.missingOnRemote.join(', ')}`);
      }

      if (diff.extraOnRemote.length > 0) {
        console.log(`    - extra on remote: ${diff.extraOnRemote.join(', ')}`);
      }

      for (const c of diff.changed) {
        console.log(`    - ${c.column}: ${c.diffs.join('; ')}`);
      }
    }

    if (!anyColumnDiff) {
      console.log('  (none)');
    }
  } finally {
    await Promise.allSettled([localClient.end(), remoteClient.end()]);
  }
}

main().catch((error) => {
  console.error('Schema comparison failed:', error.message || error);
  process.exit(1);
});
