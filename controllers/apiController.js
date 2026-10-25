// controllers/apiController.js - the JSON API.
// Same rules as the pages: no SQL here (models/Entry.js owns it) and the user id
// ALWAYS comes from the session, never from the URL, the body or a header.
const Entry = require('../models/Entry');
const validators = require('../utils/validators');
const streak = require('../utils/streak');
const { MOODS, MOOD_LIST } = require('../utils/moods');
const {
  todayInTimezone,
  todayParts,
  weekdayName,
  formatDateTime
} = require('../utils/dates');

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const MOOD_KEYS_TEXT = MOOD_LIST.map((mood) => mood.key).join(', ');
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function pad(value) {
  return String(value).padStart(2, '0');
}

// "2026-10-25" -> "Sunday 25 October" (the pop-up on the calendar shows this).
function longLabel(date) {
  const parts = date.split('-').map(Number);
  return `${weekdayName(date)} ${parts[2]} ${MONTH_NAMES[parts[1] - 1]}`;
}

// One entry, exactly as the API hands it out.
// Times are already converted to the app timezone and dates stay as YYYY-MM-DD.
function entryJson(entry, today) {
  const mood = MOODS[entry.mood];
  return {
    date: entry.entry_date,
    label: longLabel(entry.entry_date),
    weekday: weekdayName(entry.entry_date),
    mood: entry.mood,
    moodLabel: mood.label,
    emoji: mood.emoji,
    color: mood.color,
    textColor: mood.text,
    note: entry.note || null,
    isToday: entry.entry_date === today,
    editable: entry.entry_date === today, // only today can be changed
    loggedAt: formatDateTime(entry.created_at),
    updatedAt: formatDateTime(entry.updated_at)
  };
}

// GET /api/entries?month=YYYY-MM - my entries for one month (this month by default).
async function getEntries(req, res) {
  const today = todayParts();
  let year = today.year;
  let month = today.month;

  if (req.query.month !== undefined) {
    const asked = MONTH_PATTERN.exec(String(req.query.month));
    if (!asked) {
      return res.status(400).json({ error: 'month must look like YYYY-MM.' });
    }
    year = Number(asked[1]);
    month = Number(asked[2]);
    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'month must be between 01 and 12.' });
    }
    if (year > today.year || (year === today.year && month > today.month)) {
      return res.status(400).json({ error: 'You cannot look at a month in the future.' });
    }
  }

  const entries = await Entry.getByMonth(req.currentUser.id, year, month);

  res.json({
    month: `${year}-${pad(month)}`,
    count: entries.length,
    entries: entries.map((entry) => entryJson(entry, today.iso))
  });
}

// GET /api/entries/:date - one of my days. :date is checked by validateDateParam,
// so it is a real YYYY-MM-DD here.
async function getEntry(req, res) {
  const date = req.params.date;
  const today = todayInTimezone();

  if (date > today) {
    return res.status(400).json({ error: 'That day is in the future.' });
  }

  const entry = await Entry.getByDate(req.currentUser.id, date); // own rows only
  if (!entry) {
    return res.status(404).json({ error: 'No entry for that day.' });
  }

  res.json(entryJson(entry, today));
}

// PUT /api/entries/today - create or change TODAY's entry. Body: { mood, note? }
async function putToday(req, res) {
  const today = todayInTimezone();
  const body = req.body || {};

  // A date in the body is never trusted: only today is accepted.
  const sentDate = body.date || body.entry_date;
  if (sentDate && String(sentDate) !== today) {
    return res.status(403).json({ error: 'You can only change today\u2019s entry.' });
  }

  const mood = String(body.mood || '');
  if (!validators.isValidMood(mood)) {
    return res.status(400).json({ error: `mood must be one of: ${MOOD_KEYS_TEXT}.` });
  }

  const note = validators.validateNote(body.note);
  if (!note.ok) {
    return res.status(400).json({ error: note.error });
  }

  const entry = await Entry.saveToday(req.currentUser.id, today, mood, note.value);
  res.json({ saved: true, entry: entryJson(entry, today) });
}

// GET /api/stats - streaks, totals and how often each mood appeared this month.
async function getStats(req, res) {
  const userId = req.currentUser.id;
  const today = todayParts();

  const [monthEntries, dates, counts] = await Promise.all([
    Entry.getByMonth(userId, today.year, today.month),
    Entry.getAllDates(userId),
    Entry.getCounts(userId)
  ]);

  const info = streak.streakInfo(dates, today.iso);

  const perMood = {};
  MOOD_LIST.forEach((mood) => { perMood[mood.key] = 0; });
  monthEntries.forEach((entry) => { perMood[entry.mood] += 1; });

  const moods = MOOD_LIST.map((mood) => ({
    mood: mood.key,
    label: mood.label,
    emoji: mood.emoji,
    count: perMood[mood.key],
    percent: monthEntries.length === 0
      ? 0
      : Math.round((perMood[mood.key] / monthEntries.length) * 100)
  }));

  let mostFrequent = null;
  moods.forEach((item) => {
    if (item.count > 0 && (!mostFrequent || item.count > mostFrequent.count)) mostFrequent = item;
  });

  res.json({
    today: today.iso,
    currentStreak: info.currentStreak,
    longestStreak: info.longestStreak,
    loggedToday: info.loggedToday,
    totalAllTime: counts.total,
    thisMonth: {
      month: `${today.year}-${pad(today.month)}`,
      total: monthEntries.length,
      mostFrequent,
      moods
    }
  });
}

module.exports = { getEntries, getEntry, putToday, getStats };
