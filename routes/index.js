// routes/index.js - mounts every router of the app.
const express = require('express');
const router = express.Router();

const db = require('../config/db');
const authRoutes = require('./auth');
const journalRoutes = require('./journal');
const apiRoutes = require('./api');
const adminRoutes = require('./admin');

// GET /health - public health check for the hosting platform.
// No login, no session, no CSRF and no database details in the answer.
router.get('/health', async (req, res) => {
  try {
    await db.one('SELECT 1 AS ok'); // quick database ping
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Health check failed:', err.message);
    res.status(503).json({ status: 'error' });
  }
});

// Accounts: signup, login, verification, password reset
router.use('/', authRoutes);

// The diary: the four pages, saving today's mood and reading one day
router.use('/', journalRoutes);

// The JSON API (used by the calendar pop-up and the dashboard)
router.use('/api', apiRoutes);

// The super admin dashboard (accounts only - never anybody's entries)
router.use('/admin', adminRoutes);

module.exports = router;
