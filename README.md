# MoodJournal

A daily mood tracker with a colourful calendar and a streak system.

Log how you feel each day, write a short note if you want to, and watch your
streak grow. Built with Node.js, Express, EJS and PostgreSQL: plain JavaScript,
no build step, no front-end framework.

---

## Features

* **One entry per day.** Pick one of eight moods and add an optional note (up to
  200 characters). Saving twice on the same day updates the same entry.
* **Today only.** You can write about today; every earlier day is read-only.
  This is enforced on the server, not just hidden in the page.
* **Colourful calendar.** Each day is coloured by its mood, with a legend. Click
  a day to read it.
* **Streaks.** Your current streak (consecutive days ending today) and your
  longest streak, with a small celebration at 7, 14 and 30 days.
* **Stats.** Mood totals and your most frequent mood for any month.
* **Private by design.** Your entries are yours. The super admin dashboard can
  manage accounts but can *never* read anybody's mood or note text.
* **Accounts done properly.** Sign-up with email verification, login with
  bcrypt-hashed passwords, a forgotten-password flow with single-use links, and
  a deactivate/reactivate switch.
* **Download my data.** Your whole diary as a CSV file that opens in Excel.
* **A JSON API.** Used by the calendar pop-up and the dashboard, and available
  to any signed-in client.
* **Docker deployment.** One `Dockerfile` and a step-by-step guide.

---

## Requirements

* Node.js 18 or newer (the Docker image uses 20)
* PostgreSQL 13 or newer (local, or a free cloud database such as Neon)

## Setup

```powershell
git clone <your-repository-url>
cd mood-journal
npm install
```

### 1. Create the environment file

```powershell
Copy-Item .env.example .env
```

Open `.env` and set `DB_PASS` to your PostgreSQL password. Every variable is
described in the table below. **Never commit `.env`** — it is already in
`.gitignore`.

### 2. Create the database and its tables

```powershell
createdb -U postgres mood_journal
psql -U postgres -d mood_journal -f schema.sql
```

`schema.sql` creates three tables: `users`, `entries` and `admin_actions`. The
one-entry-per-day rule is a database constraint:

```sql
UNIQUE (user_id, entry_date)
```

so even two requests arriving at the same moment cannot produce two entries.

### 3. Check the database

```powershell
npm run test-db
```

It confirms the connection, lists the tables it found and checks that the
`UNIQUE (user_id, entry_date)` rule exists. It prints nothing secret.

### 4. Optional: sample data

`seed.sql` adds about 30 days of entries — all eight moods, a few short notes and
three gaps — for the **first verified account**:

```powershell
psql -U postgres -d mood_journal -f seed.sql
```

Sign up and verify an account **first**, then run it. It is safe to run twice.

### 5. Create your super admin

The sign-up form only ever creates a normal `user`, so the super admin is made
from the terminal:

```powershell
npm run create-admin
```

It asks for a name, an email and a password (8+ characters) and creates an
already-verified account. Log in with it and an **Admin** link appears in the
menu.

## Run the app

```powershell
npm run dev     # nodemon, restarts on every change
npm start       # plain node
```

Then open <http://localhost:3000>.

In development the Gmail variables are usually left empty, so the verification
link is **printed in the terminal** instead of being emailed — you can copy it
straight into the browser.

---

## Environment variables

| Name | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | The port the server listens on. Render sets this itself. |
| `NODE_ENV` | `development` | `production` turns on Secure session cookies. |
| `BASE_URL` | `http://localhost:3000` | Public address used to build the links inside verification and reset emails. No trailing slash. |
| `TIMEZONE` | `Asia/Thimphu` | Every "today" calculation uses this timezone. |
| `DB_HOST` | `localhost` | PostgreSQL host. |
| `DB_PORT` | `5432` | PostgreSQL port. |
| `DB_NAME` | `mood_journal` | Database name. |
| `DB_USER` | `postgres` | Database user. |
| `DB_PASS` | — | Database password. |
| `DB_SSL` | `false` | `true` for cloud databases (Neon, Render). |
| `SESSION_SECRET` | — | Long random string that signs the session cookie. |
| `GMAIL_USER` | — | Gmail address used to send mail. |
| `GMAIL_APP_PASSWORD` | — | A Gmail **App Password** (not your normal password). |

Make a `SESSION_SECRET` with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## The rules, and where they live

