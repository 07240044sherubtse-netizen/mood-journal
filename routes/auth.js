// routes/auth.js - URLs for accounts. Only maps URLs to controllers.
const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');

const router = express.Router();

// Small helper that builds a limiter answering with our friendly page.
function limiter(max, windowMinutes, message) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(429).json({ error: message });
      }
      res.status(429).render('pages/message', {
        heading: 'Too many attempts',
        text: message,
        linkHref: '/login',
        linkText: 'Back to log in'
      });
    }
  });
}

const loginLimiter = limiter(20, 15, 'Too many login attempts. Please try again in 15 minutes.');
const signupLimiter = limiter(10, 60, 'Too many sign-up attempts. Please try again later.');
const forgotLimiter = limiter(5, 15, 'Too many password reset requests. Please try again in 15 minutes.');

// Sign up
router.get('/signup', authController.showSignup);
router.post('/signup', signupLimiter, authController.signup);

// Email verification
router.get('/verify/:token', authController.verify);

// Log in / log out
router.get('/login', authController.showLogin);
router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout); // POST only, so a link cannot log you out

// Forgotten password
router.get('/forgot-password', authController.showForgotPassword);
router.post('/forgot-password', forgotLimiter, authController.forgotPassword);
router.get('/reset-password/:token', authController.showResetPassword);
router.post('/reset-password/:token', authController.resetPassword);

module.exports = router;
