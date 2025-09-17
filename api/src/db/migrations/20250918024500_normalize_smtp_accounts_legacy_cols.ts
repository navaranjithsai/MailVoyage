import type { Knex } from "knex";

// Normalize legacy SMTP columns to the current schema
export async function up(knex: Knex): Promise<void> {
  const table = 'smtp_accounts';
  const hasTable = await knex.schema.hasTable(table);
  if (!hasTable) return;

  // Helper to rename old->new if needed, or copy then drop
  const renameOrCopy = async (
    oldCol: string,
    newCol: string,
    addNew: (tb: Knex.AlterTableBuilder) => void
  ) => {
    const oldExists = await knex.schema.hasColumn(table, oldCol);
    const newExists = await knex.schema.hasColumn(table, newCol);

    if (oldExists && !newExists) {
      // Try rename when possible
      await knex.schema.alterTable(table, (tb) => {
        // Ensure target type exists by adding then dropping? For Postgres, rename is safe.
        tb.renameColumn(oldCol, newCol);
      });
    } else if (oldExists && newExists) {
      // Copy data from old to new where new is NULL, then drop old
      await knex.raw(
        `UPDATE ${table} SET ${newCol} = COALESCE(${newCol}, ${oldCol}) WHERE ${newCol} IS NULL`
      );
      await knex.schema.alterTable(table, (tb) => {
        tb.dropColumn(oldCol);
      });
    } else if (!oldExists && !newExists) {
      // Create the new column if neither exists
      await knex.schema.alterTable(table, addNew);
    }
  };

  await renameOrCopy('smtp_server', 'host', (tb) => tb.string('host'));
  await renameOrCopy('smtp_port', 'port', (tb) => tb.integer('port'));
  await renameOrCopy('smtp_username', 'username', (tb) => tb.string('username'));
  await renameOrCopy('smtp_password', 'password', (tb) => tb.string('password'));
  await renameOrCopy('smtp_security', 'security', (tb) => tb.string('security'));

  // Ensure not-null + defaults for required columns
  const ensureNotNull = async (col: string, defaultSql: string, type: 'string' | 'int' = 'string') => {
    const exists = await knex.schema.hasColumn(table, col);
    if (!exists) return;
    // Fill nulls
    await knex.raw(`UPDATE ${table} SET ${col} = ${defaultSql} WHERE ${col} IS NULL`);
    // Set NOT NULL constraint
    await knex.schema.alterTable(table, (tb) => {
      if (type === 'int') {
        tb.integer(col).notNullable().alter();
      } else {
        tb.string(col).notNullable().alter();
      }
    });
  };

  await ensureNotNull('email', "''");
  await ensureNotNull('host', "''");
  await ensureNotNull('port', '587', 'int');
  await ensureNotNull('password', "''");

  // Normalize security to our allowed set if it's free-text
  const hasSecurity = await knex.schema.hasColumn(table, 'security');
  if (hasSecurity) {
    // Map likely values (case-insensitive)
    await knex.raw(
      `UPDATE ${table}
       SET security = CASE
         WHEN upper(security) IN ('SSL','TLS','STARTTLS','PLAIN','NONE') THEN upper(security)
         WHEN upper(security) IN ('TLS1.2','TLS1.3') THEN 'TLS'
         WHEN upper(security) IN ('STARTTLS_REQUIRED','REQUIRETLS') THEN 'STARTTLS'
         ELSE 'SSL'
       END
       WHERE security IS NOT NULL`
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  // No destructive down migration; legacy columns remain dropped.
}
