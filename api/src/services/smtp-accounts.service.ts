import pool from '../db/index.js';
import { logger } from '../utils/logger.js';
import { encrypt as encPwd, tryDecrypt, isEncrypted } from '../utils/crypto.js';
import nodemailer from 'nodemailer';

export interface SmtpAccount {
  id?: string;
  userId: string;
  email: string;
  host: string;
  port: number;
  username?: string;
  password: string;
  security: 'SSL' | 'TLS' | 'STARTTLS' | 'PLAIN' | 'NONE';
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const mapFromDb = (row: any): SmtpAccount => ({
  id: row.id,
  userId: row.user_id,
  email: row.email,
  host: row.host,
  port: row.port,
  username: row.username,
  password: row.password,
  security: row.security,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getSmtpAccountsByUserId = async (userId: string): Promise<SmtpAccount[]> => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, user_id, email, host, port, username, password, security, is_active, created_at, updated_at
       FROM smtp_accounts WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map(mapFromDb);
  } catch (err) {
    logger.error('Error fetching SMTP accounts:', err);
    throw err;
  } finally {
    client.release();
  }
};

export const getSmtpAccountById = async (id: string, userId: string): Promise<SmtpAccount | null> => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, user_id, email, host, port, username, password, security, is_active, created_at, updated_at
       FROM smtp_accounts WHERE id = $1 AND user_id = $2 AND is_active = true`,
      [id, userId]
    );
    if (result.rows.length === 0) return null;
    return mapFromDb(result.rows[0]);
  } catch (err) {
    logger.error('Error fetching SMTP account by ID:', err);
    throw err;
  } finally {
    client.release();
  }
};

export const createSmtpAccount = async (data: SmtpAccount): Promise<SmtpAccount> => {
  const client = await pool.connect();
  try {
    const now = new Date();
    const enc = encPwd(data.password);
    const result = await client.query(
      `INSERT INTO smtp_accounts (user_id, email, host, port, username, password, security, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9)
       RETURNING id, user_id, email, host, port, username, password, security, is_active, created_at, updated_at`,
      [data.userId, data.email, data.host, data.port, data.username || data.email, enc, data.security, now, now]
    );
    return mapFromDb(result.rows[0]);
  } catch (err) {
    logger.error('Error creating SMTP account:', err);
    throw err;
  } finally {
    client.release();
  }
};

export const updateSmtpAccount = async (id: string, userId: string, update: Partial<SmtpAccount>): Promise<SmtpAccount | null> => {
  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT * FROM smtp_accounts WHERE id = $1 AND user_id = $2 AND is_active = true', [id, userId]);
    if (existing.rows.length === 0) return null;

    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    const push = (col: string, val: any) => { fields.push(`${col} = $${i++}`); values.push(val); };

    if (update.email !== undefined) push('email', update.email);
    if (update.host !== undefined) push('host', update.host);
    if (update.port !== undefined) push('port', update.port);
    if (update.username !== undefined) push('username', update.username);
    if (update.password !== undefined) push('password', encPwd(update.password));
    if (update.security !== undefined) push('security', update.security);
    if (update.isActive !== undefined) push('is_active', update.isActive);

    push('updated_at', new Date());

    // where params
    values.push(id, userId);

    const result = await client.query(
      `UPDATE smtp_accounts SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i++}
       RETURNING id, user_id, email, host, port, username, password, security, is_active, created_at, updated_at`,
      values
    );

    return mapFromDb(result.rows[0]);
  } catch (err) {
    logger.error('Error updating SMTP account:', err);
    throw err;
  } finally {
    client.release();
  }
};

export const deleteSmtpAccount = async (id: string, userId: string): Promise<boolean> => {
  const client = await pool.connect();
  try {
    const result = await client.query('DELETE FROM smtp_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error('Error deleting SMTP account:', err);
    throw err;
  } finally {
    client.release();
  }
};

export const testSmtpAccount = async (id: string, userId: string): Promise<{ success: boolean; message: string }> => {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT email, host, port, username, password, security FROM smtp_accounts WHERE id = $1 AND user_id = $2 AND is_active = true`,
      [id, userId]
    );
    if (res.rows.length === 0) return { success: false, message: 'SMTP account not found' };
    const acc = res.rows[0];

    const passDec = tryDecrypt(acc.password);
    if (passDec === null && isEncrypted(acc.password)) {
      return { success: false, message: 'Password decryption failed. Check server secret.' };
    }
    const pass = passDec ?? acc.password;

    const transporter = nodemailer.createTransport({
      host: acc.host,
      port: Number(acc.port),
      secure: (acc.security || 'SSL') === 'SSL',
      requireTLS: (acc.security || 'SSL') === 'STARTTLS' || (acc.security || 'SSL') === 'TLS',
      auth: { user: acc.username || acc.email, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    await transporter.verify();
    return { success: true, message: 'SMTP connection successful' };
  } catch (err) {
    logger.error('SMTP test failed:', err);
    const message = err instanceof Error ? err.message : 'SMTP test failed';
    return { success: false, message };
  } finally {
    client.release();
  }
};
