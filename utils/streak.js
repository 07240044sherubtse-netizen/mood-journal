// utils/streak.js - the streak rules as PURE functions.
// No database, no HTTP: give it a list of dates and today, get numbers back.
// This is why it can be tested on its own.
const { addDays } = require('./dates');

// All logged days, without duplicates, sorted oldest first.
function uniqueSorted(dates) {
  return [...new Set(dates)].sort();
}

// How many consecutive logged days end today.
// If today is not logged yet but yesterday was, the streak is still alive.
// If yesterday was missed, the current streak is 0.
function currentStreak(dates, today) {
  const logged = new Set(dates);
  if (logged.size === 0) return 0;

  let cursor = today;
  if (!logged.has(cursor)) {
    cursor = addDays(today, -1);       // today may simply not be logged yet
    if (!logged.has(cursor)) return 0; // yesterday was missed: the streak is over
  }

  let streak = 0;
  while (logged.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// The longest run of consecutive days ever. Only ever grows.
function longestStreak(dates) {
  const days = uniqueSorted(dates);
  let best = 0;
  let run = 0;
  let previous = null;

  days.forEach((date) => {
    run = previous && addDays(previous, 1) === date ? run + 1 : 1;
    if (run > best) best = run;
    previous = date;
  });

  return best;
}

// Everything the pages need in one call.
function streakInfo(dates, today) {
  const loggedToday = new Set(dates).has(today);
  return {
    currentStreak: currentStreak(dates, today),
    longestStreak: longestStreak(dates),
    loggedToday,
    needsToday: !loggedToday && currentStreak(dates, today) > 0
  };
}

// Celebration card at exactly 7, 14 and 30 days.
function milestoneMessage(streak) {
  if (streak === 7) {
    return {
      celebrate: true,
      title: '7 days in a row! 🎉',
      text: 'A whole week of checking in with yourself. A habit is forming.'
    };
  }
  if (streak === 14) {
    return {
      celebrate: true,
      title: '14 days in a row! 🌟',
      text: 'Two weeks! Your journal is becoming part of your day.'
    };
  }
  if (streak === 30) {
    return {
      celebrate: true,
      title: '30 days in a row! 🏆',
      text: 'A full month of moods. That is something to be proud of.'
    };
  }
  return null;
}

// A friendly message for every other streak, and a gentle one for 0.
function encouragingMessage(streak, loggedToday = true) {
  if (streak === 0) {
    return {
      celebrate: false,
      title: 'A fresh start',
      text: 'No streak right now - logging today is all it takes to begin again.'
    };
  }
  if (!loggedToday) {
    return {
      celebrate: false,
      title: `Your ${streak}-day streak is waiting`,
      text: 'You have not logged today yet. Add your mood to keep it alive.'
    };
  }
  if (streak === 1) {
    return {
      celebrate: false,
      title: '1 day in a row',
      text: 'Nice start - come back tomorrow and it becomes two.'
    };
  }
  return {
    celebrate: false,
    title: `${streak} days in a row`,
    text: 'Lovely work. See you again tomorrow.'
  };
}

// Milestones win over the encouraging messages.
function streakMessage(streak, loggedToday = true) {
  return milestoneMessage(streak) || encouragingMessage(streak, loggedToday);
}

module.exports = {
  currentStreak,
  longestStreak,
  streakInfo,
  milestoneMessage,
  encouragingMessage,
  streakMessage
};
