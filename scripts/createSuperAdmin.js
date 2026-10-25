// scripts/createSuperAdmin.js - creates a verified super admin from the terminal.
//   npm run create-admin
//
// This is the ONLY way to become a super admin: the signup form always creates
// a normal 'user'. Reads nothing from .env except the database settings.
require('dotenv').config();

const readline = require('readline');
const bcrypt = require('bcrypt');

const db = require('../config/db');
const User = require('../models/User');
const validators = require('../utils/validators');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer)));
}

async function main() {
  console.log('Create a MoodJournal super admin\n');

  const name = (await ask('Name: ')).trim();
  const email = (await ask('Email: ')).trim().toLowerCase();
  const password = (await ask('Password (8+ characters): ')).trim();

  if (name.length < 1 || name.length > 100) {
    console.error('Please enter a name (1 to 100 characters).');
    return 1;
  }
  if (!validators.isValidEmail(email)) {
    console.error('Please enter a valid email address.');
    return 1;
  }
  if (!validators.isValidPassword(password)) {
    console.error(`The password needs at least ${validators.MIN_PASSWORD_LENGTH} characters.`);
    return 1;
  }

  const existing = await User.findByEmail(email);
  if (existing) {
    console.error('A user with that email already exists.');
    return 1;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.createSuperAdmin({ name, email, passwordHash });

  console.log(`\nSuper admin created: ${user.name} <${user.email}> (id ${user.id})`);
  console.log('This account is already verified and can log in at /login.');
  return 0;
}

main()
  .then((code) => db.$pool.end().then(() => process.exit(code)))
  .catch((err) => {
    console.error('Could not create the super admin:', err.message);
    db.$pool.end().then(() => process.exit(1));
  })
  .finally(() => rl.close());
