// utils/streak.test.js - the streak RULES, written as tests.
// This is the specification: if these pass, the streak behaves as promised.
const {
  currentStreak,
  longestStreak,
  streakInfo,
  milestoneMessage,
  encouragingMessage,
  streakMessage
} = require('./streak');

// A fixed "today" so the tests never change with the real date.
const TODAY = '2026-10-25';

// A list of dates counted backwards from TODAY. 0 means today itself,
// 1 means yesterday, and so on.
function daysAgo(...offsets) {
  return offsets.map((n) => {
    const date = new Date(Date.UTC(2026, 9, 25)); // 25 October 2026
    date.setUTCDate(date.getUTCDate() - n);
    return date.toISOString().slice(0, 10);
  });
}

describe('currentStreak', () => {
  test('counts today and the days directly before it', () => {
    expect(currentStreak(daysAgo(0, 1, 2), TODAY)).toBe(3);
  });

  test('is still alive when today has not been logged yet', () => {
    expect(currentStreak(daysAgo(1, 2, 3), TODAY)).toBe(3);
  });

  test('is 0 when yesterday was missed', () => {
    expect(currentStreak(daysAgo(2, 3, 4), TODAY)).toBe(0);
  });

  test('is 0 when nothing has ever been logged', () => {
    expect(currentStreak([], TODAY)).toBe(0);
  });

  test('counts a single day', () => {
    expect(currentStreak(daysAgo(0), TODAY)).toBe(1);
    expect(currentStreak(daysAgo(1), TODAY)).toBe(1);
  });

  test('stops at the first gap', () => {
    expect(currentStreak(daysAgo(0, 1, 3, 4, 5), TODAY)).toBe(2);
  });

  test('ignores a repeated date', () => {
    const repeated = [...daysAgo(0, 1, 1, 2), TODAY];
    expect(currentStreak(repeated, TODAY)).toBe(3);
  });

  test('only counts the run that reaches today', () => {
    expect(currentStreak(daysAgo(0, 1, 2, 10, 11, 12), TODAY)).toBe(3);
  });

  test('a run that ended long ago is not the current streak', () => {
    expect(currentStreak(daysAgo(5, 6, 7), TODAY)).toBe(0);
  });
});

describe('longestStreak', () => {
  test('finds the longest run, wherever it is', () => {
    expect(longestStreak(daysAgo(0, 1, 5, 6, 7, 8, 20))).toBe(4);
  });

  test('is 0 with no dates at all', () => {
    expect(longestStreak([])).toBe(0);
  });

  test('counts a single day as 1', () => {
    expect(longestStreak(daysAgo(9))).toBe(1);
  });

  test('does not care in which order the dates arrive', () => {
    expect(longestStreak(daysAgo(8, 6, 7, 1, 0))).toBe(3);
  });

  test('ignores duplicates', () => {
    expect(longestStreak([...daysAgo(2, 1, 0), TODAY, TODAY])).toBe(3);
  });

  test('is never smaller than the current streak', () => {
    const samples = [daysAgo(0, 1, 2), daysAgo(0, 1, 4), daysAgo(3), [], daysAgo(0)];
    samples.forEach((dates) => {
      expect(longestStreak(dates)).toBeGreaterThanOrEqual(currentStreak(dates, TODAY));
    });
  });
});

describe('streakInfo', () => {
  test('reports whether today is already logged', () => {
    expect(streakInfo(daysAgo(0, 1), TODAY).loggedToday).toBe(true);
    expect(streakInfo(daysAgo(1, 2), TODAY).loggedToday).toBe(false);
  });

  test('asks for today when the streak is alive but today is missing', () => {
    expect(streakInfo(daysAgo(1, 2), TODAY).needsToday).toBe(true);
  });

  test('does not ask for today when there is no streak to save', () => {
    expect(streakInfo(daysAgo(4, 5), TODAY).needsToday).toBe(false);
    expect(streakInfo([], TODAY).needsToday).toBe(false);
  });

  test('returns both streaks at once', () => {
    const info = streakInfo(daysAgo(0, 1, 2, 9, 10, 11, 12), TODAY);
    expect(info.currentStreak).toBe(3);
    expect(info.longestStreak).toBe(4);
  });
});

describe('milestoneMessage', () => {
  test('celebrates 7, 14 and 30 days', () => {
    [7, 14, 30].forEach((streak) => {
      const message = milestoneMessage(streak);
      expect(message).not.toBeNull();
      expect(message.celebrate).toBe(true);
      expect(message.title).toContain(String(streak));
    });
  });

  test('is null on every other day', () => {
    [0, 1, 6, 8, 13, 15, 29, 31, 100].forEach((streak) => {
      expect(milestoneMessage(streak)).toBeNull();
    });
  });
});

describe('encouragingMessage', () => {
  test('is gentle when there is no streak', () => {
    const message = encouragingMessage(0);
    expect(message.celebrate).toBe(false);
    expect(message.title).toBe('A fresh start');
    expect(message.text.length).toBeGreaterThan(0);
  });

  test('says 1 day in a row after the first day', () => {
    expect(encouragingMessage(1).title).toBe('1 day in a row');
  });

  test('mentions the number of days', () => {
    expect(encouragingMessage(5).title).toContain('5');
  });

  test('reminds you when today is still missing', () => {
    const message = encouragingMessage(4, false);
    expect(message.title).toContain('4');
    expect(message.text).toMatch(/not logged today/i);
  });
});

describe('streakMessage', () => {
  test('a milestone wins over the encouraging message', () => {
    expect(streakMessage(7).celebrate).toBe(true);
    expect(streakMessage(7).title).toContain('7 days');
  });

  test('falls back to the encouraging message on other days', () => {
    expect(streakMessage(3).celebrate).toBe(false);
    expect(streakMessage(3).title).toContain('3');
  });

  test('gives the gentle message when the streak is 0', () => {
    expect(streakMessage(0).title).toBe('A fresh start');
  });
});
