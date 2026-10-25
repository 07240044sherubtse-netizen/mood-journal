// controllers/calendarController.js - the month grid.
const Entry = require('../models/Entry');
const { todayParts, weekdayName } = require('../utils/dates');

const WEEKDAY_HEADINGS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function pad(value) {
  return String(value).padStart(2, '0');
}

// Month before / after the given one, as "YYYY-MM".
function shiftMonth(year, month, change) {
  const date = new Date(Date.UTC(year, month - 1 + change, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

// GET /calendar?month=YYYY-MM
async function showCalendar(req, res) {
  const today = todayParts();
  let year = today.year;
  let month = today.month;

  // Optional ?month=YYYY-MM
  const asked = /^(\d{4})-(\d{2})$/.exec(String(req.query.month || ''));
  if (asked) {
    year = Number(asked[1]);
    month = Number(asked[2]);
  }
  if (month < 1 || month > 12) {
    year = today.year;
    month = today.month;
  }
  // The future is not here yet: never show a month after the current one.
  if (year > today.year || (year === today.year && month > today.month)) {
    year = today.year;
    month = today.month;
  }

  const entries = await Entry.getByMonth(req.currentUser.id, year, month);
  const moodByDate = new Map(entries.map((entry) => [entry.entry_date, entry.mood]));

  // Build the grid: Monday first, leading empty cells before day 1.
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sunday
  const leadingEmpty = (firstWeekday + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells = [];
  for (let i = 0; i < leadingEmpty; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${pad(month)}-${pad(day)}`;
    cells.push({
      date,
      dayNumber: day,
      mood: moodByDate.get(date) || null,
      isToday: date === today.iso,
      isFuture: date > today.iso,
      label: `${weekdayName(date)} ${day} ${MONTH_NAMES[month - 1]}`
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const currentMonth = `${today.year}-${pad(today.month)}`;
  const shownMonth = `${year}-${pad(month)}`;
  const next = shiftMonth(year, month, 1);

  res.render('pages/calendar', {
    title: 'Calendar',
    monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
    weekdayHeadings: WEEKDAY_HEADINGS,
    weeks,
    prevMonth: shiftMonth(year, month, -1),
    nextMonth: next,
    prevLabel: 'Previous',
    nextLabel: 'Next',
    canGoNext: next <= currentMonth, // no navigation into the future
    shownMonth
  });
}

module.exports = { showCalendar };
