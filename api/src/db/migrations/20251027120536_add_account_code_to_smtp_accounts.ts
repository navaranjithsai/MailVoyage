import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Check if the column already exists
  const hasColumn = await knex.schema.hasColumn('smtp_accounts', 'account_code');
  
  if (!hasColumn) {
    await knex.schema.alterTable('smtp_accounts', (table) => {
      // Add account_code column with unique constraint
      table.string('account_code', 3).unique();
    });
  }

  // Generate account codes for existing records that don't have one
  const accountsWithoutCode = await knex('smtp_accounts')
    .whereNull('account_code')
    .select('id');
  
  for (const account of accountsWithoutCode) {
    let accountCode: string;
    let isUnique = false;
    
    // Keep generating until we find a unique code
    while (!isUnique) {
      accountCode = generateAccountCode();
      const existing = await knex('smtp_accounts')
        .where('account_code', accountCode)
        .first();
      
      if (!existing) {
        isUnique = true;
        await knex('smtp_accounts')
          .where('id', account.id)
          .update({ account_code: accountCode });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('smtp_accounts', 'account_code');
  
  if (hasColumn) {
    await knex.schema.alterTable('smtp_accounts', (table) => {
      table.dropColumn('account_code');
    });
  }
}

// Generate a 3-character alphanumeric account code
function generateAccountCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 3; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
