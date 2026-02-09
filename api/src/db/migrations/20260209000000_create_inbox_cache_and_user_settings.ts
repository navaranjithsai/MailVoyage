import type { Knex } from 'knex';

/**
 * Create inbox_cache table for storing latest N mails per account server-side,
 * and user_settings table for per-user configurable limits.
 */
export async function up(knex: Knex): Promise<void> {
  // User settings table (per-user preferences)
  await knex.schema.createTable('user_settings', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('setting_key', 100).notNullable();
    table.text('setting_value').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['user_id', 'setting_key']);
  });

  // Inbox cache table — stores latest N mails per email account on the server
  await knex.schema.createTable('inbox_cache', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('account_code', 10).notNullable();
    table.integer('uid').notNullable(); // IMAP UID
    table.string('message_id', 512).nullable();
    table.string('mailbox', 255).notNullable().defaultTo('INBOX');
    table.text('from_address').notNullable();
    table.string('from_name', 255).nullable();
    table.jsonb('to_addresses').notNullable().defaultTo('[]');
    table.jsonb('cc_addresses').nullable();
    table.jsonb('bcc_addresses').nullable();
    table.text('subject').notNullable().defaultTo('');
    table.text('text_body').nullable();
    table.text('html_body').nullable();
    table.timestamp('date').notNullable();
    table.boolean('is_read').notNullable().defaultTo(false);
    table.boolean('is_starred').notNullable().defaultTo(false);
    table.boolean('has_attachments').notNullable().defaultTo(false);
    table.jsonb('attachments_metadata').nullable();
    table.jsonb('labels').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Prevent duplicates: one UID per account+mailbox per user
    table.unique(['user_id', 'account_code', 'mailbox', 'uid']);
    // Index for efficient queries
    table.index(['user_id', 'account_code', 'mailbox', 'date']);
  });

  // Insert default settings for inbox cache limit
  // (Will be per-user, so no default rows needed here)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('inbox_cache');
  await knex.schema.dropTableIfExists('user_settings');
}
