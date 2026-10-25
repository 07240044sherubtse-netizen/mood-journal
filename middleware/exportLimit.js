// middleware/exportLimit.js - a small speed limit for CSV downloads.
// Keyed by the logged-in user, so two people sharing one network address
// never block each other. It always runs AFTER requireAuth / requireAuthApi,
// so req.currentUser is already known.
const rateLimit = require('express-rate-limit');

const MESSAGE = 'Too many downloads. Please try again in 15 minutes.';

const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 downloads per user per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.currentUser ? req.currentUser.id : 'anonymous'}`,
  handler: (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(429).json({ error: MESSAGE });
    }
    res.status(429).render('pages/message', {
      heading: 'One moment',
      text: MESSAGE,
      linkHref: '/account',
      linkText: 'Back to my account'
    });
  }
});

module.exports = { exportLimiter };