| Rule | Where it is enforced |
| --- | --- |
| One entry per user per day | `UNIQUE (user_id, entry_date)` in `schema.sql`, plus an `ON CONFLICT … DO UPDATE` in `models/Entry.js` |
| Only today can be written | `controllers/entryController.js` and `controllers/apiController.js` compare against `todayInTimezone()` before saving |
| A date in the request body cannot change the day | the date comes from the server (`today`) or the URL, never from a submitted field |
| Future dates refused | `utils/dates.js` → `isFutureDate`, used by the entries and export controllers |
| "Today" follows `TIMEZONE` | `utils/dates.js` uses `Intl.DateTimeFormat` with the `TIMEZONE` variable |
| Dates stored as `YYYY-MM-DD` | `DATE` columns, kept as strings by a pg type parser in `config/db.js` |
| Only the eight moods | `utils/moods.js` is the single source of truth; the server rejects anything else |
| Notes optional, max 200 chars, trimmed | `utils/validators.js` → `validateNote`, run on the server |
| Your user id always comes from the session | `middleware/auth.js` sets `req.currentUser`; no controller ever reads a user id from a form or a URL |
| The super admin cannot read entries | `models/Admin.js` selects counts only and `models/User.js` selects public columns only, so the admin pages have no mood or note to show |
| Anonymous API calls get JSON, not a redirect | `middleware/auth.js` → `requireAuthApi` answers `401` |
| CSRF on every state-changing request | `middleware/csrf.js`, checked on POST/PUT/PATCH/DELETE only |

---

## Routes

### Pages

| Method | Path | Who |
| --- | --- | --- |
| GET | `/health` | anyone — `{"status":"ok"}`, or `503` if the database is down |
| GET | `/signup`, POST `/signup` | anyone |
| GET | `/verify/:token` | anyone (the emailed link) |
| GET | `/login`, POST `/login` | anyone |
| POST | `/logout` | signed-in (POST only, so a link cannot log you out) |
| GET | `/forgot-password`, POST `/forgot-password` | anyone |
| GET | `/reset-password/:token`, POST `/reset-password/:token` | anyone (the emailed link) |
| GET | `/` | signed-in — today's entry and the streak |
| GET | `/calendar` | signed-in — the colour calendar |
| GET | `/stats` | signed-in — totals and streaks |
| GET | `/account` | signed-in — change password, delete account, download |
| POST | `/account/password`, POST `/account/delete` | signed-in |
| POST | `/entries/today` | signed-in — save today's mood |
| GET | `/entries/:date` | signed-in — read one of your own days |
| GET | `/account/export.csv` | signed-in — your diary as a CSV file |
| GET | `/admin` | super admin |
| POST | `/admin/users/:id/deactivate` `/reactivate` `/verify` | super admin |

### JSON API

Every API route needs a session; a logged-out call answers
`401 {"error":"You must be logged in."}`.

| Method | Path | Notes |
| --- | --- | --- |
| PUT | `/api/entries/today` | Save today's mood. Needs the CSRF token in the `X-CSRF-Token` header. |
| GET | `/api/entries?month=YYYY-MM` | Your entries for a month, oldest first. |
| GET | `/api/entries/:date` | One day, with its weekday. |
| GET | `/api/stats?month=YYYY-MM` | Streaks, totals and mood counts. |
| GET | `/api/export.csv` | The same file as the button, with optional `from` and `to`. |

---

## Download my data (CSV)

Signed in, the **Download my data (CSV)** button on the Account page (and on the
Stats page) saves a file called `moodjournal-YYYY-MM-DD.csv`, where the date is
today in the app timezone. Both `From` and `To` are optional and can be left
empty to download everything.

The file has one row per logged day, oldest day first, with these columns in
this order:

| Column | Meaning |
| --- | --- |
| `date` | The day, as `YYYY-MM-DD` |
| `weekday` | `Monday` ... `Sunday` |
| `mood` | The mood key exactly as stored: `happy`, `calm`, `excited`, `neutral`, `tired`, `anxious`, `sad`, `angry` |
| `note` | Your note, or an empty field when you wrote none |
| `logged_at` | When you first saved that day (`YYYY-MM-DD HH:mm:ss`, Asia/Thimphu) |
| `updated_at` | When you last changed it (same format) |

The same file is available to the API at `GET /api/export.csv`, which accepts the
same optional `from` and `to`, for example
`/api/export.csv?from=2026-10-01&to=2026-10-25`.

