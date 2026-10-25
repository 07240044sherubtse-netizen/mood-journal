// jest.setup.js - runs before every test file.
// It loads .env.test (never the real .env) so the tests can never touch the
// real database, and it fixes the timezone so "today" is the same everywhere.
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env.test') });

process.env.NODE_ENV = 'test';
process.env.TIMEZONE = process.env.TIMEZONE || 'Asia/Thimphu';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-secret-not-used-in-production';
process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// The database tests empty the tables, so they must point at a test database.
// That guard lives in tests/helpers/db.js - the only place that runs TRUNCATE.
// The pure unit tests in utils/ need no database at all and load no such file.
