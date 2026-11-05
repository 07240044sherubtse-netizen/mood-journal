// tests/export.test.js - "download my data" as a CSV file.
jest.mock('../config/mailer', () => ({
  isConfigured: () => false,
  sendMail: jest.fn(async () => ({ printed: true })),
  sendVerificationEmail: jest.fn(async () => ({ printed: true })),
  sendResetEmail: jest.fn(async () => ({ printed: true }))
}));

const { db, resetDb, createUser, createEntry, closeDb } = require('./helpers/db');
const { client, signedIn } = require('./helpers/http');
const { exportLimiter } = require('../middleware/exportLimit');
const { todayInTimezone, addDays, weekdayName } = require('../utils/dates');

const TODAY = todayInTimezone();
const YESTERDAY = addDays(TODAY, -1);
const THREE_DAYS_AGO = addDays(TODAY, -3);
const TOMORROW = addDays(TODAY, 1);

beforeEach(async () => {
  await resetDb();
  // resetDb restarts ids; clear the in-memory limiter keys reused by test users.
  for (let id = 1; id <= 20; id += 1) exportLimiter.resetKey(`user:${id}`);
});

afterAll(async () => {
  await closeDb();
});

// The body as text, whichever way supertest hands it back.
function csvOf(res) {
  if (typeof res.text === 'string' && res.text.length > 0) return res.text;
  return Buffer.from(res.body || '').toString('utf8');
}

// The lines of the file, without the byte-order mark and without empty lines.
function linesOf(res) {
  return csvOf(res).replace(/^\uFEFF/, '').split('\r\n').filter((line) => line.length > 0);
}

