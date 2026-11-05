const { weekStart, buildWeek, buildMoodDistribution, summarizeMonth } = require('./analytics');

describe('Mood Analytics helpers', () => {
  test('starts weeks on Monday across month and year boundaries', () => {
    expect(weekStart('2026-03-01')).toBe('2026-02-23'); // Sunday
    expect(weekStart('2026-01-01')).toBe('2025-12-29'); // Thursday
    expect(weekStart('2026-03-02')).toBe('2026-03-02'); // Monday
  });

  test('always returns seven days and leaves missed days empty', () => {
    const days = buildWeek('2026-03-02', [
      { entry_date: '2026-03-02', mood: 'calm' },
      { entry_date: '2026-03-04', mood: 'sad' }
    ]);
    expect(days).toHaveLength(7);
    expect(days.map((day) => day.mood)).toEqual(['calm', null, 'sad', null, null, null, null]);
    expect(days[1].moodLabel).toBeNull();
  });

  test('counts the month mood distribution, categories and streak summary', () => {
    const entries = [
      { entry_date: '2026-03-02', mood: 'happy' },
      { entry_date: '2026-03-03', mood: 'happy' },
      { entry_date: '2026-03-04', mood: 'neutral' },
      { entry_date: '2026-03-05', mood: 'sad' }
    ];
    const summary = summarizeMonth(entries, entries.map((entry) => entry.entry_date), '2026-03-05');
    expect(summary.totalThisMonth).toBe(4);
    expect(summary.totalAllTime).toBe(4);
    expect(summary.mostFrequent.key).toBe('happy');
    expect([summary.positive, summary.neutral, summary.negative]).toEqual([2, 1, 1]);
    expect(summary.currentStreak).toBe(4);
    expect(summary.longestStreak).toBe(4);
    expect(buildMoodDistribution([]).every((mood) => mood.count === 0)).toBe(true);
  });
});
