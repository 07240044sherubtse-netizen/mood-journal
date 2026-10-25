# Deploying MoodJournal

This guide puts the app online with **Neon** (PostgreSQL) and **Render** (the web
server, built from the `Dockerfile` in this folder). Both have a free plan.

The short version:

1. Push the project to GitHub.
2. Make a database on Neon and run `schema.sql` against it.
3. Create a Render *Web Service* that uses the Dockerfile, and paste the
   environment variables into it.
4. Set `BASE_URL` to the address Render gives you and redeploy.
5. Create your super admin account and walk the checklist at the end.

---

## 0. Before you start

* The real `.env` file is **never** uploaded. `.gitignore` and `.dockerignore`
  both leave it out, and the app reads its settings from environment variables.
* You will need a long random `SESSION_SECRET`. Make one with:

  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

* Nothing in the app is timezone-dependent except the "today" calculations, and
  those follow `TIMEZONE`. Keep it as `Asia/Thimphu` unless you have a reason not to.

---

## 1. Push the project to GitHub

```powershell
cd mood-journal
git init
git add .
git commit -m "MoodJournal"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/mood-journal.git
git push -u origin main
```

Check on GitHub that `node_modules/`, `.env` and `coverage/` are **not** there.
If they are, stop and fix `.gitignore` before continuing.

---

## 2. Create the database on Neon

1. Sign up at <https://neon.tech> and create a project (pick the region closest
   to you). Neon gives you a database and a connection string right away.
2. Copy the connection details from **Connection Details**. They look like:

   ```
   host=e.g. ep-cool-name-123456.us-east-2.aws.neon.tech
   port=5432
   database=neondb
   user=neondb_owner
   password=...
   ```

   Use the **pooled** connection string ("Pooled connection" checkbox) for the app.

3. Create the three tables by running the schema file against Neon. From the
   project folder:

   ```powershell
   psql "postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require" -f schema.sql
   ```

   You should see `CREATE TABLE` three times. (If `psql` is not on your PATH, use
   the full path, e.g. `"C:\Program Files\PostgreSQL\18\bin\psql.exe"`.)

4. Optional: sample data. `seed.sql` fills the **first verified account** with
   about 30 days of entries, so do this *after* you have signed up and verified
   an account:

   ```powershell
   psql "postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require" -f seed.sql
   ```

---

## 3. Deploy on Render

1. Sign up at <https://render.com> and connect your GitHub account.
2. **New +** → **Web Service** → pick the `mood-journal` repository.
3. Fill in:
   * **Runtime**: `Docker` (Render uses the `Dockerfile` automatically).
   * **Instance type**: Free.
   * **Health Check Path**: `/health`.
4. Add the **environment variables** (Render injects `PORT` itself — do not set it):

   | Name | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `BASE_URL` | `https://your-app.onrender.com` (see step 4) |
   | `TIMEZONE` | `Asia/Thimphu` |
   | `DB_HOST` | your Neon host |
   | `DB_PORT` | `5432` |
   | `DB_NAME` | your Neon database |
   | `DB_USER` | your Neon user |
   | `DB_PASS` | your Neon password |
   | `DB_SSL` | `true` (Neon requires SSL) |
   | `SESSION_SECRET` | the long random string from step 0 |
   | `GMAIL_USER` | your Gmail address (optional, see step 6) |
   | `GMAIL_APP_PASSWORD` | your Gmail app password (optional, see step 6) |

5. Click **Create Web Service**. The first build takes a few minutes; watch the
   log until you see `MoodJournal running on …`. The service is now live, but the
   email links will still point at `localhost` — fix that next.

---

## 4. Set BASE_URL to the live address

1. Copy your service URL from the top of the Render page
   (it looks like `https://mood-journal-xxxx.onrender.com`).
2. Back in **Environment**, set `BASE_URL` to exactly that address — **no
   trailing slash**.
3. Save. Render redeploys automatically.

Verification and password-reset links are built from `BASE_URL`, so this step is
what makes them work in real emails. If you skip it, the links point at
`http://localhost:3000`.

---

## 5. Create your super admin

The signup form only ever creates a normal user, so the super admin is created
from the terminal **against the Neon database**. Point a local `.env` at Neon
(the same values as the table above, with `DB_SSL=true`), then:

```powershell
npm run create-admin
```

Type a name, email and password (8+ characters). It prints the new account's id.
Log in at `/login` with it and the **Admin** link will appear in the menu.

> If your Render plan has a Shell, you can run the same command there instead.
> The free plan does not include a Shell, so the local route above is the one to use.

---

## 6. Email: what to expect on a free plan

The app sends mail through Gmail SMTP when `GMAIL_USER` and
`GMAIL_APP_PASSWORD` are both set. Two honest caveats:

* **Render blocks outbound SMTP (ports 25/465/587) on free workspaces.** Gmail
  SMTP will therefore time out in production, even with correct app passwords.
* **If you leave the Gmail variables empty**, the mailer prints the email in the
  terminal instead of sending it. On Render that means the verification link
  shows up on the service's **Logs** page — fine for a demo or a class, where you
  (the owner) can read the link and open it.

If you need real emails, use an email provider that sends over HTTPS (Resend,
SendGrid, Brevo, …) and swap the Gmail transport in `config/mailer.js` for that
provider. The rest of the app does not change: it only calls
`sendVerificationEmail` and `sendResetEmail`.

---

## 7. Post-deploy checklist

Open your live address and walk through these. Every box should pass.

* [ ] `https://your-app.onrender.com/health` shows `{"status":"ok"}`.
* [ ] Sign up with a new account. The verification email is sent (or its link
      appears in the Render logs).
* [ ] Open the verification link — the "email verified" page appears and you can
      log in.
* [ ] Save today's mood from the dashboard, with a short note.
* [ ] The calendar shows today's colour; opening a past day is read-only and
      there is no way to save it.
* [ ] Two save attempts for the same day still leave **one** entry.
* [ ] **Stats** shows the current and longest streak, and the mood totals.
* [ ] **Download my data (CSV)** downloads a file named
      `moodjournal-YYYY-MM-DD.csv`. Open it in Excel: the columns are
      `date, weekday, mood, note, logged_at, updated_at`, the accents/emoji are
      readable, and dates are plain `YYYY-MM-DD`.
* [ ] The browser shows a padlock (HTTPS) and a `moodjournal.sid` cookie marked
      *HttpOnly* and *Secure*.
* [ ] Logged out, `https://your-app.onrender.com/api/stats` answers
      `401 {"error":"You must be logged in."}` — a JSON error, not a login page.
* [ ] A normal account cannot open `/admin` (it answers 403) and the admin pages
      never show anybody's mood or note text.
* [ ] Your super admin can deactivate and reactivate a normal account, and the
      **latest actions** list updates.

---

## 8. Running the image locally (optional)

```powershell
docker build -t mood-journal .
docker run --rm --env-file .env -p 3000:3000 mood-journal
```

Then open <http://localhost:3000>. Use `DB_SSL=false` in the local `.env` when
you are pointing at a local PostgreSQL.

---

## 9. Everyday notes

* **Cold starts:** a free Render web service sleeps after about 15 minutes with
  no visitors, and a free Neon database suspends too. The first request after
  that takes a little while to wake up. The `/health` check brings it back.
* **Redeploy:** every push to `main` rebuilds and redeploys automatically.
* **Logs:** the Render **Logs** tab shows the app's `console.log` output,
  including any email links that were printed instead of sent.
* **Changing `SESSION_SECRET`** logs everybody out — that is normal.
* **Rolling back:** Render keeps previous deploys; use **Events → Rollback**.
