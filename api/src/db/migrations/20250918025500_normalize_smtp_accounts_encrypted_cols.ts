import type { Knex } from "knex";

// Normalize legacy encrypted columns on smtp_accounts
export async function up(knex: Knex): Promise<void> {
  const table = 'smtp_accounts';
  const hasTable = await knex.schema.hasTable(table);
  if (!hasTable) return;

  const hasCol = (col: string) => knex.schema.hasColumn(table, col);

  const hasPwdEnc = await hasCol('password_encrypted');
  const hasPwd = await hasCol('password');
  if (hasPwdEnc) {
    if (!hasPwd) {
      await knex.schema.alterTable(table, (tb) => tb.string('password'));
    }
    // Copy data from legacy -> new when new is null or empty
    await knex.raw(
      `UPDATE ${table}
       SET password = COALESCE(NULLIF(password, ''), password_encrypted)
       WHERE password IS NULL OR password = ''`
    );
    // Drop legacy column
    await knex.schema.alterTable(table, (tb) => tb.dropColumn('password_encrypted'));
    // Enforce NOT NULL with default
    await knex.raw(`UPDATE ${table} SET password = '' WHERE password IS NULL`);
    await knex.schema.alterTable(table, (tb) => tb.string('password').notNullable().alter());
  }

  // Optional: handle username_encrypted -> username
  const hasUserEnc = await hasCol('username_encrypted');
  const hasUser = await hasCol('username');
  if (hasUserEnc) {
    if (!hasUser) {
      await knex.schema.alterTable(table, (tb) => tb.string('username'));
    }
    await knex.raw(
      `UPDATE ${table}
       SET username = COALESCE(username, username_encrypted)
       WHERE username IS NULL`
    );
    await knex.schema.alterTable(table, (tb) => tb.dropColumn('username_encrypted'));
  }
}

export async function down(knex: Knex): Promise<void> {
  // No-op: Do not recreate legacy columns
}
