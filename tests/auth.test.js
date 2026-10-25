// tests/auth.test.js - signing up, verifying, logging in, logging out and
// resetting a password - the whole account flow, through the real forms.
//
// config/mailer is replaced by a fake, so no email is ever sent and the
// terminal stays clean. The verification token is read from the database
// instead, exactly like clicking the link in the email.
jest.mock('../config/mailer', () => ({
  isConfigured: () => false,
  sendMail: jest.fn(async () => ({ printed: true })),
  sendVerificationEmail: jest.fn(async () => ({ printed: true })),
  sendResetEmail: jest.fn(async () => ({ printed: true }))
}));

const mailer = require('../config/mailer');
const { db, resetDb, createUser, giveResetToken, closeDb } = require('./helpers/db');
const { client, csrf, login } = require('./helpers/http');

beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
});

afterAll(async () => {
  await closeDb();
});

describe('signing up', () => {
  test('creates an unverified account and asks the person to check their email', async () => {
    const agent = client();
    const token = await csrf(agent, '/signup');

    const res = await agent.post('/signup').type('form').send({
      _csrf: token,
      name: 'Nima Wangmo',
      email: 'Nima@Example.com',
      password: 'password123',
      confirmPassword: 'password123'
    });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Almost there');

    const user = await db.one('SELECT * FROM users WHERE email = $1', ['nima@example.com']);
    expect(user.name).toBe('Nima Wangmo');
    expect(user.is_verified).toBe(false); // must verify first
    expect(user.role).toBe('user');       // a form can never choose a role
    expect(user.password_hash).not.toBe('password123'); // never stored as plain text
    expect(user.verification_token).toBeTruthy();
    expect(mailer.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  test('refuses two different passwords', async () => {
    const agent = client();
    const token = await csrf(agent, '/signup');

    const res = await agent.post('/signup').type('form').send({
      _csrf: token,
      name: 'Nima',
      email: 'nima@example.com',
      password: 'password123',
      confirmPassword: 'something-else'
    });

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/do not match/i);
    const { n } = await db.one('SELECT COUNT(*)::int AS n FROM users');
    expect(n).toBe(0);
  });

  test('refuses an email that is already registered', async () => {
    await createUser({ email: 'taken@example.com' });

    const agent = client();
    const token = await csrf(agent, '/signup');
    const res = await agent.post('/signup').type('form').send({
      _csrf: token,
      name: 'Someone Else',
      email: 'taken@example.com',
      password: 'password123',
      confirmPassword: 'password123'
    });

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/already exists/i);
    const { n } = await db.one('SELECT COUNT(*)::int AS n FROM users');
    expect(n).toBe(1);
  });

  test('refuses a form without the CSRF token', async () => {
    const agent = client();
    await csrf(agent, '/signup'); // a real session, but no token is sent back

    const res = await agent.post('/signup').type('form').send({
      name: 'Nima',
      email: 'nima@example.com',
      password: 'password123',
      confirmPassword: 'password123'
    });

    expect(res.status).toBe(403);
    const { n } = await db.one('SELECT COUNT(*)::int AS n FROM users');
    expect(n).toBe(0);
  });

  test('refuses a wrong CSRF token', async () => {
    const agent = client();
    await csrf(agent, '/signup');

    const res = await agent.post('/signup').type('form').send({
      _csrf: 'not-the-real-token',
      name: 'Nima',
      email: 'nima@example.com',
      password: 'password123',
      confirmPassword: 'password123'
    });

    expect(res.status).toBe(403);
  });
});

describe('verifying an email', () => {
  test('a valid link verifies the account, and the same link cannot be used twice', async () => {
    const user = await createUser({ email: 'nima@example.com', verified: false });
    await db.none('UPDATE users SET verification_token = $2 WHERE id = $1', [user.id, 'verify-me-123']);

    const agent = client();
    const first = await agent.get('/verify/verify-me-123');
    expect(first.status).toBe(200);
    expect(first.text).toMatch(/verified/i);

    const after = await db.one('SELECT * FROM users WHERE id = $1', [user.id]);
    expect(after.is_verified).toBe(true);
    expect(after.verification_token).toBeNull(); // the token is burned

    const second = await agent.get('/verify/verify-me-123');
    expect(second.status).toBe(400);
  });

  test('an unknown link is refused without a 500', async () => {
    const res = await client().get('/verify/definitely-not-a-real-token');
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/not valid/i);
  });
});

