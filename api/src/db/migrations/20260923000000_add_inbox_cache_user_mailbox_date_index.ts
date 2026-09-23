import type { Knex } from 'knex';

/**
 * Scalability index for inbox_cache.
 *
 * The existing (user_id, account_code, mailbox, date) index serves the
 * per-account cache reads. The ALL-accounts login-path query
 * (WHERE user_id = $1 AND mailbox = $2 ORDER BY date DESC) can't use it for
 * ordering — account_code sits between user_id and date in the key, so
 * Postgres must sort the matched rows explicitly. With many users × many
 * cached mails, that sort runs on every login. This dedicated index lets
 * Postgres walk the rows pre-ordered, no sort node at all.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('inbox_cache', (table) => {
    table.index(['user_id', 'mailbox', 'date'], 'inbox_cache_user_mailbox_date_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop by raw DDL index name — knex's typed dropIndex signatures vary on
  // whether the first argument may be empty for named indexes; raw DDL is
  // unambiguous across knex versions.
  await knex.raw('DROP INDEX IF EXISTS inbox_cache_user_mailbox_date_idx');
}
