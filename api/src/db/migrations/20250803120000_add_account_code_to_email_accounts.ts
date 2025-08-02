import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add account_code field to email_accounts table
  await knex.schema.alterTable("email_accounts", (table) => {
    table.string("account_code", 3).unique(); // 3-character alphanumeric code
  });

  // Generate account codes for existing records if any
  const existingAccounts = await knex.select('id').from('email_accounts');
  
  for (const account of existingAccounts) {
    const accountCode = generateAccountCode();
    await knex('email_accounts')
      .where('id', account.id)
      .update({ account_code: accountCode });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove account_code field from email_accounts table
  await knex.schema.alterTable("email_accounts", (table) => {
    table.dropColumn("account_code");
  });
}

// Generate a 3-character alphanumeric code
function generateAccountCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 3; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
