const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const useSSL = (process.env.DATABASE_URL || '').includes('sslmode=require');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || '',
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[,"\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

async function main() {
  const { rows } = await pool.query(`
    SELECT
      i.id,
      i.userguid::text AS userguid,
      COALESCE(u.username, '') AS username,
      i.name,
      i.description,
      i.type,
      COALESCE(NULLIF(i.range, '')::int, 0) AS range,
      i.value,
      i.weight,
      i.curseid AS "curseId",
      COALESCE(i.effectvalue, 0) AS "effectValue",
      COALESCE(i.damage, 0) AS damage,
      i.armorslot AS "armorSlot",
      i.effecton AS "effectOn",
      i.effecttopc AS "effectToPc",
      COALESCE(i.effecttopcvalue, 0) AS "effectToPcValue",
      COALESCE(i.weaponeffecttype, 'Blood') AS "weaponEffectType",
      COALESCE(i.weaponeffectcolor, '#cc0000') AS "weaponEffectColor",
      i.imageid AS "imageId",
      img.name AS "imageName",
      img.path AS "imagePath",
      img.assettype::text AS "imageAssetType",
      img.ispublic AS "imageIsPublic",
      img.isactive AS "imageIsActive",
      i.soundid AS "soundId",
      snd.name AS "soundName",
      snd.path AS "soundPath",
      snd.assettype::text AS "soundAssetType",
      snd.ispublic AS "soundIsPublic",
      snd.isactive AS "soundIsActive",
      i.ispublic AS "isPublic",
      COALESCE(i.istwohanded, false) AS "isTwoHanded",
      i.uses,
      i.createdat::text AS "createdAt",
      i.updatedat::text AS "updatedAt"
    FROM items i
    LEFT JOIN users u ON u.key::text = i.userguid::text
    LEFT JOIN images img ON img.id = i.imageid
    LEFT JOIN sounds snd ON snd.id = i.soundid
    ORDER BY LOWER(i.name) ASC, i.id ASC
  `);

  const headers = [
    'id', 'userguid', 'username', 'name', 'description', 'type', 'range', 'value', 'weight',
    'curseId', 'effectValue', 'damage', 'armorSlot', 'effectOn', 'effectToPc', 'effectToPcValue',
    'weaponEffectType', 'weaponEffectColor', 'imageId', 'imageName', 'imagePath', 'imageAssetType',
    'imageIsPublic', 'imageIsActive', 'soundId', 'soundName', 'soundPath', 'soundAssetType',
    'soundIsPublic', 'soundIsActive', 'isPublic', 'isTwoHanded', 'uses', 'createdAt', 'updatedAt',
  ];

  const outputDir = path.resolve(__dirname, '../../exports');
  const outputFile = path.join(outputDir, 'items-with-images-and-sounds.csv');
  fs.mkdirSync(outputDir, { recursive: true });

  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  }

  fs.writeFileSync(outputFile, lines.join('\r\n') + '\r\n', 'utf8');
  console.log(`Wrote ${rows.length} rows to ${outputFile}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });