import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('inbox_cache', (table) => {
    table.timestamp('flag_updated_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('inbox_cache', (table) => {
    table.dropColumn('flag_updated_at');
  });
}
