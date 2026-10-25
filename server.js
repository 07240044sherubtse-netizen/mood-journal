// server.js - only starts the server. All app setup lives in app.js.
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`MoodJournal running on http://localhost:${PORT}`);
});
