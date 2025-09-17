import type { Knex } from "knex";

// Relax/normalize smtp_accounts.security constraint to accept: SSL, TLS, STARTTLS, PLAIN, NONE
export async function up(knex: Knex): Promise<void> {
  const table = 'smtp_accounts';
  const hasTable = await knex.schema.hasTable(table);
  if (!hasTable) return;

  // 1) Ensure column exists
  const hasSecurity = await knex.schema.hasColumn(table, 'security');
  if (!hasSecurity) {
    await knex.schema.alterTable(table, (tb) => tb.string('security'));
  }

  // 2) Drop existing CHECK constraint if present (name seen in error)
  await knex.raw(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS smtp_accounts_security_check`);

  // 3) If column uses a Postgres enum type, cast it to text and drop the enum type
  //    Typical knex enum type name: enum_<table>_<column>
  await knex.raw(`ALTER TABLE ${table} ALTER COLUMN security TYPE text USING security::text`);
  // Drop enum type if it exists (ignore errors if not present)
  try {
    await knex.raw('DROP TYPE IF EXISTS "enum_smtp_accounts_security"');
  } catch {
    // ignore
  }

  // 4) Normalize existing values to allowed set (uppercase mapping)
  await knex.raw(`
    UPDATE ${table}
    SET security = CASE
      WHEN security IS NULL OR security = '' THEN 'SSL'
      WHEN upper(security) IN ('SSL','TLS','STARTTLS','PLAIN','NONE') THEN upper(security)
      WHEN upper(security) IN ('TLS1.2','TLS1.3') THEN 'TLS'
      WHEN upper(security) IN ('STARTTLS_REQUIRED','REQUIRETLS') THEN 'STARTTLS'
      ELSE 'SSL'
    END
  `);

  // 5) Re-add a permissive CHECK constraint and set default + not null
  await knex.raw(`ALTER TABLE ${table} ADD CONSTRAINT smtp_accounts_security_check CHECK (UPPER(security) IN ('SSL','TLS','STARTTLS','PLAIN','NONE'))`);
  await knex.raw(`ALTER TABLE ${table} ALTER COLUMN security SET DEFAULT 'SSL'`);
  await knex.raw(`ALTER TABLE ${table} ALTER COLUMN security SET NOT NULL`);
}

export async function down(knex: Knex): Promise<void> {
  // Keep the relaxed constraint; no-op for down to avoid flip-flopping types/constraints
}
