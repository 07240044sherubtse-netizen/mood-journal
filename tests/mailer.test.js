jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const nodemailer = require('nodemailer');
const mailer = require('../config/mailer');

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = 'development';
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  delete process.env.MAIL_WEBHOOK_URL;
  delete process.env.MAIL_WEBHOOK_SECRET;
  nodemailer.createTransport.mockReset();
});

afterAll(() => {
  process.env = originalEnv;
});

test('local email reports missing Gmail SMTP settings instead of pretending it sent', async () => {
  const result = await mailer.sendVerificationEmail(
    { name: 'Local User', email: 'recipient@example.com' },
    'http://localhost:3000/verify/dummy'
  );

  expect(result.failed).toBe(true);
  expect(result.error).toContain('GMAIL_USER and GMAIL_APP_PASSWORD');
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});

test('local email uses Gmail SMTP when app credentials are configured', async () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'test-message' });
  nodemailer.createTransport.mockReturnValue({ sendMail });
  process.env.GMAIL_USER = 'sender@example.com';
  process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';

  const result = await mailer.sendVerificationEmail(
    { name: 'Local User', email: 'recipient@example.com' },
    'http://localhost:3000/verify/dummy'
  );

  expect(result.sent).toBe(true);
  expect(nodemailer.createTransport).toHaveBeenCalledWith({
    service: 'gmail',
    auth: { user: 'sender@example.com', pass: 'abcdefghijklmnop' }
  });
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
    to: 'recipient@example.com',
    from: '"MoodJournal" <sender@example.com>'
  }));
});
