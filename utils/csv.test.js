// utils/csv.test.js - the CSV rules, checked without any spreadsheet program.
const csv = require('./csv');

describe('escapeField', () => {
  test('wraps every field in double quotes', () => {
    expect(csv.escapeField('happy')).toBe('"happy"');
  });

  test('doubles a quote that is inside the text', () => {
    expect(csv.escapeField('say "hi"')).toBe('"say ""hi"""');
  });

  test('keeps commas, new lines and semicolons safe inside the quotes', () => {
    expect(csv.escapeField('a, b')).toBe('"a, b"');
    expect(csv.escapeField('first\nsecond')).toBe('"first\nsecond"');
    expect(csv.escapeField('first\r\nsecond')).toBe('"first\r\nsecond"');
  });

  test('an empty note becomes an empty field', () => {
    expect(csv.escapeField('')).toBe('""');
    expect(csv.escapeField(null)).toBe('""');
    expect(csv.escapeField(undefined)).toBe('""');
  });

  test('a field that looks like a formula gets a leading apostrophe', () => {
    expect(csv.escapeField('=2+2')).toBe('"\'=2+2"');
    expect(csv.escapeField('+1')).toBe('"\'+1"');
    expect(csv.escapeField('-1')).toBe('"\'-1"');
    expect(csv.escapeField('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csv.escapeField('\tstarts with a tab')).toBe('"\'\tstarts with a tab"');
    expect(csv.escapeField('\rback to the start')).toBe('"\'\rback to the start"');
  });

  test('the apostrophe guard only applies at the start of the text', () => {
    expect(csv.escapeField('well-known')).toBe('"well-known"');
    expect(csv.escapeField('a - b')).toBe('"a - b"');
    expect(csv.escapeField('total = 3')).toBe('"total = 3"');
  });
});

describe('rowText', () => {
  test('joins the fields with commas', () => {
    expect(csv.rowText(['a', 'b', 'c'])).toBe('"a","b","c"');
  });

  test('escapes each field on its own', () => {
    expect(csv.rowText(['quiet, calm', '=x'])).toBe('"quiet, calm","\'=x"');
  });
});

describe('toCsv', () => {
  test('puts the header on the first line and ends every line with CRLF', () => {
    const text = csv.toCsv(['date', 'mood'], [['2026-10-25', 'happy']]);
    expect(text).toBe('"date","mood"\r\n"2026-10-25","happy"\r\n');
  });

  test('with no rows it is still a valid file with its header', () => {
    expect(csv.toCsv(['date', 'mood'], [])).toBe('"date","mood"\r\n');
  });

  test('a note with a comma, a quote and a line break stays one field', () => {
    const text = csv.toCsv(['note'], [['a, "b"\nc']]);
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('"note"');
    expect(lines[1]).toBe('"a, ""b""\nc"');
  });
});

describe('withBom', () => {
  test('starts the file with the UTF-8 byte-order mark', () => {
    expect(csv.withBom('x').startsWith(csv.BOM)).toBe(true);
    expect(csv.BOM).toBe('\uFEFF');
  });
});

describe('a whole little file', () => {
  test('matches exactly what the export sends', () => {
    const text = csv.withBom(
      csv.toCsv(
        ['date', 'weekday', 'mood', 'note', 'logged_at', 'updated_at'],
        [
          ['2026-10-24', 'Saturday', 'calm', '', '2026-10-24 20:01:00', '2026-10-24 20:01:00'],
          ['2026-10-25', 'Sunday', 'happy', 'Good, calm day', '2026-10-25 09:15:00', '2026-10-25 09:15:00']
        ]
      )
    );

    expect(text.charCodeAt(0)).toBe(0xfeff); // the BOM really is there
    const withoutBom = text.slice(1);
    const lines = withoutBom.split('\r\n').filter((line) => line.length > 0);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('"date","weekday","mood","note","logged_at","updated_at"');
    expect(lines[1]).toBe('"2026-10-24","Saturday","calm","","2026-10-24 20:01:00","2026-10-24 20:01:00"');
    expect(lines[2]).toContain('"Good, calm day"');
  });
});
