// public/js/dashboard.js - small touches for the dashboard.
// Nothing important happens here: the server still checks everything.

(function () {
  // Dashboard image carousel. It stays isolated to pages that render the hero.
  var carousel = document.querySelector('[data-carousel]');
  if (carousel) {
    var slides = Array.prototype.slice.call(carousel.querySelectorAll('.dashboard-hero__slide'));
    var dots = Array.prototype.slice.call(carousel.querySelectorAll('.dashboard-hero__dot'));
    var activeIndex = 0;
    var rotation;

    function showSlide(index) {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach(function (slide, slideIndex) {
        slide.classList.toggle('is-active', slideIndex === activeIndex);
      });
      dots.forEach(function (dot, dotIndex) {
        var active = dotIndex === activeIndex;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function startRotation() {
      window.clearInterval(rotation);
      rotation = window.setInterval(function () { showSlide(activeIndex + 1); }, 2000);
    }

    dots.forEach(function (dot, index) {
      dot.addEventListener('click', function () {
        showSlide(index);
        startRotation();
      });
    });
    carousel.addEventListener('mouseenter', function () { window.clearInterval(rotation); });
    carousel.addEventListener('mouseleave', startRotation);
    showSlide(0);
    startRotation();
  }

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
