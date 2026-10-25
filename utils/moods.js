// utils/moods.js - the SINGLE SOURCE OF TRUTH for the 8 moods.
// The server checks moods against this list, and the views render it.
// The keys (lowercase) are exactly what is stored in entries.mood.

const MOOD_LIST = [
  { key: 'happy', label: 'Happy', emoji: '😊', color: '#FFF3C4', text: '#7A5C00' },   // soft yellow
  { key: 'calm', label: 'Calm', emoji: '😌', color: '#D8F3DC', text: '#2D6A4F' },    // soft green
  { key: 'excited', label: 'Excited', emoji: '🤩', color: '#FFD8A8', text: '#9A4E00' }, // orange
  { key: 'neutral', label: 'Neutral', emoji: '😐', color: '#E9ECEF', text: '#495057' }, // gray
  { key: 'tired', label: 'Tired', emoji: '😴', color: '#D0E8FF', text: '#1C5D8C' },  // light blue
  { key: 'anxious', label: 'Anxious', emoji: '😰', color: '#E5DBFF', text: '#5F3DC4' }, // purple
  { key: 'sad', label: 'Sad', emoji: '😢', color: '#AFC9E8', text: '#10314F' },       // dark blue
  { key: 'angry', label: 'Angry', emoji: '😠', color: '#FFD6D6', text: '#A61B1B' }    // soft red
];

// Look-up object: MOODS.happy -> { key, label, emoji, color, text }
const MOODS = {};
MOOD_LIST.forEach((mood) => {
  MOODS[mood.key] = mood;
});

const MOOD_KEYS = MOOD_LIST.map((mood) => mood.key);

// The SQL CHECK list for schema.sql: 'happy','calm',...
const MOOD_SQL_LIST = MOOD_KEYS.map((key) => `'${key}'`).join(',');

// True only for one of the 8 known moods.
function isValidMood(key) {
  return MOOD_KEYS.includes(key);
}

module.exports = { MOODS, MOOD_LIST, MOOD_KEYS, MOOD_SQL_LIST, isValidMood };
