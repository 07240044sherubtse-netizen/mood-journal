// routes/journal.js - URLs for the diary itself.
// Only maps URLs to controllers.
const express = require('express');
const entryController = require('../controllers/entryController');
const homeController = require('../controllers/homeController');
const calendarController = require('../controllers/calendarController');
const statsController = require('../controllers/statsController');
const accountController = require('../controllers/accountController');
const exportController = require('../controllers/exportController');
const { requireAuth } = require('../middleware/auth');
const { validateDateParam } = require('../middleware/validateDate');
const { exportLimiter } = require('../middleware/exportLimit');

const router = express.Router();

// The four pages of the app
router.get('/', requireAuth, homeController.dashboard);
router.get('/calendar', requireAuth, calendarController.showCalendar);
router.get('/stats', requireAuth, statsController.showStats);
router.get('/account', requireAuth, accountController.showAccount);

// Account actions
router.post('/account/password', requireAuth, accountController.changePassword);
router.post('/account/delete', requireAuth, accountController.deleteAccount);

// Download my data as a CSV file (optional ?from= and ?to=)
router.get('/account/export.csv', requireAuth, exportLimiter, exportController.exportCsvPage);

// Create or change today's entry. Only today is accepted (403 otherwise).
router.post('/entries/today', requireAuth, entryController.saveToday);

// Read one of my own days. :date must be a real YYYY-MM-DD date.
router.get('/entries/:date', requireAuth, validateDateParam, entryController.showEntry);

module.exports = router;
