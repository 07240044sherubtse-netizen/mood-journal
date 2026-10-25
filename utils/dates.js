// utils/dates.js - all date helpers.
// "Today" is ALWAYS calculated in the configured TIMEZONE (Asia/Thimphu by default),
// never in the server's local time and never from a value sent by the browser.

const TIMEZONE = process.env.TIMEZONE || 'Asia/Thimphu';

// Returns "now" as YYYY-MM-DD in the configured timezone.
function todayInTimezone(now = new Date()) {
  // en-CA formats dates as YYYY-MM-DD, which is exactly what a DATE column wants.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

// True only for a real calendar date written as YYYY-MM-DD.
// 2026-02-31 is rejected because February has no 31st.
function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// YYYY-MM-DD + n days -> YYYY-MM-DD (negative n goes backwards).
function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// "2026-10-25" -> "Sunday"
function weekdayName(isoDate) {
  const date = new Date(isoDate + 'T00:00:00Z');
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(date);
}

// A timestamp -> "YYYY-MM-DD HH:mm:ss" in the configured timezone.
// Used on the entry page and in the CSV export.
function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

// The current hour (0-23) in the configured timezone - used for the greeting.
function hourInTimezone(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  return Number(parts.find((part) => part.type === 'hour').value);
}

// Object with today / year / month helpers used by the calendar.
function todayParts(now = new Date()) {
  const iso = todayInTimezone(now);
  return {
    iso,
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10))
  };
}

// First and last day of a month, as YYYY-MM-DD. month is 1-12.
function monthRange(year, month) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); // day 0 = last day of previous month
  const last = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { first, last };
}

module.exports = {
  TIMEZONE,
  todayInTimezone,
  isValidDateString,
  addDays,
  weekdayName,
  formatDateTime,
  hourInTimezone,
  todayParts,
  monthRange
};
