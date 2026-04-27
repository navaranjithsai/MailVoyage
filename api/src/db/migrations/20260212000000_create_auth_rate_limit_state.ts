import type { Knex } from 'knex';

const TABLE_NAME = 'auth_rate_limit_state';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (hasTable) {
    return;
  }

  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id').primary();
    table.string('scope', 80).notNullable();
    table.string('subject_key', 255).notNullable();
    table.string('ip_address', 64).notNullable();
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.timestamp('window_started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('locked_until', { useTz: true }).nullable();
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['scope', 'subject_key', 'ip_address']);
    table.index(['scope', 'subject_key']);
    table.index(['locked_until']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TABLE_NAME);
}