Downloads are limited to 10 per user every 15 minutes.

### Opening it in Excel

The file starts with a UTF-8 byte-order mark so emojis and accents are correct.
Do not double-click the file — on Windows Excel may still guess the wrong
encoding. Instead:

1. Open Excel and choose **Data → From Text/CSV**.
2. Pick the file, set **File Origin** to **65001: Unicode (UTF-8)**, choose
   **Comma** as the delimiter and press **Load**.

Leading apostrophes you may see on a field like `=2+2` are deliberate: they stop
Excel and Google Sheets from reading a note as a formula.

### Reading it with pandas

```python
import pandas as pd

df = pd.read_csv("moodjournal-2026-10-25.csv", parse_dates=["date"])
print(df.head())
```

---

## Tests

The tests use Jest and Supertest and talk to the real app over HTTP, with a
cookie jar each — the same way a browser would. They use a **separate test
database** which is emptied between tests, and the helper refuses to run unless
`DB_NAME` ends in `_test`, so your real data can never be wiped.

Set it up once:

```powershell
Copy-Item .env.test.example .env.test     # then set DB_PASS in it
createdb -U postgres mood_journal_test
```

Then run:

```powershell
npm test                 # everything
npx jest utils           # the pure functions only (no database needed)
npx jest --coverage      # with a coverage report in coverage/
```

What is covered:

* `utils/streak.test.js` — current and longest streak, gaps, duplicates, the
  7/14/30-day milestones, the encouraging messages.
* `utils/validators.test.js` — emails, passwords, notes, mood keys, calendar dates.
* `utils/csv.test.js` — quoting, CRLF line endings, the byte-order mark and the
  spreadsheet-formula guard.
* `tests/auth.test.js` — sign-up, verification, login (wrong password, unknown
  email, unverified, deactivated), logout, the whole password-reset flow.
* `tests/entries.test.js` — saving today, one entry per day, the server refusing
  past and future days, and that one person can never read another's day.
* `tests/api.test.js` — `401` for anonymous callers, CSRF on the API, the month
  filter, and that stats only ever describe the signed-in person.
* `tests/admin.test.js` — who may open the dashboard, the account actions, the
  action log, and that no mood or note text ever appears on an admin page.
* `tests/export.test.js` and `tests/exportLimit.test.js` — the file's headers,
  columns and quoting, the `from`/`to` filters, and the 10-downloads limit.

---

## Project structure

```
mood-journal/
├── app.js                  # builds the Express app (no listen, so tests can import it)
├── server.js              # starts the server
├── schema.sql             # creates users, entries and admin_actions
├── seed.sql               # ~30 days of sample entries for the first verified account
├── test-db.js             # npm run test-db: is the database ready?
├── Dockerfile             # deployment image
├── DEPLOYMENT.md          # Neon + Render guide
├── .env.example           # every setting, with comments
├── .env.test.example      # the same for the tests
├── jest.config.js / jest.setup.js
├── config/
│   ├── db.js              # the one pg-promise pool, and the DATE type parser
│   └── mailer.js          # sends email, or prints it when no account is set
├── middleware/
│   ├── auth.js            # requireAuth, requireAuthApi, requireAdmin, currentUser
│   ├── csrf.js            # attachCsrfToken, verifyCsrfToken
│   ├── exportLimit.js     # 10 CSV downloads per user per 15 minutes
│   └── validateDate.js    # checks a :date in the URL is a real date
├── models/                # the ONLY place with SQL
│   ├── User.js
│   ├── Entry.js
│   └── Admin.js
├── controllers/           # read the request, use a model, render or answer
├── routes/                # URL → controller, nothing else
│   ├── index.js           # mounts everything, and GET /health
│   ├── auth.js  journal.js  api.js  admin.js
├── utils/
│   ├── moods.js           # the eight moods, the single source of truth
│   ├── dates.js           # timezone-aware "today", date checks, formatting
│   ├── validators.js      # emails, passwords, notes
│   ├── streak.js          # pure streak functions
│   ├── csv.js             # CSV building, quoting and the BOM
│   └── *.test.js
├── views/
│   ├── partials/          # header.ejs, footer.ejs
│   └── pages/             # dashboard, calendar, stats, account, entry, admin, auth pages
├── public/
│   ├── css/styles.css
│   └── js/                # calendar.js, dashboard.js
├── scripts/createSuperAdmin.js
├── migrations/001_init.sql
└── tests/
    ├── globalSetup.js
    ├── helpers/           # db.js (test database), http.js (cookie-jar client)
    └── *.test.js
```

