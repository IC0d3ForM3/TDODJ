#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const backendRoot = path.resolve(__dirname, '..');
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

const args = parseArgs(process.argv.slice(2));
if (!Number.isInteger(args.id) || args.id <= 0) {
  printUsage('Missing or invalid --id.');
  process.exit(1);
}

const localClient = new Client({ connectionString: localUrl });
const prodClient = new Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });

main().catch((error) => {
  console.error(`\nPush failed: ${error.message || error}`);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.allSettled([localClient.end(), prodClient.end()]);
});

async function main() {
  await localClient.connect();
  await prodClient.connect();

  const localColumns = await getTableColumns(localClient, 'dungons');
  const prodColumns = await getTableColumns(prodClient, 'dungons');
  const prodColumnSet = new Set(prodColumns);

  const localRow = await getLocalDungonById(args.id);
  if (!localRow) {
    throw new Error(`Local dungon with id=${args.id} was not found.`);
  }

  const row = mapAndNormalizeRow(localRow, prodColumnSet, args);

  // If target image does not exist in prod, clear imageid to avoid FK violation.
  if (row.imageid != null && prodColumnSet.has('imageid')) {
    const hasImage = await existsById(prodClient, 'images', Number(row.imageid));
    if (!hasImage) {
      console.warn(`Warning: imageid=${row.imageid} does not exist in prod, setting imageid=NULL.`);
      row.imageid = null;
    }
  }

  const insertColumns = Object.keys(row).filter((column) => prodColumnSet.has(column));
  if (!insertColumns.includes('id')) {
    insertColumns.unshift('id');
    row.id = args.id;
  }

  const values = insertColumns.map((column) => row[column]);
  const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ');
  const colSql = insertColumns.map((column) => qIdent(column)).join(', ');
  const updateColumns = insertColumns.filter((column) => column !== 'id');

  if (updateColumns.length === 0) {
    throw new Error('No updatable columns were found for prod dungons table.');
  }

  const updateSql = updateColumns
    .map((column) => `${qIdent(column)} = EXCLUDED.${qIdent(column)}`)
    .join(', ');

  const sql = `
    INSERT INTO ${qIdent('dungons')} (${colSql})
    OVERRIDING SYSTEM VALUE
    VALUES (${placeholders})
    ON CONFLICT (id)
    DO UPDATE SET ${updateSql}
  `;

  if (args.dryRun) {
    console.log('Dry run enabled. No write performed.');
    console.log(`Would upsert dungon id=${args.id} with ${insertColumns.length} columns:`);
    console.log(insertColumns.join(', '));
    return;
  }

  await prodClient.query('BEGIN');
  try {
    await prodClient.query(sql, values);
    await prodClient.query('COMMIT');
  } catch (error) {
    await prodClient.query('ROLLBACK');
    throw error;
  }

  const mode = args.publish ? 'published' : 'synced';
  console.log(`Success: dungon id=${args.id} ${mode} to production.`);
  if (args.prodUserKey) {
    console.log(`Owner remap applied to: ${args.prodUserKey}`);
  }
}

function mapAndNormalizeRow(localRow, prodColumnSet, cliArgs) {
  const row = { ...localRow };

  // Keep JSON fields as JSON strings where needed.
  if (prodColumnSet.has('dungenJson') && row.dungenJson == null && row.dungonjson != null) {
    row.dungenJson = row.dungonjson;
  }

  // Align owner columns for differing schemas.
  const owner = cliArgs.prodUserKey || row.userkey || row.userguid || row.key || null;
  if (owner) {
    if (prodColumnSet.has('userkey')) row.userkey = owner;
    if (prodColumnSet.has('userguid')) row.userguid = owner;
    if (prodColumnSet.has('key')) row.key = owner;
  }

  // Optional auto-publish on push.
  if (cliArgs.publish) {
    if (prodColumnSet.has('status')) row.status = 'published';
    if (prodColumnSet.has('ispublic')) row.ispublic = true;
    if (prodColumnSet.has('ispublished')) row.ispublished = true;
    if (prodColumnSet.has('isapproved')) row.isapproved = true;
  }

  // Never carry approved metadata if status is not approved.
  if (prodColumnSet.has('status') && row.status !== 'approved') {
    if (prodColumnSet.has('approvedby')) row.approvedby = null;
    if (prodColumnSet.has('approveddate')) row.approveddate = null;
  }

  return row;
}

async function getLocalDungonById(id) {
  const res = await localClient.query('SELECT * FROM dungons WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

async function getTableColumns(client, tableName) {
  const res = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position`,
    [tableName]
  );
  return res.rows.map((row) => row.column_name);
}

async function existsById(client, tableName, id) {
  const res = await client.query(`SELECT 1 FROM ${qIdent(tableName)} WHERE id = $1 LIMIT 1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

function parseArgs(argv) {
  const parsed = {
    id: null,
    publish: false,
    dryRun: false,
    prodUserKey: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--id') {
      parsed.id = Number.parseInt(argv[i + 1], 10);
      i += 1;
      continue;
    }

    if (arg === '--publish') {
      parsed.publish = true;
      continue;
    }

    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

    if (arg === '--prod-userkey') {
      parsed.prodUserKey = (argv[i + 1] || '').trim() || null;
      i += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return parsed;
}

function printUsage(prefixMessage) {
  if (prefixMessage) {
    console.error(prefixMessage);
  }
  console.log(`
Usage:
  node scripts/push-dungon-to-prod.cjs --id <dungonId> [--publish] [--prod-userkey <uuid>] [--dry-run]

Examples:
  node scripts/push-dungon-to-prod.cjs --id 123
  node scripts/push-dungon-to-prod.cjs --id 123 --publish
  node scripts/push-dungon-to-prod.cjs --id 123 --prod-userkey bbd61968-4aba-4200-bb4f-53eb8eb91247
`);
}

function qIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}
