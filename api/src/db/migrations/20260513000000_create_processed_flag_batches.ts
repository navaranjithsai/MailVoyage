import type { Knex } from 'knex';

/**
 * Store idempotent ACK payloads for flag update batches.
 * Short retention (trimmed by service) prevents unbounded growth.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('processed_flag_batches', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('batch_id', 64).notNullable();
    table.jsonb('ack_payload').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['user_id', 'batch_id']);
    table.index(['user_id', 'created_at']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('processed_flag_batches');
}
