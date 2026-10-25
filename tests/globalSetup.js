// tests/globalSetup.js - runs ONCE before the whole suite.
// It creates the tables in the TEST database, using schema.sql.
// schema.sql only uses "CREATE ... IF NOT EXISTS", so running it again is safe.
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });

  // Only ever prepare a database whose name ends in "_test".
  if (!/_test$/.test(process.env.DB_NAME || '')) {
    console.error(
      '\nSkipping the test database setup: DB_NAME is not a test database.\n' +
        'Copy .env.test.example to .env.test and set DB_NAME=mood_journal_test.\n'
    );
    return;
  }

  const db = require('../config/db');

  try {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    await db.none(schema);
  } catch (err) {
    // A friendly hint instead of a wall of connection details.
    console.error(
      '\nCould not prepare the test database.\n' +
        'Reason: ' + err.message + '\n\n' +
        'Do this once, then run the tests again:\n' +
        '  1. Copy-Item .env.test.example .env.test\n' +
        '  2. createdb -U postgres mood_journal_test   (or use pgAdmin)\n\n'
    );
    await db.$pool.end();
    throw err;
  }

  await db.$pool.end();
};
