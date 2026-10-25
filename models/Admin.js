// models/Admin.js - ALL the SQL for the super admin dashboard.
// PRIVACY: this file only ever reads totals and account columns.
// No note and no single mood is ever selected, so a super admin can see how
// many entries exist, never what anybody wrote.
const db = require('../config/db');

module.exports = {
  // The anonymous totals at the top of the page.
  // "today" is passed in, so it is the app's timezone that decides the day,
  // not the database server's clock.
  getStats(today) {
    return db.one(
      `SELECT
         (SELECT COUNT(*)::int FROM users)                                    AS total_users,
         (SELECT COUNT(*)::int FROM users WHERE is_verified)                  AS verified_users,
         (SELECT COUNT(*)::int FROM users WHERE is_active)                    AS active_users,
         (SELECT COUNT(*)::int FROM entries)                                  AS total_entries,
         (SELECT COUNT(*)::int FROM entries WHERE entry_date = $1::date)      AS entries_today,
         (SELECT COUNT(*)::int FROM entries WHERE entry_date > $1::date - 7)  AS entries_last_7_days`,
      [today]
    );
  },

  // Every change a super admin makes is written down.
  logAction(adminId, action, targetUserId) {
    return db.none(
      'INSERT INTO admin_actions (admin_id, action, target_user_id) VALUES ($1, $2, $3)',
      [adminId, action, targetUserId]
    );
  },

  // The latest changes, newest first, with the two names already joined on.
  recentActions(limit) {
    return db.any(
      `SELECT a.id, a.action, a.created_at,
              admin.name  AS admin_name,
              target.name AS target_name
         FROM admin_actions a
         JOIN users admin  ON admin.id  = a.admin_id
         JOIN users target ON target.id = a.target_user_id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $1`,
      [limit]
    );
  }
};
