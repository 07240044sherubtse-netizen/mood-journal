// models/Entry.js - ALL the SQL for the entries table.
// Every function takes the user id as its first argument: the id always comes
// from the session, so a query can never reach another user's rows.
const db = require('../config/db');

const COLUMNS = 'id, user_id, entry_date, mood, note, created_at, updated_at';

module.exports = {
  // One day of one user (the UNIQUE constraint makes this at most one row).
  getByDate(userId, date) {
    return db.oneOrNone(
      `SELECT ${COLUMNS} FROM entries WHERE user_id = $1 AND entry_date = $2`,
      [userId, date]
    );
  },

  // All entries of one month, oldest first (used by the calendar and the stats page).
  // month is 1-12; make_date builds the first day and the next month is the end.
  getByMonth(userId, year, month) {
    return db.any(
      `SELECT ${COLUMNS} FROM entries
        WHERE user_id = $1
          AND entry_date >= make_date($2::int, $3::int, 1)
          AND entry_date <  make_date($2::int, $3::int, 1) + INTERVAL '1 month'
        ORDER BY entry_date ASC`,
      [userId, year, month]
    );
  },

  // A closed date range for an analytics week. Both ends and the user are parameters.
  getInRange(userId, from, to) {
    return db.any(
      `SELECT ${COLUMNS} FROM entries
        WHERE user_id = $1 AND entry_date >= $2::date AND entry_date <= $3::date
        ORDER BY entry_date ASC`,
      [userId, from, to]
    );
  },

  // The most recent entries (used by the 7-day strip on the dashboard).
  getRecent(userId, limit) {
    return db.any(
      `SELECT ${COLUMNS} FROM entries
        WHERE user_id = $1
        ORDER BY entry_date DESC
        LIMIT $2`,
      [userId, limit]
    );
  },

  // Every date the user ever logged, oldest first. This is what feeds the streak.
  getAllDates(userId) {
    return db.map(
      'SELECT entry_date FROM entries WHERE user_id = $1 ORDER BY entry_date ASC',
      [userId],
      (row) => row.entry_date
    );
  },

  // The rows behind "download my data", oldest day first.
  // from and to are optional (null means "no limit"); they are always sent as
  // parameters, never glued into the SQL text.
  getForExport(userId, from, to) {
    return db.any(
      `SELECT ${COLUMNS} FROM entries
        WHERE user_id = $1
          AND ($2::date IS NULL OR entry_date >= $2::date)
          AND ($3::date IS NULL OR entry_date <= $3::date)
        ORDER BY entry_date ASC`,
      [userId, from || null, to || null]
    );
  },

  // Create or update TODAY's entry.
  // ON CONFLICT ... DO UPDATE means a second save for the same day changes the
  // existing row instead of adding another one.
  saveToday(userId, date, mood, note) {
    return db.one(
      `INSERT INTO entries (user_id, entry_date, mood, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, entry_date)
       DO UPDATE SET mood = EXCLUDED.mood, note = EXCLUDED.note, updated_at = now()
       RETURNING ${COLUMNS}`,
      [userId, date, mood, note]
    );
  },

  // Simple totals for this user.
  getCounts(userId) {
    return db.one(
      'SELECT COUNT(*)::int AS total FROM entries WHERE user_id = $1',
      [userId]
    );
  }
};
