import pool from '../db';

export interface DailyHitsRecord {
  id: number;
  homehits: number;
  logins: number;
  datetime: string;
}

const upsertIncrement = async (field: 'homehits' | 'logins'): Promise<DailyHitsRecord> => {
  const { rows } = await pool.query<DailyHitsRecord>(
    `INSERT INTO dailyhits (datetime, ${field})
     VALUES (CURRENT_DATE, 1)
     ON CONFLICT (datetime)
     DO UPDATE SET ${field} = dailyhits.${field} + 1
     RETURNING id, homehits, logins, datetime`
  );
  return rows[0];
};

export const incrementHomeHits = async (): Promise<DailyHitsRecord> => {
  return upsertIncrement('homehits');
};

export const incrementLogins = async (): Promise<DailyHitsRecord> => {
  return upsertIncrement('logins');
};

export const getRecentDailyHits = async (limit = 30): Promise<DailyHitsRecord[]> => {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 30;
  const { rows } = await pool.query<DailyHitsRecord>(
    `SELECT id, homehits, logins, datetime
     FROM dailyhits
     ORDER BY datetime DESC
     LIMIT $1`,
    [safeLimit]
  );
  return rows;
};
