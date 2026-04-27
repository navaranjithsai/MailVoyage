import pool from '../db/index.js';

export const getUserSetting = async (userId: number | string, key: string): Promise<string | null> => {
  const client = await pool.connect();
  try {
    const result = await client.query<{ setting_value: string }>(
      `SELECT setting_value
       FROM user_settings
       WHERE user_id = $1 AND setting_key = $2`,
      [userId, key]
    );

    return result.rows[0]?.setting_value ?? null;
  } finally {
    client.release();
  }
};

export const setUserSetting = async (
  userId: number | string,
  key: string,
  value: string
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [userId, key, value]
    );
  } finally {
    client.release();
  }
};

export const deleteUserSetting = async (userId: number | string, key: string): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(
      `DELETE FROM user_settings
       WHERE user_id = $1 AND setting_key = $2`,
      [userId, key]
    );
  } finally {
    client.release();
  }
};

export const getUserSettingJSON = async <T>(
  userId: number | string,
  key: string
): Promise<T | null> => {
  const value = await getUserSetting(userId, key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const setUserSettingJSON = async (
  userId: number | string,
  key: string,
  payload: unknown
): Promise<void> => {
  await setUserSetting(userId, key, JSON.stringify(payload));
};
