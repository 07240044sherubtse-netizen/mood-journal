// controllers/statsController.js - the statistics page.
const Entry = require('../models/Entry');
const streak = require('../utils/streak');
const { MOOD_LIST } = require('../utils/moods');
const { todayParts } = require('../utils/dates');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// GET /stats
async function showStats(req, res) {
  const userId = req.currentUser.id;
  const today = todayParts();

  const [monthEntries, dates, counts] = await Promise.all([
    Entry.getByMonth(userId, today.year, today.month),
    Entry.getAllDates(userId),
    Entry.getCounts(userId)
  ]);

  const info = streak.streakInfo(dates, today.iso);

  // How many times each mood was chosen this month.
  const perMood = {};
  MOOD_LIST.forEach((mood) => {
    perMood[mood.key] = 0;
  });
  monthEntries.forEach((entry) => {
    perMood[entry.mood] += 1;
  });

  const totalThisMonth = monthEntries.length;
  const bars = MOOD_LIST.map((mood) => ({
    key: mood.key,
    label: mood.label,
    emoji: mood.emoji,
    color: mood.color,
    text: mood.text,
    count: perMood[mood.key],
    percent: totalThisMonth === 0 ? 0 : Math.round((perMood[mood.key] / totalThisMonth) * 100)
  }));

  // The mood that appeared most often this month (first one wins a tie).
  let mostFrequent = null;
  bars.forEach((bar) => {
    if (bar.count > 0 && (!mostFrequent || bar.count > mostFrequent.count)) mostFrequent = bar;
  });

  res.render('pages/stats', {
    title: 'Statistics',
    monthLabel: `${MONTH_NAMES[today.month - 1]} ${today.year}`,
    totalThisMonth,
    totalAllTime: counts.total,
    currentStreak: info.currentStreak,
    longestStreak: info.longestStreak,
    mostFrequent,
    bars
  });
}

module.exports = { showStats };
