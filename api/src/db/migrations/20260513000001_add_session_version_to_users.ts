import type { Knex } from 'knex';

/**
 * Add session_version to users for token revocation on logout.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.integer('session_version').notNullable().defaultTo(0);
  });

  // Backfill any existing rows (safety for older databases)
  await knex('users').whereNull('session_version').update({ session_version: 0 });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('session_version');
  });
}
