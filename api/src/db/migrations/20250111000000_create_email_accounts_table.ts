import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create email_accounts table
  await knex.schema.createTable("email_accounts", (table) => {
    table.increments("id").primary();
    table
      .integer("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE"); // If a user is deleted, their email accounts are also deleted
    table.string("email").notNullable();
    table.string("password").notNullable(); // Encrypted password
    table.enum("incoming_type", ["IMAP", "POP3"]).notNullable().defaultTo("IMAP");
    table.string("incoming_host").notNullable();
    table.integer("incoming_port").notNullable();
    table.string("incoming_username");
    table.enum("incoming_security", ["SSL", "STARTTLS", "NONE"]).notNullable().defaultTo("SSL");
    table.string("outgoing_host").notNullable();
    table.integer("outgoing_port").notNullable();
    table.string("outgoing_username");
    table.string("outgoing_password"); // Encrypted password, optional if same as incoming
    table.enum("outgoing_security", ["SSL", "STARTTLS", "NONE"]).notNullable().defaultTo("SSL");
    table.boolean("is_active").defaultTo(true);
    table.timestamps(true, true); // Adds created_at and updated_at

    // Ensure one email per user
    table.unique(["user_id", "email"]);
    
    // Index for faster lookups
    table.index(["user_id", "is_active"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("email_accounts");
}
