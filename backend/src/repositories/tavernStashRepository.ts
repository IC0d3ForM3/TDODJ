import pool from '../db';

export interface TavernStashItem {
  id: number;
  name: string;
  description: string;
  type: string;
  gold: number;
  silver: number;
  copper: number;
  zinc: number;
  spReward: number;
  imageId: number | null;
  soundId: number | null;
  isquest: boolean;
}

export const getStash = async (userguid: string): Promise<TavernStashItem[]> => {
  const result = await pool.query<{ stash_json: unknown }>(
    `SELECT stash_json FROM tavern_stash WHERE userguid = $1`,
    [userguid]
  );
  if (result.rows.length === 0) return [];
  const raw = result.rows[0].stash_json;
  return Array.isArray(raw) ? (raw as TavernStashItem[]) : [];
};

export const depositToStash = async (
  userguid: string,
  items: TavernStashItem[]
): Promise<TavernStashItem[]> => {
  const existing = await getStash(userguid);
  const updated = [...existing, ...items];
  await pool.query(
    `INSERT INTO tavern_stash (userguid, stash_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (userguid) DO UPDATE SET stash_json = EXCLUDED.stash_json`,
    [userguid, JSON.stringify(updated)]
  );
  return updated;
};

export const withdrawFromStash = async (
  userguid: string,
  itemIndexes: number[]
): Promise<{ remaining: TavernStashItem[]; withdrawn: TavernStashItem[] }> => {
  const existing = await getStash(userguid);
  const indexSet = new Set(itemIndexes);
  const remaining = existing.filter((_, i) => !indexSet.has(i));
  const withdrawn = existing.filter((_, i) => indexSet.has(i));

  await pool.query(
    `INSERT INTO tavern_stash (userguid, stash_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (userguid) DO UPDATE SET stash_json = EXCLUDED.stash_json`,
    [userguid, JSON.stringify(remaining)]
  );
  return { remaining, withdrawn };
};
