// public/js/dashboard.js - small touches for the dashboard.
// Nothing important happens here: the server still checks everything.

(function () {
  var note = document.getElementById('note');
  var count = document.getElementById('note-count');

  // Live character counter for the optional note.
  function updateCount() {
    if (note && count) count.textContent = String(note.value.length);
  }
  if (note) {
    note.addEventListener('input', updateCount);
    updateCount();
  }

  // Show which mood is picked (the radio input itself is visually hidden).
  var options = document.querySelectorAll('.mood-option');
  function refreshSelection() {
    options.forEach(function (option) {
      var input = option.querySelector('input');
      option.classList.toggle('is-selected', Boolean(input && input.checked));
    });
  }
  options.forEach(function (option) {
    var input = option.querySelector('input');
    if (input) input.addEventListener('change', refreshSelection);
  });
  refreshSelection();

  // "Edit today's entry" opens the form when today is already logged.
  var editButton = document.getElementById('edit-today');
  var formWrap = document.getElementById('mood-form-wrap');
  if (editButton && formWrap) {
    editButton.addEventListener('click', function () {
      var hidden = formWrap.classList.toggle('is-hidden');
      editButton.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      if (!hidden) {
        var first = formWrap.querySelector('input[type="radio"]');
        if (first) first.focus();
      }
    });
  }
  // Save today's mood through the JSON API (PUT /api/entries/today).
  // The server still validates everything; if the call fails for any reason we
  // simply post the form in the normal way, so saving never depends on JavaScript.
  var form = document.getElementById('mood-form');
  if (form && window.fetch) {
    var csrfField = form.querySelector('input[name="_csrf"]');
    form.addEventListener('submit', function (event) {
      var picked = form.querySelector('input[name="mood"]:checked');
      if (!picked) return; // the browser will ask for a mood

      event.preventDefault();
      fetch('/api/entries/today', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfField ? csrfField.value : '',
          Accept: 'application/json'
        },
        body: JSON.stringify({ mood: picked.value, note: note ? note.value : '' })
      })
        .then(function (response) {
          if (!response.ok) throw new Error('The API did not accept the entry.');
          window.location.reload(); // the dashboard shows the new streak
        })
        .catch(function () {
          HTMLFormElement.prototype.submit.call(form); // plain form post as a fallback
        });
    });
  }
})();
