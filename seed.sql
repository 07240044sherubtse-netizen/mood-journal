-- seed.sql
-- Sign up and verify an account first, then run this file.
--
-- psql -U postgres -d mood_journal -f seed.sql
--
-- What it does: adds about 30 days of sample mood entries for the FIRST
-- verified user in the users table. There is a mix of all eight moods, a few
-- short notes, and three gaps, so the calendar and the streak numbers have
-- something real to show. Running the file twice is safe.

WITH u AS (
  -- The first verified account, whoever that turns out to be.
  SELECT id FROM users WHERE is_verified = true ORDER BY id LIMIT 1
),
today AS (
  -- "Today" is worked out in the app timezone, the same way the app does it.
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Thimphu')::date AS d
),
sample(day_offset, mood, note) AS (
  VALUES
    -- day_offset is "how many days ago". A missing number is a gap.
    (29, 'happy',   'A good start to the month'),
    (28, 'calm',    NULL),
    (27, 'tired',   'Long day at work'),
    (26, 'neutral', NULL),
    -- gap: 25 days ago was not logged
    (24, 'anxious', 'Big meeting tomorrow'),
    (23, 'happy',   'It went well!'),
    (22, 'excited', 'Weekend plans'),
    (21, 'calm',    NULL),
    -- gap: 20 days ago was not logged
    (19, 'sad',     'Missing home'),
    (18, 'neutral', NULL),
    (17, 'tired',   NULL),
    (16, 'calm',    'Quiet evening'),
    (15, 'angry',   'Rough commute'),
    (14, 'happy',   'Coffee with a friend'),
    (13, 'excited', 'Plans confirmed'),
    -- gap: 12 days ago was not logged
    (11, 'neutral', NULL),
    (10, 'tired',   'Slept badly'),
    (9,  'calm',    NULL),
    (8,  'anxious', 'Lots to do'),
    -- The next eight days are joined up, so the streak shows a 7 day badge.
    (7,  'happy',   'Seven days in a row'),
    (6,  'calm',    NULL),
    (5,  'excited', 'Good news today'),
    (4,  'neutral', NULL),
    (3,  'tired',   NULL),
    (2,  'calm',    'Slow Sunday'),
    (1,  'happy',   NULL),
    (0,  'happy',   'Feeling great today')
)
INSERT INTO entries (user_id, entry_date, mood, note)
SELECT u.id, today.d - sample.day_offset, sample.mood, sample.note
FROM u, today, sample
ON CONFLICT (user_id, entry_date) DO NOTHING;
