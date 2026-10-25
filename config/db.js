// config/db.js - the ONE pg-promise connection pool used by the whole app.
// Models import this file and write all the SQL; nothing else touches the database.
require('dotenv').config();

const pgp = require('pg-promise')();

// PostgreSQL DATE columns would come back as JavaScript Date objects, which can
// shift by a day depending on the server timezone. We keep them as plain
// "YYYY-MM-DD" strings instead - exactly what the app and the views expect.
pgp.pg.types.setTypeParser(1082, (value) => value); // 1082 = DATE

// Build the connection settings from environment variables (never hard-code secrets).
const connection = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  max: 10 // maximum number of clients in the pool
};

// Cloud databases (Neon, Render, ...) need SSL. Local Postgres usually does not.
if (process.env.DB_SSL === 'true') {
  connection.ssl = { rejectUnauthorized: false };
}

module.exports = pgp(connection);
