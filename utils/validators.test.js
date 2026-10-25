// utils/validators.test.js - every input rule, checked one by one.
const validators = require('./validators');
const { MOOD_KEYS } = require('./moods');

describe('isValidEmail', () => {
  test('accepts an ordinary address, with spaces trimmed', () => {
    expect(validators.isValidEmail('nima@example.com')).toBe(true);
    expect(validators.isValidEmail('  nima@example.com  ')).toBe(true);
  });

  test('rejects what is clearly not an address', () => {
    ['no-at-sign', 'a@b', '@example.com', 'nima@', '', 'nima example.com'].forEach((value) => {
      expect(validators.isValidEmail(value)).toBe(false);
    });
  });

  test('rejects anything that is not a string, and very long addresses', () => {
    expect(validators.isValidEmail(null)).toBe(false);
    expect(validators.isValidEmail(42)).toBe(false);
    expect(validators.isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
});

describe('isValidPassword', () => {
  test('needs at least 8 characters', () => {
    expect(validators.isValidPassword('1234567')).toBe(false);
    expect(validators.isValidPassword('12345678')).toBe(true);
  });

  test('rejects a non-string', () => {
    expect(validators.isValidPassword(undefined)).toBe(false);
  });
});

describe('validateSignup', () => {
  const good = {
    name: 'Nima Wangmo',
    email: 'Nima@Example.com',
    password: 'password123',
    confirmPassword: 'password123'
  };

  test('accepts a good form and cleans the values', () => {
    const result = validators.validateSignup({ ...good, name: '   Nima Wangmo  ' });
    expect(result.ok).toBe(true);
    expect(result.name).toBe('Nima Wangmo');       // trimmed
    expect(result.email).toBe('nima@example.com'); // always lowercase
  });

  test('refuses a missing or too long name', () => {
    expect(validators.validateSignup({ ...good, name: '   ' }).ok).toBe(false);
    expect(validators.validateSignup({ ...good, name: 'x'.repeat(101) }).ok).toBe(false);
  });

  test('refuses a bad email', () => {
    expect(validators.validateSignup({ ...good, email: 'nope' }).ok).toBe(false);
  });

  test('refuses a short password', () => {
    const result = validators.validateSignup({ ...good, password: 'short', confirmPassword: 'short' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least 8/);
  });

  test('refuses two different passwords', () => {
    const result = validators.validateSignup({ ...good, confirmPassword: 'password124' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/do not match/);
  });
});

describe('validateNote', () => {
  test('an absent or empty note means no note at all', () => {
    expect(validators.validateNote(undefined).value).toBeNull();
    expect(validators.validateNote(null).value).toBeNull();
    expect(validators.validateNote('').value).toBeNull();
    expect(validators.validateNote('    ').value).toBeNull();
  });

  test('trims the note', () => {
    expect(validators.validateNote('  a good day  ').value).toBe('a good day');
  });

  test('allows exactly 200 characters and refuses 201', () => {
    expect(validators.validateNote('x'.repeat(200)).ok).toBe(true);
    const tooLong = validators.validateNote('x'.repeat(201));
    expect(tooLong.ok).toBe(false);
    expect(tooLong.error).toMatch(/200/);
  });
});

describe('isValidMood', () => {
  test('knows all eight moods', () => {
    expect(MOOD_KEYS).toHaveLength(8);
    MOOD_KEYS.forEach((key) => expect(validators.isValidMood(key)).toBe(true));
  });

  test('refuses anything else, including the wrong letter case', () => {
    ['Happy', 'sleepy', '', 'happy ', null, undefined].forEach((value) => {
      expect(validators.isValidMood(value)).toBe(false);
    });
  });
});

describe('dates', () => {
  test('accepts real calendar dates only', () => {
    expect(validators.isValidDate('2026-10-25')).toBe(true);
    expect(validators.isValidDate('2026-02-31')).toBe(false); // February has no 31st
    expect(validators.isValidDate('2026-13-01')).toBe(false);
    expect(validators.isValidDate('26-10-25')).toBe(false);
    expect(validators.isValidDate('today')).toBe(false);
  });

  test('knows what is in the future', () => {
    expect(validators.isFutureDate('2026-10-26', '2026-10-25')).toBe(true);
    expect(validators.isFutureDate('2026-10-25', '2026-10-25')).toBe(false);
    expect(validators.isFutureDate('2026-10-24', '2026-10-25')).toBe(false);
  });
});
