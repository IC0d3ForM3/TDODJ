#!/usr/bin/env node
/**
 * Reset DMMaster user password (LOCAL DEV ONLY)
 * Reads DATABASE_URL from .env file directly
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

// Read .env file manually
const envPath = path.join(__dirname, '..', '.env');
let databaseUrl = null;

try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/DATABASE_URL\s*=\s*(.+)/);
  if (match) {
    databaseUrl = match[1].trim();
    // Remove quotes if present
    if ((databaseUrl.startsWith('"') && databaseUrl.endsWith('"')) ||
        (databaseUrl.startsWith("'") && databaseUrl.endsWith("'"))) {
      databaseUrl = databaseUrl.slice(1, -1);
    }
  }
} catch (err) {
  console.error('❌ Error reading .env file:', err.message);
  process.exit(1);
}

if (!databaseUrl) {
  console.error('❌ DATABASE_URL not found in .env file');
  process.exit(1);
}

const newPassword = process.argv[2] || 'test123';
console.log(`🔄 Resetting DMMaster password to: ${newPassword}`);

(async () => {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    console.log('✓ Connected to database');

    // Check if user exists in users table
    const userResult = await client.query(
      'SELECT id, username, isactive FROM users WHERE username = $1',
      ['DMMaster']
    );

    if (userResult.rows.length === 0) {
      console.error('❌ User "DMMaster" not found in users table');
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log(`✓ User found: DMMaster (id: ${user.id}, active: ${user.isactive})`);

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const updateResult = await client.query(
      'UPDATE users SET password = $1, isactive = true WHERE id = $2 RETURNING username, isactive',
      [hashedPassword, user.id]
    );

    console.log(`✅ Password reset successfully!`);
    console.log(`   Username: ${updateResult.rows[0].username}`);
    console.log(`   Active: ${updateResult.rows[0].isactive}`);
    console.log(`\n✅ You can now login with:`);
    console.log(`   Username: DMMaster`);
    console.log(`   Password: ${newPassword}`);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
