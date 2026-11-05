// controllers/authController.js - signup, email verification, login, logout,
// forgot password and reset password. NO SQL here: the model does that.
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const User = require('../models/User');
const mailer = require('../config/mailer');
const validators = require('../utils/validators');

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_MINUTES = 60; // reset links expire after 1 hour
const VERIFY_TOKEN_HOURS = 24;

// Every link in an email is built from BASE_URL.
function baseUrl() {
  return process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

// express-session works with callbacks; these two helpers turn them into promises.
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

// GET /signup
function showSignup(req, res) {
  if (req.session.user) return res.redirect('/');
  res.render('pages/signup', { title: 'Create your account', error: null, values: {} });
}

// POST /signup
async function signup(req, res) {
  if (req.session.user) return res.redirect('/');

  const check = validators.validateSignup({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword
  });

  if (!check.ok) {
    return res.status(400).render('pages/signup', {
      title: 'Create your account',
      error: check.error,
      values: { name: req.body.name, email: req.body.email }
    });
  }

  const existing = await User.findByEmail(check.email);
  if (existing) {
    if (!existing.is_verified) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + VERIFY_TOKEN_HOURS * 60 * 60 * 1000);
      await User.setVerificationToken(existing.id, token, expiresAt);
      const delivery = await mailer.sendVerificationEmail(
        { name: existing.name, email: existing.email },
        `${baseUrl()}/verify/${token}`
      );
      return res.status(delivery.failed ? 503 : 200).render('pages/message', {
        title: delivery.failed ? 'Email not sent' : 'Check your email',
        heading: delivery.failed ? 'We could not send your verification email' : 'Check your email',
        text: delivery.failed
          ? (delivery.error || 'The email service is unavailable or not configured. Please try again later.')
          : 'We sent a fresh verification link. It expires in 24 hours.',
        linkHref: '/login',
        linkText: 'Go to log in'
      });
    }
    return res.status(400).render('pages/signup', {
      title: 'Create your account',
      error: 'An account with that email already exists. Try logging in instead.',
      values: { name: check.name, email: check.email }
    });
  }

  const passwordHash = await bcrypt.hash(check.password, BCRYPT_ROUNDS);
  const verificationToken = crypto.randomBytes(32).toString('hex'); // long, random, unguessable
  const verificationExpiresAt = new Date(Date.now() + VERIFY_TOKEN_HOURS * 60 * 60 * 1000);

  // New accounts are always role 'user' and never verified - a form can never change that.
  await User.create({
    name: check.name,
    email: check.email,
    passwordHash,
    verificationToken,
    verificationExpiresAt
  });

  const delivery = await mailer.sendVerificationEmail(
    { name: check.name, email: check.email },
    `${baseUrl()}/verify/${verificationToken}`
  );

  if (delivery.failed) {
    return res.status(503).render('pages/message', {
      title: 'Email not sent',
      heading: 'We could not send your verification email',
      text: `Your account was created, but ${delivery.error || 'the email service is unavailable or not configured.'} Please check the server email settings and try again.`,
      linkHref: '/login',
      linkText: 'Back to log in'
    });
  }

  res.render('pages/message', {
    title: 'Check your email',
    heading: 'Almost there!',
    text: 'We sent you a verification link. Open it to activate your account, then log in.',
    linkHref: '/login',
    linkText: 'Go to log in'
  });
}

// GET /verify/:token
async function verify(req, res) {
  const token = String(req.params.token || '');
  const user = token ? await User.verifyWithToken(token) : null;

  if (!user) {
    return res.status(400).render('pages/message', {
      title: 'Link not valid',
      heading: 'That link is not valid',
      text: 'This verification link is not valid or it was already used. Try logging in, or sign up again.',
      linkHref: '/login',
      linkText: 'Go to log in'
    });
  }

  res.render('pages/verify-success', { title: 'Email verified' });
}

// GET /login
function showLogin(req, res) {
  if (req.session.user) return res.redirect('/');
  res.render('pages/login', { title: 'Log in', error: null, email: '' });
}

