// Pure helpers for the weekly and monthly Mood Analytics dashboard.
const { MOOD_LIST, MOODS } = require('./moods');
const { addDays, weekdayName } = require('./dates');
const streak = require('./streak');

const MOOD_AXIS = [
  'angry', 'sad', 'anxious', 'tired', 'neutral', 'calm', 'happy', 'excited'
].map((key) => MOODS[key]);

const POSITIVE_MOODS = new Set(['happy', 'calm', 'excited']);
const NEUTRAL_MOODS = new Set(['neutral', 'tired']);
const NEGATIVE_MOODS = new Set(['anxious', 'sad', 'angry']);

function weekStart(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // Sunday = 0
  return addDays(date, -((weekday + 6) % 7)); // Monday-start week
}

function buildWeek(start, entries) {
  const byDate = new Map(entries.map((entry) => [entry.entry_date, entry]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const entry = byDate.get(date);
    const mood = entry ? MOODS[entry.mood] : null;
    return {
      date,
      weekday: weekdayName(date).slice(0, 3),
      mood: entry ? entry.mood : null,
      moodLabel: mood ? mood.label : null,
      emoji: mood ? mood.emoji : null,
      color: mood ? mood.color : null
    };
  });
}

function buildMoodDistribution(entries) {
  const counts = Object.fromEntries(MOOD_LIST.map(({ key }) => [key, 0]));
  entries.forEach((entry) => {
    if (Object.hasOwn(counts, entry.mood)) counts[entry.mood] += 1;
  });
  const total = entries.length;
  return MOOD_LIST.map((mood) => ({
    key: mood.key,
    label: mood.label,
    emoji: mood.emoji,
    color: mood.color,
    text: mood.text,
    count: counts[mood.key],
    percent: total ? Math.round((counts[mood.key] / total) * 100) : 0
  }));
}

function summarizeMonth(monthEntries, allDates, today) {
  const moods = buildMoodDistribution(monthEntries);
  let mostFrequent = null;
  moods.forEach((item) => {
    if (item.count > 0 && (!mostFrequent || item.count > mostFrequent.count)) mostFrequent = item;
  });

  const countIn = (set) => monthEntries.filter((entry) => set.has(entry.mood)).length;
  const historicalDates = allDates.filter((date) => date <= today);
  const streakInfo = streak.streakInfo(historicalDates, today);
  return {
    totalThisMonth: monthEntries.length,
    totalAllTime: historicalDates.length,
    mostFrequent,
    currentStreak: streakInfo.currentStreak,
    longestStreak: streakInfo.longestStreak,
    positive: countIn(POSITIVE_MOODS),
    neutral: countIn(NEUTRAL_MOODS),
    negative: countIn(NEGATIVE_MOODS),
    moods
  };
}

module.exports = { weekStart, buildWeek, buildMoodDistribution, summarizeMonth, MOOD_AXIS };
