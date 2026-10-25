// tests/api.test.js - the JSON API: sessions, CSRF, moods, dates and privacy.
jest.mock('../config/mailer', () => ({
  isConfigured: () => false,
  sendMail: jest.fn(async () => ({ printed: true })),
  sendVerificationEmail: jest.fn(async () => ({ printed: true })),
  sendResetEmail: jest.fn(async () => ({ printed: true }))
}));

const { db, resetDb, createUser, createEntry, count, closeDb } = require('./helpers/db');
const { client, csrf, signedIn } = require('./helpers/http');
const { todayInTimezone, todayParts, addDays } = require('../utils/dates');
const { MOOD_KEYS } = require('../utils/moods');

const TODAY = todayInTimezone();
const YESTERDAY = addDays(TODAY, -1);
const TOMORROW = addDays(TODAY, 1);

// The month after this one, for the "no looking into the future" tests.
function nextMonth() {
  const now = todayParts();
  let year = now.year;
  let month = now.month + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe('the health check', () => {
  test('needs no login and shows nothing about the database', async () => {
    const res = await client().get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.text).not.toMatch(/postgres|version|password|host/i);
  });
});

describe('a call without a session', () => {
  test('always answers 401 JSON, never a redirect', async () => {
    const visitor = client();

    for (const url of ['/api/stats', '/api/entries', `/api/entries/${TODAY}`]) {
      const res = await visitor.get(url);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('You must be logged in.');
      expect(res.headers['content-type']).toMatch(/json/);
    }
  });

  test('a state-changing call is 401, not 403: there is no session to protect', async () => {
    const res = await client().put('/api/entries/today').send({ mood: 'happy' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('You must be logged in.');
  });
});

describe('CSRF protection on the API', () => {
  test('a logged-in call without the token is refused', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    const res = await agent.put('/api/entries/today').send({ mood: 'happy' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid CSRF token.');
    expect(await count('entries')).toBe(0);
  });

  test('a logged-in call with the token is accepted', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    const token = await csrf(agent, '/');
    const res = await agent
      .put('/api/entries/today')
      .set('X-CSRF-Token', token)
      .send({ mood: 'excited', note: 'Hi there' });

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
    expect(res.body.entry.mood).toBe('excited');
    expect(res.body.entry.note).toBe('Hi there');
    expect(res.body.entry.date).toBe(TODAY);
    expect(res.body.entry.isToday).toBe(true);
    expect(res.body.entry.editable).toBe(true);
    expect(res.body.entry.emoji).toBeTruthy();
    expect(res.body.entry.color).toBeTruthy();

    expect(await count('entries')).toBe(1);
  });
});

describe('PUT /api/entries/today', () => {
  test('changing today again updates the same row instead of adding one', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');
    const token = await csrf(agent, '/');

    await agent.put('/api/entries/today').set('X-CSRF-Token', token).send({ mood: 'happy', note: 'one' });
    const second = await agent
      .put('/api/entries/today')
      .set('X-CSRF-Token', token)
      .send({ mood: 'calm', note: 'two' });

    expect(second.status).toBe(200);
    expect(await count('entries')).toBe(1);
    const row = await db.one('SELECT mood, note FROM entries');
    expect(row).toEqual({ mood: 'calm', note: 'two' });
  });

  test('refuses a mood that is not one of the eight and lists the real ones', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');
    const token = await csrf(agent, '/');

    const res = await agent.put('/api/entries/today').set('X-CSRF-Token', token).send({ mood: 'chaotic' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('mood must be one of');
    MOOD_KEYS.forEach((key) => expect(res.body.error).toContain(key));
    expect(await count('entries')).toBe(0);
  });

  test('refuses a date in the body that is not today', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');
    const token = await csrf(agent, '/');

    const past = await agent
      .put('/api/entries/today')
      .set('X-CSRF-Token', token)
      .send({ mood: 'happy', date: YESTERDAY });
    const future = await agent
      .put('/api/entries/today')
      .set('X-CSRF-Token', token)
      .send({ mood: 'happy', entry_date: TOMORROW });

    expect(past.status).toBe(403);
    expect(future.status).toBe(403);
    expect(await count('entries')).toBe(0);
  });

  test('refuses a note longer than 200 characters', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');
    const token = await csrf(agent, '/');

    const res = await agent
      .put('/api/entries/today')
      .set('X-CSRF-Token', token)
      .send({ mood: 'happy', note: 'x'.repeat(201) });

    expect(res.status).toBe(400);
    expect(await count('entries')).toBe(0);
  });
});