describe('logging in', () => {
  test('refuses an account that has not verified its email yet', async () => {
    await createUser({ email: 'nima@example.com', verified: false });

    const agent = client();
    const res = await login(agent, 'nima@example.com');

    expect(res.status).toBe(403);
    expect(res.text).toMatch(/verify your email/i);
  });

  test('refuses a deactivated account', async () => {
    await createUser({ email: 'gone@example.com', active: false });

    const agent = client();
    const res = await login(agent, 'gone@example.com');

    expect(res.status).toBe(403);
    expect(res.text).toMatch(/deactivated/i);
  });

  test('gives the same message for a wrong password and an unknown email', async () => {
    await createUser({ email: 'nima@example.com' });

    const wrongPassword = await login(client(), 'nima@example.com', 'not-the-password');
    const unknownEmail = await login(client(), 'nobody@example.com');

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.text).toContain('Incorrect email or password.');
    expect(unknownEmail.text).toContain('Incorrect email or password.');
  });

  test('lets a verified account in and opens the dashboard', async () => {
    await createUser({ email: 'nima@example.com' });

    const agent = client();
    const res = await login(agent, 'nima@example.com');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    const dashboard = await agent.get('/');
    expect(dashboard.status).toBe(200);
  });

  test('accepts the email with capital letters and spaces', async () => {
    await createUser({ email: 'nima@example.com' });

    const res = await login(client(), '  NIMA@Example.COM ');
    expect(res.status).toBe(302);
  });
});

describe('logging out', () => {
  test('closes the session and cannot be done with a plain link', async () => {
    await createUser({ email: 'nima@example.com' });
    const agent = client();
    await login(agent, 'nima@example.com');

    // A GET on /logout does nothing: it is a POST-only route.
    const asLink = await agent.get('/logout');
    expect(asLink.status).toBe(404);
    expect((await agent.get('/')).status).toBe(200); // still logged in

    const token = await csrf(agent, '/');
    const out = await agent.post('/logout').type('form').send({ _csrf: token });
    expect(out.status).toBe(302);
    expect(out.headers.location).toBe('/login');

    const after = await agent.get('/');
    expect(after.status).toBe(302);
    expect(after.headers.location).toBe('/login');
  });
});

describe('resetting a password', () => {
  test('sends the same answer whether the email exists or not', async () => {
    await createUser({ email: 'nima@example.com' });

    const knownAgent = client();
    const knownToken = await csrf(knownAgent, '/forgot-password');
    const known = await knownAgent.post('/forgot-password').type('form').send({
      _csrf: knownToken,
      email: 'nima@example.com'
    });

    const unknownAgent = client();
    const unknownToken = await csrf(unknownAgent, '/forgot-password');
    const unknown = await unknownAgent.post('/forgot-password').type('form').send({
      _csrf: unknownToken,
      email: 'nobody@example.com'
    });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    // Nobody can tell from the answer whether an email is registered.
    expect(known.text).toContain('If that email address is in our system');
    expect(unknown.text).toContain('If that email address is in our system');
    expect(mailer.sendResetEmail).toHaveBeenCalledTimes(1); // only the real one
  });

  test('a real email gets a link, and the new password works once', async () => {
    const user = await createUser({ email: 'nima@example.com' });

    const agent = client();
    const forgotToken = await csrf(agent, '/forgot-password');
    const asked = await agent.post('/forgot-password').type('form').send({
      _csrf: forgotToken,
      email: 'nima@example.com'
    });
    expect(asked.status).toBe(200);
    expect(asked.text).toMatch(/if that email address is in our system/i);
    expect(mailer.sendResetEmail).toHaveBeenCalledTimes(1);

    const stored = await db.one('SELECT reset_token FROM users WHERE id = $1', [user.id]);
    expect(stored.reset_token).toBeTruthy();

    const link = `/reset-password/${stored.reset_token}`;
    const form = await agent.get(link);
    expect(form.status).toBe(200);

    const pageToken = await csrf(agent, link);
    const changed = await agent.post(link).type('form').send({
      _csrf: pageToken,
      password: 'brand-new-password',
      confirmPassword: 'brand-new-password'
    });
    expect(changed.status).toBe(200);
    expect(changed.text).toMatch(/password has been changed/i);

    // The link is single use.
    expect((await agent.get(link)).status).toBe(400);

    // The new password works, the old one does not.
    expect((await login(client(), 'nima@example.com', 'brand-new-password')).status).toBe(302);
    expect((await login(client(), 'nima@example.com', 'password123')).status).toBe(401);
  });

  test('refuses a short new password', async () => {
    const user = await createUser({ email: 'nima@example.com' });
    await giveResetToken(user.id, 'short-token');

    const agent = client();
    const link = '/reset-password/short-token';
    const pageToken = await csrf(agent, link);
    const res = await agent.post(link).type('form').send({
      _csrf: pageToken,
      password: 'short',
      confirmPassword: 'short'
    });

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/at least 8/i);
  });

  test('refuses a link that has expired', async () => {
    const user = await createUser({ email: 'nima@example.com' });
    await giveResetToken(user.id, 'old-token', -60); // expired an hour ago

    const res = await client().get('/reset-password/old-token');
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/expired/i);
  });
});
