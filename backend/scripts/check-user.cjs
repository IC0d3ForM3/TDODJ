const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const p = new Pool({ connectionString: 'postgresql://postgres.ubbazbmjbdjpybqnindj:DnDi3o4i1%2B4lope22@aws-1-us-east-2.pooler.supabase.com:5432/postgres' });

async function fixPassword() {
  // Find all users whose password doesn't start with $2b$ (not bcrypt hashed)
  const { rows } = await p.query("SELECT id, username, password FROM users WHERE password NOT LIKE '$2b$%'");
  console.log(`Found ${rows.length} user(s) with unhashed passwords`);
  for (const user of rows) {
    const hashed = await bcrypt.hash(user.password, 10);
    await p.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, user.id]);
    console.log(`Hashed password for: ${user.username}`);
  }
  console.log('Done.');
  p.end();
}

fixPassword().catch(e => { console.error(e.message); p.end(); });
