// utils/validators.js - every input rule, in one place.
// Controllers call these; the same rules are reused by the tests.
const { isValidMood } = require('./moods');
const { isValidDateString } = require('./dates');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NOTE_LENGTH = 200;

// A simple, readable email check (not a full RFC check on purpose).
function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 255 && EMAIL_PATTERN.test(email.trim());
}

// Passwords must be at least 8 characters long.
function isValidPassword(password) {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

// Checks the whole signup form. Returns { ok: true, ... } or { ok: false, error }.
function validateSignup({ name, email, password, confirmPassword }) {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (cleanName.length < 1 || cleanName.length > 100) {
    return { ok: false, error: 'Please enter your name (1 to 100 characters).' };
  }
  if (!isValidEmail(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!isValidPassword(password)) {
    return { ok: false, error: `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirmPassword) {
    return { ok: false, error: 'The two passwords do not match.' };
  }
  return {
    ok: true,
    name: cleanName,
    email: email.trim().toLowerCase(), // emails are always stored lowercase
    password
  };
}

// The note is optional. It is trimmed and limited to 200 characters.
// Empty means "no note", stored as NULL.
function validateNote(note) {
  if (note === undefined || note === null) return { ok: true, value: null };
  const clean = String(note).trim();
  if (clean.length === 0) return { ok: true, value: null };
  if (clean.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `Your note can be at most ${MAX_NOTE_LENGTH} characters.` };
  }
  return { ok: true, value: clean };
}

// A real YYYY-MM-DD date.
function isValidDate(date) {
  return isValidDateString(date);
}

// Dates are compared as strings, which works because they are YYYY-MM-DD.
function isFutureDate(date, today) {
  return date > today;
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  MAX_NOTE_LENGTH,
  isValidEmail,
  isValidPassword,
  validateSignup,
  validateNote,
  isValidMood,
  isValidDate,
  isFutureDate
};
