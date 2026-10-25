// utils/csv.js - turning rows into a CSV file, without any extra library.
// Pure functions only: give it values, get text back. Easy to test on its own.

// A UTF-8 byte-order mark at the very start of the file. Without it Excel opens
// the file in the old Windows encoding and emojis/accents come out as rubbish.
const BOM = '\uFEFF';

// A field starting with one of these could be read as a formula by Excel or
// Google Sheets ("=2+2", "-1", "@SUM..."). A leading apostrophe keeps it text.
const FORMULA_START = /^[=+\-@\t\r]/;

// Every field is wrapped in double quotes and every inner quote is doubled,
// so commas, quotes and line breaks inside a note are safe.
// null / undefined (an entry with no note) becomes an empty field: "".
function escapeField(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// One row of fields -> one line of CSV.
function rowText(values) {
  return values.map(escapeField).join(',');
}

// The header plus every row -> the whole CSV text.
// Lines end with CRLF (\r\n), which is what Excel expects.
function toCsv(header, rows) {
  const lines = [rowText(header)];
  rows.forEach((row) => lines.push(rowText(row)));
  return `${lines.join('\r\n')}\r\n`;
}

// Put the BOM in front of the finished file.
function withBom(text) {
  return BOM + text;
}

module.exports = { BOM, escapeField, rowText, toCsv, withBom };
