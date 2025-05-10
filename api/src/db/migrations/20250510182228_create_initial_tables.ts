import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create users table
  await knex.schema.createTable("users", (table) => {
    table.increments("id").primary();
    table.string("username").notNullable().unique();
    table.string("email").notNullable().unique();
    table.string("password_hash").notNullable();
    table.timestamps(true, true); // Adds created_at and updated_at
  });

  // Create user_preferences table
  await knex.schema.createTable("user_preferences", (table) => {
    table.increments("id").primary();
    table
      .integer("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE"); // If a user is deleted, their preferences are also deleted
    table.string("theme").defaultTo("light");
    table.boolean("notifications_enabled").defaultTo(true);
    table.timestamps(true, true);
  });

  // Create mail_server_configs table
  await knex.schema.createTable("mail_server_configs", (table) => {
    table.increments("id").primary();
    table
      .integer("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE"); // If a user is deleted, their mail server configs are also deleted
    table.enum("type", ["IMAP", "SMTP"]).notNullable();
    table.string("host").notNullable();
    table.integer("port").notNullable();
    table.string("username").notNullable();
    table.string("password_encrypted").notNullable(); // Store encrypted password
    table.boolean("is_default").defaultTo(false);
    table.timestamps(true, true);

    // Optional: Add a unique constraint to prevent duplicate configs for the same user, type, host, and username
    table.unique(["user_id", "type", "host", "username"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order of creation due to foreign key constraints
  await knex.schema.dropTableIfExists("mail_server_configs");
  await knex.schema.dropTableIfExists("user_preferences");
  await knex.schema.dropTableIfExists("users");
}

