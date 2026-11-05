// models/User.js - ALL the SQL for the users table lives here.
// Controllers call these functions and never write SQL themselves.
const db = require('../config/db');

// The columns we send to the rest of the app. password_hash is included only
// where it is really needed (login and change-password).
const PUBLIC_COLUMNS = 'id, name, email, role, is_verified, is_active, created_at';

module.exports = {
  // Create a normal, not-yet-verified user. role is never taken from a form.
  create({ name, email, passwordHash, verificationToken, verificationExpiresAt }) {
    return db.one(
      `INSERT INTO users (name, email, password_hash, verification_token, verification_token_expires, role, is_verified)
       VALUES ($1, $2, $3, $4, $5, 'user', false)
       RETURNING ${PUBLIC_COLUMNS}`,
      [name, email, passwordHash, verificationToken, verificationExpiresAt]
    );
  },

  // Used by scripts/createSuperAdmin.js - the only way to make a super admin.
  createSuperAdmin({ name, email, passwordHash }) {
    return db.one(
      `INSERT INTO users (name, email, password_hash, role, is_verified, is_active)
       VALUES ($1, $2, $3, 'superadmin', true, true)
       RETURNING ${PUBLIC_COLUMNS}`,
      [name, email, passwordHash]
    );
  },

  // Includes password_hash: only for login and password changes.
  findByEmail(email) {
    return db.oneOrNone('SELECT * FROM users WHERE email = $1', [email]);
  },

  findById(id) {
    return db.oneOrNone(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  },

  // Like findById, but includes the hash so the account page can check the
  // current password before changing it.
  findByIdWithHash(id) {
    return db.oneOrNone('SELECT * FROM users WHERE id = $1', [id]);
  },

  findByVerificationToken(token) {
    return db.oneOrNone(
      `SELECT * FROM users WHERE verification_token = $1
        AND verification_token_expires > now() AND is_verified = false`,
      [token]
    );
  },

  setVerificationToken(id, token, expiresAt) {
    return db.none(
      `UPDATE users SET verification_token = $2, verification_token_expires = $3
        WHERE id = $1 AND is_verified = false`,
      [id, token, expiresAt]
    );
  },

  // Atomic update makes a token expire and succeed only once, even for concurrent requests.
  verifyWithToken(token) {
    return db.oneOrNone(
      `UPDATE users SET is_verified = true, verification_token = NULL,
                        verification_token_expires = NULL
        WHERE verification_token = $1 AND verification_token_expires > now() AND is_verified = false
        RETURNING id`,
      [token]
    );
  },

  // The expiry check happens inside the query, so an old token simply finds nothing.
  findByValidResetToken(token) {
    return db.oneOrNone(
      `SELECT * FROM users
        WHERE reset_token = $1 AND reset_token_expires IS NOT NULL AND reset_token_expires > now()`,
      [token]
    );
  },

  markVerified(id) {
    return db.none(
      'UPDATE users SET is_verified = true, verification_token = NULL, verification_token_expires = NULL WHERE id = $1',
      [id]
    );
  },

  setResetToken(id, token, expiresAt) {
    return db.none(
      'UPDATE users SET reset_token = $2, reset_token_expires = $3 WHERE id = $1',
      [id, token, expiresAt]
    );
  },

  // Saves the new password hash and burns the reset token (single use).
  updatePassword(id, passwordHash) {
    return db.none(
      `UPDATE users
          SET password_hash = $2, reset_token = NULL, reset_token_expires = NULL
        WHERE id = $1`,
      [id, passwordHash]
    );
  },

  // Deletes the user; PostgreSQL removes all their entries automatically
  // because of ON DELETE CASCADE.
  remove(id) {
    return db.none('DELETE FROM users WHERE id = $1', [id]);
  },

  // --- For the super admin dashboard ---------------------------------------
  // One page of the users table. "search" is plain text, never a pattern:
  // position() looks for the letters as they are, so % and _ are harmless.
  // Only account columns are returned - never an entry, a mood or a note.
  listUsers(search, limit, offset) {
    return db.any(
      `SELECT ${PUBLIC_COLUMNS} FROM users
        WHERE $1::text = ''
           OR position(lower($1::text) in lower(name)) > 0
           OR position(lower($1::text) in lower(email)) > 0
        ORDER BY id ASC
        LIMIT $2 OFFSET $3`,
      [search, limit, offset]
    );
  },

  // How many rows the same search matches (used to build the page numbers).
  countUsers(search) {
    return db.one(
      `SELECT COUNT(*)::int AS total FROM users
        WHERE $1::text = ''
           OR position(lower($1::text) in lower(name)) > 0
           OR position(lower($1::text) in lower(email)) > 0`,
      [search]
    );
  },

  // Turn an account on or off. A deactivated user cannot log in any more,
  // but nothing they wrote is deleted.
  setActive(id, isActive) {
    return db.none('UPDATE users SET is_active = $2 WHERE id = $1', [id, isActive]);
  }
};
