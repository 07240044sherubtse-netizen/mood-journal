// test-db.js - tiny script to check the database connection and the tables.
// Run it with:  npm run test-db
// It prints nothing secret (no password, no connection string).

require('dotenv').config();
const db = require('./config/db');

const REQUIRED_TABLES = ['users', 'entries', 'admin_actions'];
const REQUIRED_USER_COLUMNS = ['verification_token_expires'];

async function main() {
  const ping = await db.one('SELECT 1 AS ok'); // simple connection test
  console.log('1) Connection: OK (SELECT 1 returned', ping.ok + ')');

  const { current_database } = await db.one('SELECT current_database()');
  console.log('2) Database in use:', current_database);

  const rows = await db.any(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ($1:csv)`,
    [REQUIRED_TABLES]
  );
  const found = rows.map((r) => r.table_name);
  const missing = REQUIRED_TABLES.filter((t) => !found.includes(t));

  console.log('3) Tables found:', found.join(', ') || '(none)');
  if (missing.length > 0) {
    console.log('   MISSING tables:', missing.join(', '));
    console.log('   Run: psql -U <user> -d <database> -f schema.sql');
  }

  const userColumns = await db.any(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name = ANY($1)`,
    [REQUIRED_USER_COLUMNS]
  );
  const foundUserColumns = userColumns.map((row) => row.column_name);
  const missingUserColumns = REQUIRED_USER_COLUMNS.filter((column) => !foundUserColumns.includes(column));
  console.log('3a) Verification columns:', foundUserColumns.join(', ') || '(none)');
  if (missingUserColumns.length > 0) {
    console.log('   MISSING columns:', missingUserColumns.join(', '));
    console.log('   Run schema.sql against this database to apply the safe, idempotent schema update.');
  }

  // The one-entry-per-day rule lives in the database, so check the constraint too.
  const uniqueRule = await db.oneOrNone(
    `SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'entries' AND c.contype = 'u'`
  );
  console.log('4) entries UNIQUE (user_id, entry_date):', uniqueRule ? 'present' : 'MISSING');

  const ok = missing.length === 0 && missingUserColumns.length === 0 && Boolean(uniqueRule);
  console.log(ok ? '\nResult: database looks good.' : '\nResult: database is NOT ready.');
  return ok;
}

main()
  .then((ok) => db.$pool.end().then(() => process.exit(ok ? 0 : 1)))
  .catch((err) => {
    // Show only the short message, never the connection details.
    console.error('Database check failed:', err.message);
    db.$pool.end().then(() => process.exit(1));
  });
