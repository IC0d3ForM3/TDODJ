export const getAllUsers = async (): Promise<Omit<UserRecord, 'password'>[]> => {
    const { rows } = await pool.query(
        'SELECT id, username, email, isactive, isconfirmed, isadmin, ismasteradmin, iscreator, key FROM users'
    );
    return rows;
};
import pool from '../db';

export interface UserRecord {
    id: number;
    username: string;
    password: string;
    email: string;
    isactive: boolean;
    isconfirmed: boolean;
    isadmin: boolean;
    ismasteradmin: boolean;
    iscreator: boolean;
    key: string;
}

export const getUserById = async (id: number): Promise<UserRecord | null> => {
    const { rows } = await pool.query<UserRecord>(
        'SELECT * FROM users WHERE id = $1',
        [id]
    );
    return rows[0] || null;
};


export const isEmailUsed = async (email: string): Promise<boolean> => {
    const { rows } = await pool.query(
        'SELECT 1 FROM users WHERE email = $1 LIMIT 1',
        [email]
    );
    return rows.length > 0;
};

export interface NewUser {
    username: string;
    email: string;
    password: string;
}

export interface UserFlagUpdate {
    isactive: boolean;
    isadmin: boolean;
    iscreator: boolean;
}

export interface LoginUserRecord {
    username: string;
    key: string;
    isadmin: boolean;
    ismasteradmin: boolean;
    iscreator: boolean;
}

export const insertUser = async (user: NewUser): Promise<boolean> => {
    try {
        await pool.query(
            `INSERT INTO users (username, email, password, isactive, isconfirmed, isadmin, ismasteradmin, iscreator, key)
       VALUES ($1, $2, $3, false, false, false, false, false, gen_random_uuid())`,
            [user.username, user.email, user.password]
        );
        return true;
    } catch (err) {
        return false;
    }
};

export const updateUserFlags = async (
    id: number,
    flags: UserFlagUpdate
): Promise<Omit<UserRecord, 'password'> | null> => {
    const { rows } = await pool.query<Omit<UserRecord, 'password'>>(
        `UPDATE users
         SET isactive = $1,
             isadmin = $2,
             iscreator = $3
         WHERE id = $4
         RETURNING id, username, email, isactive, isconfirmed, isadmin, ismasteradmin, iscreator, key`,
        [flags.isactive, flags.isadmin, flags.iscreator, id]
    );
    return rows[0] || null;
};



export const getActiveUserByCredentials = async (username: string, password: string): Promise<LoginUserRecord | null> => {
    const { rows } = await pool.query<LoginUserRecord>(
        'SELECT username, key, isadmin, ismasteradmin, iscreator FROM users WHERE username = $1 AND password = $2 AND isactive = true',
        [username, password]
    );
    return rows[0] || null;
};

export const getUserByKey = async (key: string): Promise<UserRecord | null> => {
    const { rows } = await pool.query<UserRecord>(
        'SELECT id, username, email, isactive, isconfirmed, isadmin, ismasteradmin, iscreator, key FROM users WHERE key = $1 AND isactive = true LIMIT 1',
        [key]
    );
    return rows[0] || null;
};

