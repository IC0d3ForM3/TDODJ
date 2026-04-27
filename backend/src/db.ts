import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const useSSL = (process.env.DATABASE_URL || '').includes('sslmode=require');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || '',
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

export default pool;
