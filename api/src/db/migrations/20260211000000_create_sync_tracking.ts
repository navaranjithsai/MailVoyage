import type { Knex } from 'knex';

/**
 * Create sync_tracking table to persist per-account sync state.
 * Records the last UID successfully synced so incremental IMAP fetches
 * can pick up where they left off — even across server restarts.
 *
 * POP3 accounts can also store a highest UID (hashed UIDL), but it won't
 * be used for incremental fetch (POP3 doesn't support it).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('sync_tracking', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('account_code', 10).notNullable();
    table.string('mailbox', 255).notNullable().defaultTo('INBOX');
    table.integer('last_uid').notNullable().defaultTo(0);
    table.integer('total_on_server').nullable();
    table.timestamp('last_synced_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // One tracking row per user + account + mailbox
    table.unique(['user_id', 'account_code', 'mailbox']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sync_tracking');
}
