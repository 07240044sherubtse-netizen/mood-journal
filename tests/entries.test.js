// tests/entries.test.js - the diary rules: one entry per day, today only,
// and nobody can see anybody else's day.
jest.mock('../config/mailer', () => ({
  isConfigured: () => false,
  sendMail: jest.fn(async () => ({ printed: true })),
  sendVerificationEmail: jest.fn(async () => ({ printed: true })),
  sendResetEmail: jest.fn(async () => ({ printed: true }))
}));

const { db, resetDb, createUser, createEntry, count, closeDb } = require('./helpers/db');
const { client, csrf, signedIn } = require('./helpers/http');
const { todayInTimezone, addDays } = require('../utils/dates');

// The days used by the tests, worked out the same way the app works them out.
const TODAY = todayInTimezone();
const YESTERDAY = addDays(TODAY, -1);
const TOMORROW = addDays(TODAY, 1);

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

// Save today's mood through the real form.
async function saveToday(agent, fields) {
  const token = await csrf(agent, '/');
  return agent.post('/entries/today').type('form').send({ _csrf: token, ...fields });
}

describe('saving today', () => {
  test('stores today\u2019s mood and note', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    const res = await saveToday(agent, { mood: 'happy', note: 'A good day' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    const saved = await db.one('SELECT * FROM entries');
    expect(saved.entry_date).toBe(TODAY);
    expect(saved.mood).toBe('happy');
    expect(saved.note).toBe('A good day');

    // The day can be read back on its own page.
    const page = await agent.get(`/entries/${TODAY}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('A good day');
  });

  test('keeps only ONE entry per day, even after saving twice', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    await saveToday(agent, { mood: 'happy', note: 'first' });
    await saveToday(agent, { mood: 'calm', note: 'second' });

    expect(await count('entries')).toBe(1); // the database enforces this
    const saved = await db.one('SELECT * FROM entries');
    expect(saved.mood).toBe('calm');
    expect(saved.note).toBe('second');
  });

  test('an empty note is stored as no note at all', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    await saveToday(agent, { mood: 'neutral', note: '   ' });

    const saved = await db.one('SELECT * FROM entries');
    expect(saved.note).toBeNull();
  });

  test('refuses a mood the server does not know and saves nothing', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    const res = await saveToday(agent, { mood: 'sleepy' });
    expect(res.status).toBe(302);
    expect(await count('entries')).toBe(0);

    const dashboard = await agent.get('/');
    expect(dashboard.text).toContain('Please choose one of the eight moods.');
  });

  test('refuses a note longer than 200 characters and saves nothing', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    await saveToday(agent, { mood: 'happy', note: 'x'.repeat(201) });
    expect(await count('entries')).toBe(0);
  });
});

describe('today is the only day that can be written', () => {
  test('accepts today when a date is sent along', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    const res = await saveToday(agent, { mood: 'excited', date: TODAY });
    expect(res.status).toBe(302);
    expect(await count('entries')).toBe(1);
  });

  test('refuses a past date, even when a form pretends otherwise', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    const res = await saveToday(agent, { mood: 'happy', date: YESTERDAY });
    expect(res.status).toBe(403);
    expect(res.text).toMatch(/that day is closed/i);
    expect(await count('entries')).toBe(0);
  });

  test('refuses a future date', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    const res = await saveToday(agent, { mood: 'happy', date: TOMORROW });
    expect(res.status).toBe(403);
    expect(await count('entries')).toBe(0);
  });
});

describe('reading a day', () => {
  test('a day that was logged can be read back', async () => {
    const user = await createUser({ email: 'nima@example.com' });
    await createEntry(user.id, YESTERDAY, 'sad', 'A grey day');
    const agent = await signedIn('nima@example.com');

    const res = await agent.get(`/entries/${YESTERDAY}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('A grey day');
  });

  test('a day with no entry gives a 404', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    expect((await agent.get(`/entries/${YESTERDAY}`)).status).toBe(404);
  });

  test('a date that is not a real date gives a 400', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    expect((await agent.get('/entries/2026-13-01')).status).toBe(400);
    expect((await agent.get('/entries/not-a-date')).status).toBe(400);
  });
});

describe('privacy between two people', () => {
  test('one person can never read the other person\u2019s days', async () => {
    const nima = await createUser({ name: 'Nima', email: 'nima@example.com' });
    const karma = await createUser({ name: 'Karma', email: 'karma@example.com' });
    await createEntry(nima.id, TODAY, 'anxious', 'NIMA-ONLY-NOTE');
    await createEntry(nima.id, YESTERDAY, 'sad', 'NIMA-ONLY-NOTE-2');

    const threeDaysAgo = addDays(TODAY, -3);
    await createEntry(karma.id, threeDaysAgo, 'happy', 'KARMA-ONLY-NOTE');

    const karmaAgent = await signedIn('karma@example.com');

    // Nima's days answer "no entry" for Karma, even with the exact same URL.
    expect((await karmaAgent.get(`/entries/${TODAY}`)).status).toBe(404);
    expect((await karmaAgent.get(`/entries/${YESTERDAY}`)).status).toBe(404);

    // Karma's own day still works, so the 404s above really are about privacy.
    const own = await karmaAgent.get(`/entries/${threeDaysAgo}`);
    expect(own.status).toBe(200);
    expect(own.text).toContain('KARMA-ONLY-NOTE');
    expect(own.text).not.toContain('NIMA-ONLY-NOTE');

    // And the database confirms whose row is whose.
    const rows = await db.any('SELECT user_id, note FROM entries ORDER BY id');
    expect(rows.map((row) => row.user_id)).toEqual([nima.id, nima.id, karma.id]);
  });
});

describe('a visitor who is not logged in', () => {
  test('is sent to the log in page from every private page', async () => {
    const visitor = client();
    const pages = ['/', '/calendar', '/stats', '/account', `/entries/${TODAY}`];

    for (const page of pages) {
      const res = await visitor.get(page);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    }
  });
});
