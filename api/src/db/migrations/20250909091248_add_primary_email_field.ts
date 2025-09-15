import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add is_primary field to email_accounts table
  await knex.schema.alterTable("email_accounts", (table) => {
    table.boolean("is_primary").defaultTo(false);
  });

  // Set the first email account as primary for each user
  const usersWithAccounts = await knex
    .select('user_id')
    .from('email_accounts')
    .groupBy('user_id');

  for (const user of usersWithAccounts) {
    const firstAccount = await knex
      .select('id')
      .from('email_accounts')
      .where('user_id', user.user_id)
      .orderBy('created_at', 'asc')
      .first();

    if (firstAccount) {
      await knex('email_accounts')
        .where('id', firstAccount.id)
        .update({ is_primary: true });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove is_primary field from email_accounts table
  await knex.schema.alterTable("email_accounts", (table) => {
    table.dropColumn("is_primary");
  });
}

