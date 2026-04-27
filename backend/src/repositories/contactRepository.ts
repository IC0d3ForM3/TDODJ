import pool from '../db';

export interface ContactRequest {
  id: number;
  name: string;
  email: string;
  problem: string;
  username: string | null;
  message: string;
  createdat: string;
  isread: boolean;
  isresponded: boolean;
}

export interface NewContactRequest {
  name: string;
  email: string;
  problem: string;
  username?: string;
  message: string;
}

export const insertContactRequest = async (req: NewContactRequest): Promise<boolean> => {
  try {
    await pool.query(
      `INSERT INTO contact_requests (name, email, problem, username, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.name, req.email, req.problem, req.username || null, req.message]
    );
    return true;
  } catch {
    return false;
  }
};

export const getAllContactRequests = async (): Promise<ContactRequest[]> => {
  const { rows } = await pool.query<ContactRequest>(
    'SELECT * FROM contact_requests ORDER BY createdat DESC'
  );
  return rows;
};

export const updateContactFlags = async (
  id: number,
  isread: boolean,
  isresponded: boolean
): Promise<ContactRequest | null> => {
  const { rows } = await pool.query<ContactRequest>(
    `UPDATE contact_requests SET isread = $1, isresponded = $2 WHERE id = $3 RETURNING *`,
    [isread, isresponded, id]
  );
  return rows[0] || null;
};
