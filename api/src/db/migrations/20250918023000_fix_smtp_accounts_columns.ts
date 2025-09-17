import type { Knex } from "knex";

// Fix/align smtp_accounts schema by adding any missing columns used by the app.
export async function up(knex: Knex): Promise<void> {
  const table = 'smtp_accounts';
  const hasTable = await knex.schema.hasTable(table);
  if (!hasTable) return; // Another migration will create it

  // Add columns if missing
  const addCol = async (name: string, add: (tb: Knex.AlterTableBuilder) => void) => {
    const exists = await knex.schema.hasColumn(table, name);
    if (!exists) {
      await knex.schema.alterTable(table, (tb) => add(tb));
    }
  };

  await addCol('email', (tb) => tb.string('email').notNullable().defaultTo(''));
  await addCol('host', (tb) => tb.string('host').notNullable().defaultTo(''));
  await addCol('port', (tb) => tb.integer('port').notNullable().defaultTo(587));
  await addCol('username', (tb) => tb.string('username'));
  await addCol('password', (tb) => tb.string('password').notNullable().defaultTo(''));

  // Prefer enum when adding fresh; if enum type already exists, knex will reuse it.
  await addCol('security', (tb) =>
    // Fallback to enum; if DB doesn't support enum addition here, change to string as last resort.
    tb.enum('security', ['SSL', 'TLS', 'STARTTLS', 'PLAIN', 'NONE']).notNullable().defaultTo('SSL')
  );

  await addCol('is_active', (tb) => tb.boolean('is_active').notNullable().defaultTo(true));

  // Timestamps (handle separately to avoid conflict if one exists)
  const hasCreated = await knex.schema.hasColumn(table, 'created_at');
  if (!hasCreated) {
    await knex.schema.alterTable(table, (tb) => tb.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now()));
  }
  const hasUpdated = await knex.schema.hasColumn(table, 'updated_at');
  if (!hasUpdated) {
    await knex.schema.alterTable(table, (tb) => tb.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now()));
  }
}

export async function down(knex: Knex): Promise<void> {
  // No-op: avoid dropping columns in down migration to preserve data.
}
