// config/mailer.js - sends verification and password-reset emails.
//
// If GMAIL_USER and GMAIL_APP_PASSWORD are not set, the link is printed in the
// terminal instead, so the whole signup flow can be tested without an email account.
const nodemailer = require('nodemailer');

let transporter = null;

if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD // a Gmail App Password, not the normal password
    }
  });
}

function isConfigured() {
  return Boolean(transporter);
}

// The single place that talks to nodemailer.
async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.log('\n--- No email account configured: printing the email instead ---');
    console.log('To      :', to);
    console.log('Subject :', subject);
    console.log(text || html);
    console.log('---------------------------------------------------------------\n');
    return { printed: true };
  }

  return transporter.sendMail({
    from: `"MoodJournal" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    text
  });
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