describe('who may download', () => {
  test('a visitor who is not logged in is sent to the log in page', async () => {
    const res = await client().get('/account/export.csv');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('the API answers 401 JSON instead of a redirect', async () => {
    const res = await client().get('/api/export.csv');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('You must be logged in.');
  });
});

describe('the file itself', () => {
  test('has the right headers, the right columns and one row per day', async () => {
    const user = await createUser({ email: 'nima@example.com' });
    await createEntry(user.id, THREE_DAYS_AGO, 'calm', 'A quiet day');
    await createEntry(user.id, TODAY, 'happy', 'Good, "calm" day');
    const agent = await signedIn('nima@example.com');

    const res = await agent.get('/account/export.csv');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="moodjournal-${TODAY}.csv"`);
    expect(res.headers['cache-control']).toBe('no-store');

    const text = csvOf(res);
    expect(text.charCodeAt(0)).toBe(0xfeff); // the UTF-8 BOM Excel needs

    const lines = linesOf(res);
    expect(lines[0]).toBe('"date","weekday","mood","note","logged_at","updated_at"');
    expect(lines).toHaveLength(3); // header + two days

    // Oldest day first, and the note with a comma and quotes survives.
    expect(lines[1]).toContain(`"${THREE_DAYS_AGO}","${weekdayName(THREE_DAYS_AGO)}","calm","A quiet day"`);
    expect(lines[2]).toContain(`"${TODAY}","${weekdayName(TODAY)}","happy","Good, ""calm"" day"`);
  });

  test('an entry without a note leaves that column empty', async () => {
    const user = await createUser({ email: 'nima@example.com' });
    await createEntry(user.id, TODAY, 'neutral', null);
    const agent = await signedIn('nima@example.com');

    const lines = linesOf(await agent.get('/account/export.csv'));

    // The note column is an empty pair of quotes, then the next column starts.
    expect(lines[1]).toContain(`"${TODAY}","${weekdayName(TODAY)}","neutral","",`);
  });

  test('the API serves the same file', async () => {
    const user = await createUser({ email: 'nima@example.com' });
    await createEntry(user.id, TODAY, 'happy', 'hi');
    const agent = await signedIn('nima@example.com');

    const res = await agent.get('/api/export.csv');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(linesOf(res)[0]).toBe('"date","weekday","mood","note","logged_at","updated_at"');
    expect(linesOf(res)).toHaveLength(2);
  });
});

describe('only my own rows', () => {
  test('my file never contains another person\u2019s note', async () => {
    const nima = await createUser({ name: 'Nima', email: 'nima@example.com' });
    const karma = await createUser({ name: 'Karma', email: 'karma@example.com' });
    await createEntry(nima.id, TODAY, 'happy', 'NIMA-NOTE');
    await createEntry(karma.id, TODAY, 'sad', 'KARMA-NOTE');

    const nimaFile = csvOf(await (await signedIn('nima@example.com')).get('/account/export.csv'));
    const karmaFile = csvOf(await (await signedIn('karma@example.com')).get('/account/export.csv'));

    expect(nimaFile).toContain('NIMA-NOTE');
    expect(nimaFile).not.toContain('KARMA-NOTE');
    expect(karmaFile).toContain('KARMA-NOTE');
    expect(karmaFile).not.toContain('NIMA-NOTE');
  });
});

describe('the from and to filters', () => {
  test('only the days inside the range are downloaded', async () => {
    const user = await createUser({ email: 'nima@example.com' });
    await createEntry(user.id, THREE_DAYS_AGO, 'calm', 'oldest');
    await createEntry(user.id, YESTERDAY, 'tired', 'middle');
    await createEntry(user.id, TODAY, 'happy', 'newest');
    const agent = await signedIn('nima@example.com');

    const res = await agent.get(`/account/export.csv?from=${YESTERDAY}&to=${TODAY}`);
    const lines = linesOf(res);

    expect(lines).toHaveLength(3); // header + two days
    expect(csvOf(res)).toContain('middle');
    expect(csvOf(res)).toContain('newest');
    expect(csvOf(res)).not.toContain('oldest');
  });

  test('from only, with no to, gives everything from that day on', async () => {
    const user = await createUser({ email: 'nima@example.com' });
    await createEntry(user.id, THREE_DAYS_AGO, 'calm', 'too old');
    await createEntry(user.id, TODAY, 'happy', 'kept');
    const agent = await signedIn('nima@example.com');

    const res = await agent.get(`/account/export.csv?from=${YESTERDAY}`);
    const text = csvOf(res);

    expect(text).toContain('kept');
    expect(text).not.toContain('too old');
  });

  test('a range with nothing in it says so instead of handing over an empty file', async () => {
    await createUser({ email: 'nima@example.com' }); // no entries at all
    const agent = await signedIn('nima@example.com');

    const res = await agent.get('/account/export.csv');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account');

    const page = await agent.get('/account');
    expect(page.text).toMatch(/nothing to download yet/i);
  });
});

describe('a range that does not make sense', () => {
  test('the page sends you back with a message', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    const badDate = await agent.get('/account/export.csv?from=2026-13-01');
    expect(badDate.status).toBe(302);
    expect(badDate.headers.location).toBe('/account');

    const backwards = await agent.get(`/account/export.csv?from=${TODAY}&to=${YESTERDAY}`);
    expect(backwards.status).toBe(302);

    const future = await agent.get(`/account/export.csv?to=${TOMORROW}`);
    expect(future.status).toBe(302);

    // And the reason is shown on the account page.
    const page = await agent.get('/account');
    expect(page.text).toMatch(/cannot be in the future|must not be after/i);
  });

  test('the API answers 400 JSON', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    const badDate = await agent.get('/api/export.csv?from=hello');
    expect(badDate.status).toBe(400);
    expect(badDate.body.error).toMatch(/real date/i);

    const backwards = await agent.get(`/api/export.csv?from=${TODAY}&to=${YESTERDAY}`);
    expect(backwards.status).toBe(400);

    const future = await agent.get(`/api/export.csv?from=${TOMORROW}`);
    expect(future.status).toBe(400);
    expect(future.body.error).toMatch(/future/i);
  });

  test('the API still sends a valid, empty file when nothing matches', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = await signedIn('nima@example.com');

    const res = await agent.get(`/api/export.csv?from=${YESTERDAY}&to=${TODAY}`);

    expect(res.status).toBe(200);
    expect(linesOf(res)).toEqual(['"date","weekday","mood","note","logged_at","updated_at"']);
  });
});
