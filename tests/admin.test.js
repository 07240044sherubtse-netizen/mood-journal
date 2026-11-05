// tests/admin.test.js - the super admin dashboard.
// It manages ACCOUNTS. It must never show anybody's mood or note.
jest.mock('../config/mailer', () => ({
  isConfigured: () => false,
  sendMail: jest.fn(async () => ({ printed: true })),
  sendVerificationEmail: jest.fn(async () => ({ printed: true })),
  sendResetEmail: jest.fn(async () => ({ printed: true }))
}));

const { db, resetDb, createUser, createEntry, closeDb } = require('./helpers/db');
const { client, csrf, login, signedIn } = require('./helpers/http');
const { todayInTimezone } = require('../utils/dates');

const TODAY = todayInTimezone();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

// A super admin and a normal person, ready to log in.
async function twoPeople() {
  const admin = await createUser({ name: 'Alice Admin', email: 'admin@example.com', role: 'superadmin' });
  const person = await createUser({ name: 'Nima', email: 'nima@example.com' });
  return { admin, person };
}

describe('who may open /admin', () => {
  test('a visitor who is not logged in is sent to the log in page', async () => {
    const res = await client().get('/admin');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('an ordinary person gets a 403 and sees no accounts', async () => {
    await twoPeople();
    const nima = await signedIn('nima@example.com');

    const res = await nima.get('/admin');

    expect(res.status).toBe(403);
    expect(res.text).toMatch(/only for super admins/i);
    expect(res.text).not.toContain('admin@example.com');
  });

  test('a super admin sees the totals and the accounts', async () => {
    await twoPeople();
    const admin = await signedIn('admin@example.com');

    const res = await admin.get('/admin');

    expect(res.status).toBe(200);
    expect(res.text).toContain('nima@example.com');
    expect(res.text).toContain('admin@example.com');
    expect(res.text).toMatch(/accounts/i);
  });

  test('the admin page never contains anybody\u2019s mood or note', async () => {
    const { person } = await twoPeople();
    await createEntry(person.id, TODAY, 'anxious', 'TOP-SECRET-NOTE');

    const admin = await signedIn('admin@example.com');
    const res = await admin.get('/admin');

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('TOP-SECRET-NOTE');
    expect(res.text).not.toContain('anxious');
  });

  test('the search box looks for text, so a % is just a character', async () => {
    await twoPeople();
    const admin = await signedIn('admin@example.com');

    const percent = await admin.get('/admin').query({ q: '%' });
    expect(percent.status).toBe(200);
    expect(percent.text).toMatch(/no account matches/i);

    const underscore = await admin.get('/admin').query({ q: '_' });
    expect(underscore.text).toMatch(/no account matches/i);

    const real = await admin.get('/admin').query({ q: 'nima' });
    expect(real.text).toContain('nima@example.com');
  });
});

describe('account actions', () => {
  test('a super admin may not deactivate their own account', async () => {
    const { admin } = await twoPeople();
    const signedInAdmin = await signedIn('admin@example.com');
    const token = await csrf(signedInAdmin, '/admin');

    const res = await signedInAdmin
      .post(`/admin/users/${admin.id}/deactivate`)
      .type('form')
      .send({ _csrf: token });

    expect(res.status).toBe(302);
    const me = await db.one('SELECT is_active FROM users WHERE id = $1', [admin.id]);
    expect(me.is_active).toBe(true);
    expect(await db.one('SELECT COUNT(*)::int AS n FROM admin_actions')).toEqual({ n: 0 });
  });

  test('a super admin may not deactivate another super admin', async () => {
    const { admin } = await twoPeople();
    const other = await createUser({ name: 'Second Admin', email: 'admin2@example.com', role: 'superadmin' });
    const signedInAdmin = await signedIn('admin@example.com');
    const token = await csrf(signedInAdmin, '/admin');

    const res = await signedInAdmin
      .post(`/admin/users/${other.id}/deactivate`)
      .type('form')
      .send({ _csrf: token });

    expect(res.status).toBe(302);
    const after = await db.one('SELECT is_active FROM users WHERE id = $1', [other.id]);
    expect(after.is_active).toBe(true);
    expect(admin.role).toBe('superadmin'); // the first admin really is the one making the change
    expect(await db.one('SELECT COUNT(*)::int AS n FROM admin_actions')).toEqual({ n: 0 });
  });

  test('deactivating a normal person writes the change down', async () => {
    const { admin, person } = await twoPeople();
    const signedInAdmin = await signedIn('admin@example.com');
    const token = await csrf(signedInAdmin, '/admin');

    const res = await signedInAdmin
      .post(`/admin/users/${person.id}/deactivate`)
      .type('form')
      .send({ _csrf: token });

    expect(res.status).toBe(302);
    expect((await db.one('SELECT is_active FROM users WHERE id = $1', [person.id])).is_active).toBe(false);

    const logged = await db.one('SELECT admin_id, action, target_user_id FROM admin_actions');
    expect(logged).toEqual({ admin_id: admin.id, action: 'deactivate', target_user_id: person.id });
  });

  test('reactivating and verifying are written down too', async () => {
    const { person } = await twoPeople();
    await db.none('UPDATE users SET is_active = false, is_verified = false WHERE id = $1', [person.id]);

    const admin = await signedIn('admin@example.com');
    const token = await csrf(admin, '/admin');

    await admin.post(`/admin/users/${person.id}/reactivate`).type('form').send({ _csrf: token });
    await admin.post(`/admin/users/${person.id}/verify`).type('form').send({ _csrf: token });

    const after = await db.one('SELECT is_active, is_verified FROM users WHERE id = $1', [person.id]);
    expect(after).toEqual({ is_active: true, is_verified: true });

    const actions = await db.any('SELECT action FROM admin_actions ORDER BY id');
    expect(actions.map((row) => row.action)).toEqual(['reactivate', 'verify']);
  });

  test('an admin action cannot be done with a plain GET', async () => {
    const { person } = await twoPeople();
    const admin = await signedIn('admin@example.com');

    const res = await admin.get(`/admin/users/${person.id}/deactivate`);

    expect(res.status).toBe(404);
    expect((await db.one('SELECT is_active FROM users WHERE id = $1', [person.id])).is_active).toBe(true);
  });
});

describe('a deactivated account', () => {
  test('cannot log in again', async () => {
    await createUser({ name: 'Nima', email: 'nima@example.com', active: false });

    const res = await login(client(), 'nima@example.com');

    expect(res.status).toBe(403);
    expect(res.text).toMatch(/deactivated/i);
  });

  test('has its open session closed on the next request', async () => {
    const { person } = await twoPeople();

    const nima = await signedIn('nima@example.com');
    expect((await nima.get('/')).status).toBe(200); // logged in and working

    const admin = await signedIn('admin@example.com');
    const token = await csrf(admin, '/admin');
    await admin.post(`/admin/users/${person.id}/deactivate`).type('form').send({ _csrf: token });

    const after = await nima.get('/');
    expect(after.status).toBe(302);
    expect(after.headers.location).toBe('/login');
  });
});
