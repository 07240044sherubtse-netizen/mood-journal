// config/mailer.js - sends verification and password-reset emails.
//
// WHY NOT SMTP: Render's free plan blocks the outbound mail ports (25/465/587),
// so talking to Gmail directly would always time out in production. Instead we
// POST over HTTPS (port 443, never blocked) to a small Google Apps Script web app
// that does the actual sending. Only Node's built-in https module is used here,
// so no extra package is needed. See DEPLOYMENT.md for the relay code.
//
// Mail is never printed to logs: those messages contain single-use links.
const https = require('https');
const nodemailer = require('nodemailer');

const SENDER_NAME = 'MoodJournal'; // the name the recipient sees in their inbox
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 64 * 1024;

function mailError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isAllowedRelayHost(hostname) {
  return hostname === 'script.google.com' || hostname === 'script.googleusercontent.com';
}

function isConfigured() {
  return Boolean(process.env.MAIL_WEBHOOK_URL && process.env.MAIL_WEBHOOK_SECRET);
}

// POST JSON to the relay and follow the redirect Apps Script always replies with
// (it answers 302 and puts the real result behind that link, which wants a GET).
function requestJson(url, payload, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !isAllowedRelayHost(target.hostname)) {
      return reject(mailError('MAIL_REDIRECT_HOST_REJECTED'));
    }
    const body = payload ? JSON.stringify(payload) : null;

    const request = https.request(
      {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: body ? 'POST' : 'GET',
        headers: body
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          : {}
      },
      (response) => {
        const status = response.statusCode || 0;

        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume(); // discard this (empty) body
          if (redirectsLeft <= 0) {
            return reject(mailError('MAIL_TOO_MANY_REDIRECTS'));
          }
          const next = new URL(response.headers.location, url).toString();
          return resolve(requestJson(next, null, redirectsLeft - 1));
        }

        let text = '';
        let responseBytes = 0;
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBytes += Buffer.byteLength(chunk);
          if (responseBytes <= MAX_RESPONSE_BYTES) text += chunk;
        });
        response.on('end', () => {
          if (status < 200 || status >= 300) {
            return reject(mailError(`MAIL_HTTP_${status}`));
          }
          if (responseBytes > MAX_RESPONSE_BYTES) return reject(mailError('MAIL_RESPONSE_TOO_LARGE'));

          let answer = {};
          try { answer = JSON.parse(text); } catch (err) { return reject(mailError('MAIL_INVALID_RESPONSE')); }

          if (answer.ok === false) {
            const knownRelayCodes = [
              'SECRET_NOT_SET', 'SECRET_MISMATCH', 'INVALID_REQUEST',
              'QUOTA_EXHAUSTED', 'SEND_FAILED'
            ];
            const relayCode = knownRelayCodes.includes(answer.code) ? answer.code : 'REJECTED';
            return reject(mailError(`MAIL_RELAY_${relayCode}`));
          }
          resolve(answer);
        });
      }
    );

    request.setTimeout(TIMEOUT_MS, () => {
      request.destroy(mailError('MAIL_TIMEOUT'));
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

// The single place that talks to the mail relay.
async function sendMail({ to, subject, html, text }) {
  // Local development sends directly through Gmail SMTP. Apps Script is only
  // used by the deployed production service.
  if (process.env.NODE_ENV !== 'production') {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return {
        failed: true,
        error: 'Local Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.'
      };
    }

    const sender = String(process.env.GMAIL_USER).trim();
    const appPassword = String(process.env.GMAIL_APP_PASSWORD).replace(/\s/g, '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) {
      return { failed: true, error: 'GMAIL_USER must be the full Gmail sender address.' };
    }
    if (appPassword.length !== 16) {
      return { failed: true, error: 'GMAIL_APP_PASSWORD must be the 16-character App Password from Google, without other text.' };
    }

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: sender, pass: appPassword }
      });
      await transporter.sendMail({
        from: `"${SENDER_NAME}" <${sender}>`,
        to,
        subject,
        html,
        text
      });
      return { sent: true };
    } catch (err) {
      const code = err.code === 'EAUTH'
        ? `MAIL_SMTP_EAUTH_${Number(err.responseCode) || 'FAILED'}`
        : ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(err.code)
          ? `MAIL_SMTP_${err.code}`
          : 'MAIL_SMTP_ERROR';
      console.error(`Email delivery failed (${code}).`);
      const message = err.code === 'EAUTH'
        ? 'Gmail rejected the SMTP login. Check GMAIL_USER and use a fresh 16-character Google App Password, not your regular password.'
        : 'Local Gmail SMTP could not deliver the email. Check the Gmail SMTP settings and network connection.';
      return { failed: true, error: message };
    }
  }

  if (!isConfigured()) {
    return { failed: true, error: 'Email delivery is not configured. Set MAIL_WEBHOOK_URL and MAIL_WEBHOOK_SECRET.' };
  }

  try {
    const relayUrl = new URL(process.env.MAIL_WEBHOOK_URL);
    if (relayUrl.protocol !== 'https:' || relayUrl.hostname !== 'script.google.com') {
      return { failed: true, error: 'MAIL_WEBHOOK_URL must be an HTTPS Google Apps Script web app URL.' };
    }
    const result = await requestJson(relayUrl.toString(), {
      secret: process.env.MAIL_WEBHOOK_SECRET || '',
      name: SENDER_NAME,
      to,
      subject,
      html,
      text
    });
    if (result.ok !== true) {
      console.error('Email delivery failed (MAIL_NO_CONFIRMATION). Check that the deployed Apps Script returns JSON with ok: true.');
      return { failed: true, error: 'The email relay did not confirm delivery.' };
    }
    return result;
  } catch (err) {
    // Log only a fixed error category. Never log a URL, response, email or token.
    const code = /^MAIL_[A-Z0-9_]+$/.test(err.code || '')
      ? err.code
      : ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'CERT_HAS_EXPIRED'].includes(err.code)
        ? `MAIL_NETWORK_${err.code}`
        : 'MAIL_NETWORK_ERROR';
    console.error(`Email delivery failed (${code}).`);
    return { failed: true, error: 'The email service could not send the message. Please try again later.' };
  }
}

