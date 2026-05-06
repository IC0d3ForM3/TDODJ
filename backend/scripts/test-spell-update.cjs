const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.prod.env') });
const https = require('https');
const http = require('http');

// Get the userguid from the DB for the admin user who owns spell id=13
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function testSpellUpdate() {
  await client.connect();
  
  // Get userguid of spell 13
  const res = await client.query(`SELECT id, name, userguid, effecttype, effectcolor FROM spells WHERE id = 13`);
  const spell = res.rows[0];
  console.log('Before update:', spell);
  
  const userguid = spell.userguid;
  
  // Use the API_BASE_URL from environment or default to the production API
  const apiBase = process.env.API_BASE_URL || 'https://api.tdodj.com';
  const url = new URL(`/spells/13`, apiBase);
  
  const payload = JSON.stringify({
    userkey: userguid,
    spell: {
      name: spell.name,
      description: '',
      effectType: 'Lightning',
      effectColor: '#4466ff',
      effectOn: 'HP',
      effectOn2: '',
      range: 1,
      range1: 1,
      range2: 0,
      lastFor: 0,
      lastFor1: 0,
      lastFor2: 0,
      effectAmount: -10,
      effectAmount2: 0,
      value: 10,
      sp: 0,
      successTestValue: 5,
      magicCost: 2,
      costToLearn: 0,
      imageId: null,
      soundId: 1,
      isPublic: true,
      numberOfTargets: 1,
      effectOnPc1: false,
      effectOnPc2: false,
    }
  });
  
  console.log('\nSending PUT to', url.toString(), 'with effectType=Lightning, effectColor=#4466ff');
  
  const protocol = url.protocol === 'https:' ? https : http;
  
  await new Promise((resolve, reject) => {
    const req = protocol.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      }
    }, (res2) => {
      let data = '';
      res2.on('data', (chunk) => data += chunk);
      res2.on('end', () => {
        console.log('API response status:', res2.statusCode);
        try { console.log('API response body:', JSON.parse(data)); } catch { console.log('API response body (raw):', data); }
        resolve(undefined);
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
  
  // Now check the DB
  const after = await client.query(`SELECT id, name, effecttype, effectcolor FROM spells WHERE id = 13`);
  console.log('\nAfter update (DB check):', after.rows[0]);
  
  await client.end();
}

testSpellUpdate().catch(e => { console.error(e.message); client.end(); });
