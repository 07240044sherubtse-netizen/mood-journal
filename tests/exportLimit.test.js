// tests/exportLimit.test.js - the "10 downloads per 15 minutes" speed limit.
//
// This lives in its own file on purpose. The rate limiter keeps its counters in
// memory, and Jest gives every test file a fresh copy of that memory, so the
// downloads below start from a clean slate instead of being mixed up with the
// other download tests.
jest.mock('../config/mailer', () => ({
  isConfigured: () => false,
  sendMail: jest.fn(async () => ({ printed: true })),
  sendVerificationEmail: jest.fn(async () => ({ printed: true })),
  sendResetEmail: jest.fn(async () => ({ printed: true }))
}));

const { resetDb, createUser, createEntry, closeDb } = require('./helpers/db');
const { signedIn } = require('./helpers/http');
const { exportLimiter } = require('../middleware/exportLimit');
const { todayInTimezone } = require('../utils/dates');

const TODAY = todayInTimezone();

beforeEach(async () => {
  await resetDb();
  for (let id = 1; id <= 20; id += 1) exportLimiter.resetKey(`user:${id}`);
});

afterAll(async () => {
  await closeDb();
});

test('the eleventh download in a row is refused with a friendly message', async () => {
  const user = await createUser({ email: 'nima@example.com' });
  await createEntry(user.id, TODAY, 'happy', 'hi');
  const agent = await signedIn('nima@example.com');

  // Ten downloads are allowed.
  for (let i = 0; i < 10; i += 1) {
    const res = await agent.get('/account/export.csv');
    expect(res.status).toBe(200);
  }

  // The eleventh is politely refused.
  const blocked = await agent.get('/account/export.csv');
  expect(blocked.status).toBe(429);
});

test('the API answers the limit with 429 JSON', async () => {
  // A throwaway account first, so this test uses a fresh rate-limit key.
  await createUser({ name: 'Someone Else', email: 'other@example.com' });
  const user = await createUser({ email: 'nima@example.com' });
  await createEntry(user.id, TODAY, 'happy', 'hi');
  const agent = await signedIn('nima@example.com');

  for (let i = 0; i < 10; i += 1) {
    await agent.get('/api/export.csv');
  }
  const blocked = await agent.get('/api/export.csv');

  expect(blocked.status).toBe(429);
  expect(blocked.body.error).toMatch(/too many downloads/i);
});
