// middleware/validateDate.js - makes sure a :date in the URL is a real date.
// It runs before the controller, so controllers can trust req.params.date.
const { isValidDateString } = require('../utils/dates');

function validateDateParam(req, res, next) {
  const date = req.params.date;
  if (!isValidDateString(date)) {
    const error = new Error('Please use a date in the format YYYY-MM-DD.');
    error.status = 400;
    return next(error); // handled by the global error handler (JSON for /api)
  }
  next();
}

module.exports = { validateDateParam };
