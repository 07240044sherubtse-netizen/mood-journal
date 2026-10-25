// public/js/calendar.js - a small pop-up for logged days.
// If the request fails for any reason we simply follow the link to the entry
// page, so the calendar keeps working even without JavaScript or the API.

(function () {
  var modal = document.getElementById('day-modal');
  if (!modal) return;

  var title = document.getElementById('day-modal-title');
  var moodLine = document.getElementById('day-modal-mood');
  var noteLine = document.getElementById('day-modal-note');
  var link = document.getElementById('day-modal-link');
  var closeButton = document.getElementById('day-modal-close');

  function close() {
    modal.classList.add('is-hidden');
  }

  function open() {
    modal.classList.remove('is-hidden');
    if (closeButton) closeButton.focus();
  }

  // Fill the pop-up using textContent only: never HTML from the database.
  function fill(day) {
    title.textContent = day.label;
    moodLine.textContent = day.mood + ' ' + day.emoji;
    if (day.note) {
      noteLine.textContent = day.note;
      noteLine.classList.remove('is-hidden');
    } else {
      noteLine.textContent = 'No note written for this day.';
    }
    link.href = '/entries/' + day.date;
  }

  // Clicking a coloured day: try the API first, fall back to the page.
  document.addEventListener('click', function (event) {
    var dayLink = event.target.closest('a.calendar__day--logged');
    if (!dayLink) return;

    event.preventDefault();
    var date = dayLink.getAttribute('data-date');

    fetch('/api/entries/' + date, { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('No entry');
        return response.json();
      })
      .then(function (entry) {
        fill(entry);
        open();
      })
      .catch(function () {
        window.location.href = dayLink.href;
      });
  });

  if (closeButton) closeButton.addEventListener('click', close);

  // Clicking the dark area around the box, or pressing Escape, closes it.
  modal.addEventListener('click', function (event) {
    if (event.target === modal) close();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !modal.classList.contains('is-hidden')) close();
  });
})();