// POST /login
async function login(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  // One generic message for "no such email" AND "wrong password",
  // so nobody can find out which emails are registered.
  const genericError = 'Incorrect email or password.';

  if (!validators.isValidEmail(email) || password.length === 0) {
    return res.status(401).render('pages/login', { title: 'Log in', error: genericError, email });
  }

  const user = await User.findByEmail(email);
  const passwordIsRight = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!user || !passwordIsRight) {
    return res.status(401).render('pages/login', { title: 'Log in', error: genericError, email });
  }

  if (!user.is_active) {
    return res.status(403).render('pages/login', {
      title: 'Log in',
      error: 'This account has been deactivated. Please contact the administrator.',
      email
    });
  }

  if (!user.is_verified) {
    return res.status(403).render('pages/login', {
      title: 'Log in',
      error: 'Please verify your email address first - the link is in your inbox.',
      email
    });
  }

  // A brand new session id after login (protects against session fixation).
  // Only id, name and role are stored in the session.
  await regenerateSession(req);
  req.session.user = { id: user.id, name: user.name, role: user.role };
  req.session.flash = { type: 'success', text: `Welcome back, ${user.name}!` };
  await saveSession(req);

  res.redirect('/');
}

// POST /logout
function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('moodjournal.sid');
    res.redirect('/login');
  });
}

// GET /forgot-password
function showForgotPassword(req, res) {
  res.render('pages/forgot-password', { title: 'Forgot password' });
}

// POST /forgot-password
async function forgotPassword(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();

  // The same answer is shown whether the email exists or not.
  const answer = {
    title: 'Check your email',
    heading: 'Check your email',
    text: 'If that email address is in our system, we have sent a link to reset the password.',
    linkHref: '/login',
    linkText: 'Back to log in'
  };

  if (validators.isValidEmail(email)) {
    const user = await User.findByEmail(email);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000);
      await User.setResetToken(user.id, token, expiresAt);
      await mailer.sendResetEmail(user, `${baseUrl()}/reset-password/${token}`);
    }
  }

  res.render('pages/message', answer);
}

// GET /reset-password/:token
async function showResetPassword(req, res) {
  const token = String(req.params.token || '');
  const user = await User.findByValidResetToken(token); // expiry is checked in SQL

  if (!user) {
    return res.status(400).render('pages/message', {
      title: 'Link expired',
      heading: 'That link has expired',
      text: 'This password reset link is not valid any more. Please ask for a new one.',
      linkHref: '/forgot-password',
      linkText: 'Send me a new link'
    });
  }

  res.render('pages/reset-password', { title: 'Choose a new password', token, error: null });
}

// POST /reset-password/:token
async function resetPassword(req, res) {
  const token = String(req.params.token || '');
  const user = await User.findByValidResetToken(token); // single use + 1 hour expiry

  if (!user) {
    return res.status(400).render('pages/message', {
      title: 'Link expired',
      heading: 'That link has expired',
      text: 'This password reset link is not valid any more. Please ask for a new one.',
      linkHref: '/forgot-password',
      linkText: 'Send me a new link'
    });
  }

  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirmPassword || '');

  if (!validators.isValidPassword(password)) {
    return res.status(400).render('pages/reset-password', {
      title: 'Choose a new password',
      token,
      error: `Your password needs at least ${validators.MIN_PASSWORD_LENGTH} characters.`
    });
  }
  if (password !== confirmPassword) {
    return res.status(400).render('pages/reset-password', {
      title: 'Choose a new password',
      token,
      error: 'The two passwords do not match.'
    });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await User.updatePassword(user.id, passwordHash); // also burns the token

  res.render('pages/message', {
    title: 'Password changed',
    heading: 'Your password has been changed',
    text: 'You can now log in with your new password.',
    linkHref: '/login',
    linkText: 'Go to log in'
  });
}

module.exports = {
  showSignup,
  signup,
  verify,
  showLogin,
  login,
  logout,
  showForgotPassword,
  forgotPassword,
  showResetPassword,
  resetPassword
};
