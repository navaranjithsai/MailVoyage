import type { Knex } from "knex";

// This migration file is a compatibility shim to satisfy Knex's migration history.
// It ensures the smtp_accounts table exists if not already created.

export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasTable('smtp_accounts');
  if (!has) {
    await knex.schema.createTable('smtp_accounts', (table) => {
      table.increments('id').primary();
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE');
      table.string('email').notNullable();
      table.string('host').notNullable();
      table.integer('port').notNullable();
      table.string('username');
      table.string('password').notNullable();
      table.enum('security', ['SSL', 'TLS', 'STARTTLS', 'PLAIN', 'NONE']).notNullable().defaultTo('SSL');
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
      table.unique(['user_id', 'email', 'host', 'username']);
      table.index(['user_id', 'is_active']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // No-op safe down. Do not drop in case this was applied historically on a live DB.
  // If needed: await knex.schema.dropTableIfExists('smtp_accounts');
}
