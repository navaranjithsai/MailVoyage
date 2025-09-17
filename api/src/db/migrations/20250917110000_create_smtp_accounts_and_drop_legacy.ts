import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create smtp_accounts table
  const hasTable = await knex.schema.hasTable('smtp_accounts');
  if (!hasTable) {
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
      table.string('password').notNullable(); // encrypted
      table.enum('security', ['SSL', 'TLS', 'STARTTLS', 'PLAIN', 'NONE']).notNullable().defaultTo('SSL');
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);

      table.unique(['user_id', 'email', 'host', 'username']);
      table.index(['user_id', 'is_active']);
    });
  }

  // Drop legacy mail_server_configs if exists
  const hasLegacy = await knex.schema.hasTable('mail_server_configs');
  if (hasLegacy) {
    await knex.schema.dropTable('mail_server_configs');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('smtp_accounts');
  // Not recreating mail_server_configs on down
}
