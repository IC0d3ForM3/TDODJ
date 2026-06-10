#!/usr/bin/env node
/**
 * Reset a user's password and ensure they are active
 * Usage: node reset-user-password.cjs <username> <new-password>
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool();
const username = process.argv[2];
const newPassword = process.argv[3];

if (!username || !newPassword) {
  console.error('Usage: node reset-user-password.cjs <username> <new-password>');
  process.exit(1);
}

(async () => {
  try {
    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, username, email, isactive FROM pc WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      console.error(`❌ User "${username}" not found`);
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log(`✓ User found: ${username} (id: ${user.id})`);
    console.log(`  Active: ${user.isactive}`);

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and set active=true
    await pool.query(
      'UPDATE pc SET password = $1, isactive = true WHERE id = $2',
      [hashedPassword, user.id]
    );

    console.log(`✓ Password reset and user marked as active`);
    console.log(`\n✅ Success! User "${username}" can now login with the new password.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    pool.end();
  }
})();
