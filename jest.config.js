// jest.config.js - how the test suite runs.
// The tests use their OWN database (mood_journal_test - see .env.test.example),
// never the real one, because they empty the tables between tests.
module.exports = {
  testEnvironment: 'node',

  // One file at a time: every test file clears the same test database,
  // so two files running together would wipe each other's data.
  maxWorkers: 1,

  // Runs before every test file: loads .env.test and sets safe defaults.
  setupFiles: ['<rootDir>/jest.setup.js'],

  // Runs once for the whole suite: creates the tables in the test database.
  globalSetup: '<rootDir>/tests/globalSetup.js',

  // Only our own files are collected.
  testMatch: ['<rootDir>/utils/*.test.js', '<rootDir>/tests/**/*.test.js'],

  // What the coverage report should look at (the app code, not the tests).
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'utils/**/*.js',
    '!utils/*.test.js'
  ],
  coverageDirectory: 'coverage'
};
