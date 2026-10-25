// controllers/exportController.js - "download my data" as a CSV file.
// The user id ALWAYS comes from the session, so the file can only ever contain
// the rows of the person who asked for it - nobody can ask for somebody else's.
const Entry = require('../models/Entry');
const csv = require('../utils/csv');
const {
  todayInTimezone,
  isValidDateString,
  weekdayName,
  formatDateTime
} = require('../utils/dates');

// The columns of the file, in this exact order.
const COLUMNS = ['date', 'weekday', 'mood', 'note', 'logged_at', 'updated_at'];

// Reads the optional ?from=YYYY-MM-DD and ?to=YYYY-MM-DD from the URL.
// Returns { ok: true, from, to } or { ok: false, error }.
function parseRange(query) {
  const from = query.from ? String(query.from).trim() : '';
  const to = query.to ? String(query.to).trim() : '';
  const today = todayInTimezone();

  // Real calendar dates only: 2026-02-31 is refused.
  if (from && !isValidDateString(from)) {
    return { ok: false, error: 'From must be a real date written as YYYY-MM-DD.' };
  }
  if (to && !isValidDateString(to)) {
    return { ok: false, error: 'To must be a real date written as YYYY-MM-DD.' };
  }
  // Dates compare as strings because they are YYYY-MM-DD.
  if (from && to && from > to) {
    return { ok: false, error: 'From must not be after to.' };
  }
  // There are never entries in the future.
  if (from && from > today) {
    return { ok: false, error: 'From cannot be in the future.' };
  }
  if (to && to > today) {
    return { ok: false, error: 'To cannot be in the future.' };
  }

  return { ok: true, from: from || null, to: to || null };
}

// One day of one user -> one row of the file.
function rowFor(entry) {
  return [
    entry.entry_date,                  // date
    weekdayName(entry.entry_date),      // weekday: Monday ... Sunday
    entry.mood,                        // mood key, exactly as stored
    entry.note || '',                  // an entry without a note stays empty
    formatDateTime(entry.created_at),   // logged_at, in the app timezone
    formatDateTime(entry.updated_at)    // updated_at, in the app timezone
  ];
}

// Asks the model for the rows and turns them into the finished file text.
async function buildCsv(userId, from, to) {
  const entries = await Entry.getForExport(userId, from, to);
  return {
    total: entries.length,
    text: csv.withBom(csv.toCsv(COLUMNS, entries.map(rowFor)))
  };
}

// The download gets a name with today's date in it.
function fileName(today) {
  return `moodjournal-${today}.csv`;
}

function sendCsv(res, text, today) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName(today)}"`);
  res.setHeader('Cache-Control', 'no-store'); // private data: never cached anywhere
  res.send(text);
}

// GET /account/export.csv - the button on the Account and Stats pages.
async function exportCsvPage(req, res) {
  const range = parseRange(req.query);
  if (!range.ok) {
    req.session.flash = { type: 'error', text: range.error };
    return res.redirect('/account');
  }

  const today = todayInTimezone();
  const { total, text } = await buildCsv(req.currentUser.id, range.from, range.to);

  // Nothing to download: say so kindly instead of handing over an empty page.
  if (total === 0) {
    req.session.flash = {
      type: 'error',
      text: 'There is nothing to download yet for those dates.'
    };
    return res.redirect('/account');
  }

  sendCsv(res, text, today);
}

// GET /api/export.csv - the same file for anyone using the API.
// A filter that matches nothing still returns a valid file with its header line.
async function exportCsvApi(req, res) {
  const range = parseRange(req.query);
  if (!range.ok) {
    return res.status(400).json({ error: range.error });
  }

  const today = todayInTimezone();
  const { text } = await buildCsv(req.currentUser.id, range.from, range.to);
  sendCsv(res, text, today);
}

module.exports = { exportCsvPage, exportCsvApi, parseRange, COLUMNS };