describe('GET /api/entries', () => {
  test('returns this month\u2019s entries, oldest first', async () => {
    const user = await createUser({ email: 'nima@example.com' });
    // Two days of THIS month (on the 1st of a month there is only one).
    const firstOfMonth = `${TODAY.slice(0, 7)}-01`;
    const dates = firstOfMonth === TODAY ? [TODAY] : [firstOfMonth, TODAY];
    for (const date of dates) {
      await createEntry(user.id, date, 'calm');
    }
    await db.none('UPDATE entries SET mood = $1, note = $2 WHERE entry_date = $3', ['happy', 'today', TODAY]);
    const agent = await signedIn('nima@example.com');

    const res = await agent.get('/api/entries');

    expect(res.status).toBe(200);
    expect(res.body.entries.map((e) => e.date)).toEqual(dates);
    expect(res.body.count).toBe(res.body.entries.length);
    expect(res.body.entries[res.body.entries.length - 1])
      .toMatchObject({ date: TODAY, mood: 'happy', note: 'today', isToday: true });
  });

  test('refuses a month that is not written as YYYY-MM', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    expect((await agent.get('/api/entries?month=2026-1')).status).toBe(400);
    expect((await agent.get('/api/entries?month=hello')).status).toBe(400);
  });

  test('refuses a month that cannot exist and a month in the future', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    expect((await agent.get('/api/entries?month=2026-13')).status).toBe(400);
    expect((await agent.get(`/api/entries?month=${nextMonth()}`)).status).toBe(400);
  });
});

describe('GET /api/entries/:date', () => {
  test('returns one of my days', async () => {
    const user = await createUser({ email: 'nima@example.com' });
    await createEntry(user.id, TODAY, 'tired', 'slept badly');
    const agent = await signedIn('nima@example.com');

    const res = await agent.get(`/api/entries/${TODAY}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: TODAY, mood: 'tired', note: 'slept badly', editable: true });
    expect(res.body.weekday).toBeTruthy();
    expect(res.body.loggedAt).toBeTruthy();
  });

  test('says 404 for a day with no entry', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    expect((await agent.get(`/api/entries/${YESTERDAY}`)).status).toBe(404);
  });

  test('refuses a future date and a date that is not a date', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    expect((await agent.get(`/api/entries/${TOMORROW}`)).status).toBe(400);
    expect((await agent.get('/api/entries/2026-13-01')).status).toBe(400);
  });

  test('never returns somebody else\u2019s day', async () => {
    const nima = await createUser({ name: 'Nima', email: 'nima@example.com' });
    await createUser({ name: 'Karma', email: 'karma@example.com' });
    await createEntry(nima.id, TODAY, 'angry', 'NIMA-ONLY-NOTE');

    const karma = await signedIn('karma@example.com');
    const res = await karma.get(`/api/entries/${TODAY}`);

    expect(res.status).toBe(404);
    expect(res.text).not.toContain('NIMA-ONLY-NOTE');
  });
});

describe('GET /api/stats', () => {
  test('reports streaks, totals and this month\u2019s moods', async () => {
    const user = await createUser({ email: 'nima@example.com' });
    const dates = [TODAY, YESTERDAY, addDays(TODAY, -2)];
    await createEntry(user.id, dates[0], 'happy');
    await createEntry(user.id, dates[1], 'happy');
    await createEntry(user.id, dates[2], 'calm');
    const agent = await signedIn('nima@example.com');

    const res = await agent.get('/api/stats');
    expect(res.status).toBe(200);

    expect(res.body.today).toBe(TODAY);
    expect(res.body.currentStreak).toBe(3);
    expect(res.body.longestStreak).toBe(3);
    expect(res.body.loggedToday).toBe(true);
    expect(res.body.totalAllTime).toBe(3);

    // Every one of the eight moods is reported, even the unused ones.
    expect(res.body.thisMonth.moods).toHaveLength(8);
    const used = res.body.thisMonth.moods.filter((m) => m.count > 0).map((m) => m.mood).sort();
    expect(used).toEqual(['calm', 'happy']);
    expect(res.body.thisMonth.mostFrequent.mood).toBe('happy');

    // Only the days that fall in this calendar month are counted here.
    const inThisMonth = dates.filter((date) => date.slice(0, 7) === TODAY.slice(0, 7)).length;
    expect(res.body.thisMonth.total).toBe(inThisMonth);
  });

  test('one person\u2019s totals never include another person\u2019s entries', async () => {
    const nima = await createUser({ name: 'Nima', email: 'nima@example.com' });
    await createUser({ name: 'Karma', email: 'karma@example.com' });
    await createEntry(nima.id, TODAY, 'happy');
    await createEntry(nima.id, YESTERDAY, 'happy');

    const karma = await signedIn('karma@example.com');
    const res = await karma.get('/api/stats');

    expect(res.body.totalAllTime).toBe(0);
    expect(res.body.currentStreak).toBe(0);
    expect(res.body.loggedToday).toBe(false);
  });
});
