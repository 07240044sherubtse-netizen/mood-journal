// app.js - builds and exports the Express app (no app.listen here,
// so the tests can import it with supertest).
require('dotenv').config();
require('express-async-errors'); // lets async route handlers throw normally

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');

const routes = require('./routes');
const csrf = require('./middleware/csrf');
const { MOODS, MOOD_LIST } = require('./utils/moods');

const app = express();

// Behind Render (or any proxy) the real client IP and protocol arrive in headers.
app.set('trust proxy', 1);

// Views ---------------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Moods are available in every template: hues, emoji and labels stay in one place.
app.locals.MOODS = MOODS;
app.locals.MOOD_LIST = MOOD_LIST;

// Global middleware ---------------------------------------------------
// helmet() sets the security headers. The content policy is opened just enough
// for the Inter font from Google Fonts and for our own files.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:']
      }
    }
  })
);
app.use(express.urlencoded({ extended: false })); // forms
app.use(express.json());                         // JSON API
app.use(express.static(path.join(__dirname, 'public')));

// Sessions ------------------------------------------------------------
// Only id, name and role are ever stored in the session.
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  // No secret configured: use a random one for this boot (never a hard-coded secret).
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET is not set - using a temporary one (sessions reset on restart).');
}

app.use(
  session({
    name: 'moodjournal.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false, // no cookie for visitors who are not logged in
    cookie: {
      httpOnly: true,                              // JavaScript cannot read it
      sameSite: 'lax',                             // basic CSRF protection
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      maxAge: 7 * 24 * 60 * 60 * 1000               // 7 days
    }
  })
);

// Flash messages ------------------------------------------------------
// A message stored in the session is shown once, then forgotten.
app.use((req, res, next) => {
  res.locals.flash = (req.session && req.session.flash) || null;
  if (req.session && req.session.flash) delete req.session.flash;
  next();
});

// CSRF protection -----------------------------------------------------
// attachCsrfToken puts the token in every form; verifyCsrfToken checks it
// on POST / PUT / PATCH / DELETE requests (GET requests are never checked,
// which is why /health needs no session at all).
app.use(csrf.attachCsrfToken);
app.use(csrf.verifyCsrfToken);

// Routes --------------------------------------------------------------
app.use('/', routes);

// 404 -----------------------------------------------------------------
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).render('pages/404');
});

// Error handler -------------------------------------------------------
// JSON for the API, a friendly page for people. Stack traces stay in the terminal.
app.use((err, req, res, next) => {
  console.error(err); // the only place the details are shown
  const status = err.status || 500;
  if (req.path.startsWith('/api')) {
    return res.status(status).json({ error: status === 500 ? 'Something went wrong' : err.message });
  }
  res.status(status).render('pages/error', { status });
});

module.exports = app;
