// controllers/entryController.js - saving today's entry and reading one day.
// No SQL here: models/Entry.js owns it.
const Entry = require('../models/Entry');
const validators = require('../utils/validators');
const { todayInTimezone, weekdayName, formatDateTime } = require('../utils/dates');

// POST /entries/today - create or change TODAY's entry.
// The day is calculated on the server, never taken from the form.
async function saveToday(req, res) {
  const today = todayInTimezone();

  // If a form (or a curious user) sends a date anyway, only "today" is allowed.
  // Past days are view-only and future days do not exist yet: both get a 403.
  const sentDate = req.body.date || req.body.entry_date;
  if (sentDate && String(sentDate) !== today) {
    return res.status(403).render('pages/message', {
      title: 'That day is closed',
      heading: 'That day is closed',
      text: 'You can only create or change today\u2019s entry. Past days stay as they were and future days are not here yet.',
      linkHref: '/',
      linkText: 'Back to today'
    });
  }

  // The mood must be one of the eight moods the server knows.
  const mood = String(req.body.mood || '');
  if (!validators.isValidMood(mood)) {
    req.session.flash = { type: 'error', text: 'Please choose one of the eight moods.' };
    return res.redirect('/');
  }

  // The note is optional: trimmed, at most 200 characters, empty means no note.
  const note = validators.validateNote(req.body.note);
  if (!note.ok) {
    req.session.flash = { type: 'error', text: note.error };
    return res.redirect('/');
  }

  // user id from the session, never from the form.
  await Entry.saveToday(req.currentUser.id, today, mood, note.value);

  req.session.flash = { type: 'success', text: 'Today\u2019s mood is saved 🌈' };
  res.redirect('/');
}

// GET /entries/:date - read one of MY days. The date is already checked by
// middleware/validateDate.js, so it is a real YYYY-MM-DD here.
async function showEntry(req, res, next) {
  const date = req.params.date;
  const today = todayInTimezone();

  const entry = await Entry.getByDate(req.currentUser.id, date); // own entries only
  if (!entry) {
    const error = new Error('No entry for that day.');
    error.status = 404;
    return next(error);
  }

  res.render('pages/entry', {
    title: 'My entry',
    pageClass: 'page--narrow',
    entry,
    weekday: weekdayName(entry.entry_date),
    isToday: entry.entry_date === today,
    loggedAt: formatDateTime(entry.created_at),
    updatedAt: formatDateTime(entry.updated_at)
  });
}

module.exports = { saveToday, showEntry };