---

## Security notes

* Passwords are hashed with **bcrypt** (10 rounds; 4 in the tests, for speed).
* Verification and reset tokens come from `crypto.randomBytes(32)`, are stored in
  the database and are **single-use**. A reset token expires after 1 hour, and
  the expiry is checked inside the SQL.
* The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
  Only the user's id, name and role are kept in the session.
* Every state-changing request needs a CSRF token: a hidden `_csrf` field in
  forms, or an `X-CSRF-Token` header for the API.
* `helmet` sets the security headers; its content policy allows only our own
  files and the Inter font from Google Fonts.
* Rate limits: 20 logins / 15 min, 10 sign-ups / hour, 5 reset requests / 15 min,
  10 CSV downloads / user / 15 min.
* Error pages never show a stack trace, and `/health` never leaks database
  details, versions or environment values.

## Deploying

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full walkthrough (Neon database,
Render web service from the Dockerfile, environment variables, and a post-deploy
checklist).

---

## Requirements checklist

Everything asked for, and where to find it.

| Requirement | Status | Where |
| --- | --- | --- |
| Node.js + Express + EJS, plain JavaScript | Done | `app.js`, `views/` |
| MVC: models own all SQL | Done | `models/`, `controllers/`, `routes/` |
| PostgreSQL via pg-promise | Done | `config/db.js`, `models/` |
| One entry per user per day | Done | `schema.sql`, `models/Entry.js` |
| Only today can be written, enforced server-side | Done | `controllers/entryController.js`, `controllers/apiController.js` |
| Past days read-only, future days refused | Done | same, plus `utils/dates.js` |
| "Today" from the `TIMEZONE` variable, stored as `DATE` | Done | `utils/dates.js`, `config/db.js` |
| Eight moods in one place, unknown moods rejected | Done | `utils/moods.js` |
| Note optional, max 200 chars, trimmed and validated | Done | `utils/validators.js` |
| Entries private; super admin can never read them | Done | `models/Admin.js`, `models/User.js`, `views/pages/admin.ejs` |
| User id always from the session | Done | `middleware/auth.js` |
| Colourful calendar | Done | `views/pages/calendar.ejs`, `public/js/calendar.js`, `public/css/styles.css` |
| Streak system (current, longest, milestones) | Done | `utils/streak.js` + its tests |
| Email verification | Done | `controllers/authController.js`, `config/mailer.js` |
| Login, logout, roles | Done | `controllers/authController.js`, `middleware/auth.js` |
| Forgotten-password flow with single-use, expiring links | Done | `controllers/authController.js`, `models/User.js` |
| REST API (entries, stats, save today) | Done | `routes/api.js`, `controllers/apiController.js` |
| JSON `401` for anonymous API calls | Done | `middleware/auth.js` |
| CSV export with Excel compatibility | Done | `utils/csv.js`, `controllers/exportController.js` |
| Super admin dashboard (accounts only, with an action log) | Done | `controllers/adminController.js`, `views/pages/admin.ejs` |
| Rate limiting | Done | `routes/auth.js`, `middleware/exportLimit.js` |
| `GET /health` with no DB details and no session | Done | `routes/index.js` |
| Jest + Supertest tests | Done | `utils/*.test.js`, `tests/` |
| Docker deployment | Done | `Dockerfile`, `.dockerignore`, `DEPLOYMENT.md` |
| `.env.example` and `.gitignore`, no secrets in code | Done | `.env.example`, `.gitignore` |
| Documentation | Done | this file and `DEPLOYMENT.md` |

### Not yet run on this machine

The project was written before the local PostgreSQL database existed, so:

* `npm test` currently runs the 58 pure-function tests (`utils/`) successfully,
  but the six test files that need a database stop at a safety check with the
  message telling you to create `mood_journal_test`.
* `docker build` has not been run (Docker is not installed here).

Run these once your database is ready:

```powershell
createdb -U postgres mood_journal
psql -U postgres -d mood_journal -f schema.sql
npm run test-db
Copy-Item .env.test.example .env.test
createdb -U postgres mood_journal_test
npm test
```
