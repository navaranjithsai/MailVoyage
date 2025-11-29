import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create sent_mails table to store all emails sent via MailVoyage
  await knex.schema.createTable('sent_mails', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // User reference
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    
    // Thread ID for mail threading/grouping (unique per mail)
    table.string('thread_id', 32).notNullable().unique();
    
    // Sender info
    table.string('from_email', 255).notNullable();
    table.string('from_account_code', 10).notNullable(); // Reference to email/smtp account
    
    // Recipients
    table.jsonb('to_emails').notNullable(); // Array of email addresses
    table.jsonb('cc_emails').nullable(); // Array of CC email addresses
    table.jsonb('bcc_emails').nullable(); // Array of BCC email addresses
    
    // Mail content
    table.string('subject', 500).notNullable();
    table.text('html_body').notNullable();
    table.text('text_body').nullable();
    
    // Attachments stored as JSONB with metadata (actual files stored as bytea or external)
    table.jsonb('attachments').nullable(); // [{filename, contentType, size, content (base64)}]
    
    // SMTP response
    table.string('message_id', 255).nullable(); // SMTP message ID
    
    // Status tracking
    table.enum('status', ['sent', 'failed', 'pending']).defaultTo('sent');
    table.text('error_message').nullable();
    
    // Timestamps
    table.timestamp('sent_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Create indexes for efficient querying
  await knex.raw(`CREATE INDEX idx_sent_mails_user_id ON sent_mails(user_id)`);
  await knex.raw(`CREATE INDEX idx_sent_mails_thread_id ON sent_mails(thread_id)`);
  await knex.raw(`CREATE INDEX idx_sent_mails_sent_at ON sent_mails(sent_at DESC)`);
  await knex.raw(`CREATE INDEX idx_sent_mails_from_email ON sent_mails(from_email)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sent_mails');
}
