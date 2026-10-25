// middleware/auth.js - who is allowed to see what.
// The user id ALWAYS comes from the session, never from the URL or a form field.
const User = require('../models/User');

// Loads the logged-in user from the database and checks the account is still active.
// Returns null when nobody is logged in (or the account was deactivated meanwhile).
async function currentUser(req) {
  if (!req.session || !req.session.user) return null;
  const user = await User.findById(req.session.user.id);
  if (!user || !user.is_active) return null;
  return user;
}

// For normal pages: not logged in -> go to the login page.
async function requireAuth(req, res, next) {
  const user = await currentUser(req);
  if (!user) {
    // If a deactivated user comes back, throw their session away.
    if (req.session.user) {
      return req.session.destroy(() => res.redirect('/login'));
    }
    return res.redirect('/login');
  }
  req.currentUser = user;
  // The templates use this to build the navigation bar.
  res.locals.currentUser = { id: user.id, name: user.name, role: user.role };
  next();
}

// For the JSON API: not logged in -> 401 JSON (never a redirect).
async function requireAuthApi(req, res, next) {
  const user = await currentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'You must be logged in.' });
  }
  req.currentUser = user;
  next();
}

// Super admins only. Always used after requireAuth / requireAuthApi.
function requireAdmin(req, res, next) {
  const role = req.currentUser ? req.currentUser.role : req.session.user && req.session.user.role;
  if (role !== 'superadmin') {
    if (req.path.startsWith('/api')) {
      return res.status(403).json({ error: 'Super admins only.' });
    }
    return res.status(403).render('pages/message', {
      heading: 'Not allowed',
      text: 'That page is only for super admins.',
      linkHref: '/',
      linkText: 'Back to my dashboard'
    });
  }
  next();
}

module.exports = { requireAuth, requireAuthApi, requireAdmin, currentUser };