async function sendVerificationEmail(user, link) {
  return sendMail({
    to: user.email,
    subject: 'Welcome to MoodJournal - please verify your email',
    text: `Hello ${user.name},\n\nWelcome to MoodJournal!\nPlease confirm your email address by opening this link:\n${link}\n\nIf you did not sign up, you can ignore this email.`,
    html: `
      <div style="font-family:system-ui,sans-serif;color:#3A3632">
        <h2 style="margin:0 0 12px">Welcome to MoodJournal 🌈</h2>
        <p>Hello ${user.name},</p>
        <p>Please confirm your email address so you can start logging your moods.</p>
        <p><a href="${link}" style="background:#E8A87C;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Verify my email</a></p>
        <p style="color:#7A736B;font-size:14px">Or paste this link in your browser:<br>${link}</p>
      </div>`
  });
}

async function sendResetEmail(user, link) {
  return sendMail({
    to: user.email,
    subject: 'MoodJournal - reset your password',
    text: `Hello ${user.name},\n\nSomeone asked to reset the password for your MoodJournal account.\nOpen this link to choose a new password (it expires in 1 hour):\n${link}\n\nIf it was not you, you can ignore this email.`,
    html: `
      <div style="font-family:system-ui,sans-serif;color:#3A3632">
        <h2 style="margin:0 0 12px">Reset your password</h2>
        <p>Hello ${user.name},</p>
        <p>Open the link below to choose a new password. It expires in <strong>1 hour</strong>.</p>
        <p><a href="${link}" style="background:#E8A87C;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Choose a new password</a></p>
        <p style="color:#7A736B;font-size:14px">Or paste this link in your browser:<br>${link}</p>
      </div>`
  });
}

module.exports = { isConfigured, sendMail, sendVerificationEmail, sendResetEmail };
