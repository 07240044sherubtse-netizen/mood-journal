// middleware/csrf.js - simple CSRF protection.
// A random token is stored in the session and hidden in every form.
// POST / PUT / PATCH / DELETE requests without the matching token get a 403.
//
// There is no CSRF check on GET requests, so /health stays free of sessions.
const crypto = require('crypto');

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// Creates the token once per session and makes it available to the templates.
function attachCsrfToken(req, res, next) {
  if (!req.session) return next();
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

// Compares two tokens without leaking how long the comparison took.
function sameToken(a, b) {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));
  if (first.length !== second.length) return false;
  return crypto.timingSafeEqual(first, second);
}

// Blocks any state-changing request that does not send the session token.
function verifyCsrfToken(req, res, next) {
  if (SAFE_METHODS.includes(req.method.toUpperCase())) return next();

  // Nobody is logged in on an /api call: there is no session to protect, and the
  // API answers 401 by itself. (Forms such as /login are never skipped: they are
  // still checked even when nobody is logged in yet.)
  if (req.path.startsWith('/api') && !(req.session && req.session.user)) {
    return next();
  }

  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token');
  const expected = req.session && req.session.csrfToken;

  if (!expected || !sent || !sameToken(sent, expected)) {
    if (req.path.startsWith('/api')) {
      return res.status(403).json({ error: 'Invalid CSRF token.' });
    }
    return res.status(403).render('pages/message', {
      heading: 'Request blocked',
      text: 'Your session token did not match. Please go back and try again.',
      linkHref: '/',
      linkText: 'Back to my dashboard'
    });
  }

  next();
}

module.exports = { attachCsrfToken, verifyCsrfToken };
