// controllers/homeController.js - the dashboard.
const Entry = require('../models/Entry');
const streak = require('../utils/streak');
const { todayInTimezone, addDays, weekdayName, hourInTimezone } = require('../utils/dates');

// "Good morning" / "Good afternoon" / ... based on the hour in our timezone.
function greetingFor(hour) {
  if (hour < 5) return 'Still awake';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

// GET /
async function dashboard(req, res) {
  const userId = req.currentUser.id;
  const today = todayInTimezone();

  const [dates, todayEntry, recent] = await Promise.all([
    Entry.getAllDates(userId),          // every logged day -> streak
    Entry.getByDate(userId, today),     // today's entry, if there is one
    Entry.getRecent(userId, 7)          // last 7 entries -> the little strip
  ]);

  const info = streak.streakInfo(dates, today);

  // Build the 7-day strip, oldest day first, with the mood of each day.
  const byDate = new Map(recent.map((entry) => [entry.entry_date, entry]));
  const week = [];
  for (let back = 6; back >= 0; back -= 1) {
    const date = addDays(today, -back);
    const entry = byDate.get(date);
    week.push({
      date,
      weekday: weekdayName(date).slice(0, 3),
      mood: entry ? entry.mood : null,
      isToday: date === today
    });
  }

  res.render('pages/dashboard', {
    title: 'Dashboard',
    today,
    weekday: weekdayName(today),
    greeting: greetingFor(hourInTimezone()),
    todayEntry,
    week,
    info,
    message: streak.streakMessage(info.currentStreak, info.loggedToday)
  });
}

module.exports = { dashboard };
