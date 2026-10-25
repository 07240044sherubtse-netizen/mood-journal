// routes/api.js - the JSON API. Only maps URLs to controllers.
// Every route needs a session, so a logged-out call always answers 401 JSON
// (never a redirect to the login page).
const express = require('express');
const apiController = require('../controllers/apiController');
const exportController = require('../controllers/exportController');
const { requireAuthApi } = require('../middleware/auth');
const { validateDateParam } = require('../middleware/validateDate');
const { exportLimiter } = require('../middleware/exportLimit');

const router = express.Router();

router.use(requireAuthApi);

// Today first: it is a fixed word, not a date.
router.put('/entries/today', apiController.putToday);

router.get('/entries', apiController.getEntries);
router.get('/entries/:date', validateDateParam, apiController.getEntry);
router.get('/stats', apiController.getStats);

// Download my data as a CSV file (optional ?from= and ?to=)
router.get('/export.csv', exportLimiter, exportController.exportCsvApi);

module.exports = router;
