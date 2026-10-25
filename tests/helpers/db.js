// tests/helpers/db.js - small helpers for the database-backed tests.
// Test scaffolding only: the app itself keeps all its SQL inside models/.
const bcrypt = require('bcrypt');
const db = require('../../config/db');

// SAFETY NET: resetDb() empties the tables with TRUNCATE. If the connection ever
// pointed at the real database, that would delete real people's entries.
// So these tests refuse to run unless the database name ends in "_test".
const dbName = process.env.DB_NAME || '';
if (!/_test$/.test(dbName)) {
  db.$pool.end(); // do not leave a connection hanging
  throw new Error(
    `Tests must use a test database, but DB_NAME is "${dbName}".\n` +
      '  Copy-Item .env.test.example .env.test   (then set DB_NAME=mood_journal_test)\n' +
      '  createdb -U postgres mood_journal_test'
  );
}

// Empty the three tables and start the ids at 1 again, so assertions are easy
// to read. CASCADE takes the entries of every user with it.
async function resetDb() {
  await db.none('TRUNCATE admin_actions, entries, users RESTART IDENTITY CASCADE');
}

// A ready-to-use account. The hash uses only 4 rounds because tests do not need
// the real cost of hashing - logging in still compares hashes normally.
async function createUser({
  name = 'Test User',
  email,
  password = 'password123',
  role = 'user',
  verified = true,
  active = true
} = {}) {
  const passwordHash = await bcrypt.hash(password, 4);
  const user = await db.one(
    `INSERT INTO users (name, email, password_hash, role, is_verified, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, email, role, is_verified, is_active`,
    [name, String(email).toLowerCase(), passwordHash, role, verified, active]
  );
  return Object.assign(user, { password });
}

// Give a user a verification link token, exactly as signing up would.
async function giveVerificationToken(userId, token) {
  await db.none('UPDATE users SET verification_token = $2 WHERE id = $1', [userId, token]);
}

// Give a user a password-reset token. A negative number of minutes makes it
// already expired, which is how the "expired link" test works.
async function giveResetToken(userId, token, minutesFromNow = 60) {
  await db.none(
    `UPDATE users
        SET reset_token = $2, reset_token_expires = now() + ($3::text || ' minutes')::interval
      WHERE id = $1`,
    [userId, token, String(minutesFromNow)]
  );
}

async function createEntry(userId, date, mood = 'happy', note = null) {
  return db.one(
    `INSERT INTO entries (user_id, entry_date, mood, note)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, entry_date, mood, note`,
    [userId, date, mood, note]
  );
}

// How many rows a table has. The table name always comes from our own test code,
// never from a request.
async function count(table) {
  const row = await db.one(`SELECT COUNT(*)::int AS total FROM ${table}`);
  return row.total;
}

// Close the connection pool at the end of a test file, so jest can exit.
async function closeDb() {
  await db.$pool.end();
}

module.exports = {
  db,
  resetDb,
  createUser,
  giveVerificationToken,
  giveResetToken,
  createEntry,
  count,
  closeDb
};
