// Accessible, dependency-free SVG charts for the dashboard Mood Analytics.
(function () {
  var root = document.getElementById('mood-analytics');
  if (!root || !window.fetch) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var today = root.getAttribute('data-today');
  var state = {
    view: 'week',
    weekStart: startOfWeek(today),
    month: today.slice(0, 7),
    response: null,
    requestId: 0
  };

  var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-view]'));
  var previous = document.getElementById('analytics-previous');
  var next = document.getElementById('analytics-next');
  var title = document.getElementById('analytics-period-title');
  var subtitle = document.getElementById('analytics-period-subtitle');
  var periodLabel = document.getElementById('analytics-period-label');
  var weeklyChart = document.getElementById('weekly-chart');
  var monthlyChart = document.getElementById('monthly-chart');
  var empty = document.getElementById('analytics-empty');
  var error = document.getElementById('analytics-error');
  var footnote = document.getElementById('analytics-footnote');
  var chartWrap = document.getElementById('analytics-chart-wrap');

  function parseDate(value) {
    var parts = value.split('-').map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }

  function dateString(date) {
    return date.toISOString().slice(0, 10);
  }

  function shiftDate(value, days) {
    var date = parseDate(value);
    date.setUTCDate(date.getUTCDate() + days);
    return dateString(date);
  }

  function startOfWeek(value) {
    var date = parseDate(value);
    var day = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
    return dateString(date);
  }

  function shiftMonth(value, offset) {
    var parts = value.split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1 + offset, 1));
    return date.toISOString().slice(0, 7);
  }

  function svgElement(name, attributes, text) {
    var element = document.createElementNS(SVG_NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      element.setAttribute(key, attributes[key]);
    });
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function clearSvg(svg, viewBox, label) {
    svg.replaceChildren();
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  }

  function updateSummary(data) {
    document.getElementById('analytics-total').textContent = data.summary.totalAllTime;
    document.getElementById('analytics-current-streak').textContent = data.summary.currentStreak + ' days';
    document.getElementById('analytics-longest-streak').textContent = data.summary.longestStreak + ' days';
    document.getElementById('analytics-positive').textContent = data.summary.positive;
    document.getElementById('analytics-neutral').textContent = data.summary.neutral;
    document.getElementById('analytics-negative').textContent = data.summary.negative;
    var common = data.month.mostFrequent;
    document.getElementById('analytics-common').textContent = common
      ? common.emoji + ' ' + common.label
      : '—';
  }

  function drawWeek(data) {
    var width = 980;
    var height = 380;
    var left = 168;
    var right = 24;
    var top = 26;
    var bottom = 274;
    var plotWidth = width - left - right;
    var axis = data.moodAxis;
    var row = (bottom - top) / (axis.length - 1);
    var xFor = function (index) { return left + (plotWidth * index) / 6; };
    var yForMood = function (key) {
      var moodIndex = axis.findIndex(function (mood) { return mood.key === key; });
      return moodIndex < 0 ? null : bottom - moodIndex * row;
    };

    clearSvg(weeklyChart, '0 0 ' + width + ' ' + height, 'Weekly moods from Monday through Sunday, with mood categories on the vertical axis.');
    weeklyChart.appendChild(svgElement('title', {}, 'Weekly mood overview'));
    weeklyChart.appendChild(svgElement('desc', {}, 'Missing days are shown as gaps and are not assigned a mood score.'));

    axis.forEach(function (mood, index) {
      var y = bottom - index * row;
      weeklyChart.appendChild(svgElement('line', {
        x1: left, y1: y, x2: width - right, y2: y, class: 'chart-gridline'
      }));
      weeklyChart.appendChild(svgElement('text', {
        x: left - 16, y: y + 4, class: 'chart-axis-label', 'text-anchor': 'end'
      }, mood.emoji + ' ' + mood.label));
    });

    data.week.days.forEach(function (day, index) {
      var x = xFor(index);
      var y = day.mood ? yForMood(day.mood) : null;
      if (index > 0) {
        var before = data.week.days[index - 1];
        var beforeY = before.mood ? yForMood(before.mood) : null;
        // Only join consecutive logged days; gaps remain visible as gaps.
        if (y !== null && beforeY !== null) {
          weeklyChart.appendChild(svgElement('line', {
            x1: xFor(index - 1), y1: beforeY, x2: x, y2: y, class: 'chart-mood-line'
          }));
        }
      }

      weeklyChart.appendChild(svgElement('text', {
        x: x, y: bottom + 28, class: 'chart-day-label', 'text-anchor': 'middle'
      }, day.weekday));
      weeklyChart.appendChild(svgElement('text', {
        x: x, y: bottom + 45, class: 'chart-date-label', 'text-anchor': 'middle'
      }, day.date.slice(5)));

      if (day.mood) {
        var point = svgElement('circle', {
          cx: x, cy: y, r: 8, fill: day.color, class: 'chart-mood-point', tabindex: '0'
        });
        point.appendChild(svgElement('title', {}, day.date + ' · ' + day.moodLabel));
        weeklyChart.appendChild(point);
      } else {
        weeklyChart.appendChild(svgElement('text', {
          x: x, y: bottom + 66, class: 'chart-no-entry', 'text-anchor': 'middle'
        }, 'No entry'));
      }
    });
  }

  function drawMonth(data) {
    var width = 940;
    var rowHeight = 40;
    var top = 30;
    var height = top + data.month.moods.length * rowHeight + 16;
    var labelX = 12;
    var barX = 220;
    var maxWidth = 590;
    var maxCount = Math.max.apply(null, data.month.moods.map(function (mood) { return mood.count; }).concat([1]));

    clearSvg(monthlyChart, '0 0 ' + width + ' ' + height, 'Monthly count of each recorded mood.');
    monthlyChart.appendChild(svgElement('title', {}, data.month.label + ' mood distribution'));
    monthlyChart.appendChild(svgElement('desc', {}, data.month.total + ' mood entries recorded during this month.'));

    data.month.moods.forEach(function (mood, index) {
      var y = top + index * rowHeight;
      monthlyChart.appendChild(svgElement('text', {
        x: labelX, y: y + 17, class: 'chart-axis-label'
      }, mood.emoji + ' ' + mood.label));
      monthlyChart.appendChild(svgElement('rect', {
        x: barX, y: y + 3, width: maxWidth, height: 22, rx: 11, class: 'chart-bar-track'
      }));
      if (mood.count > 0) {
        monthlyChart.appendChild(svgElement('rect', {
          x: barX, y: y + 3, width: Math.max(8, (maxWidth * mood.count) / maxCount),
          height: 22, rx: 11, fill: mood.color, class: 'chart-bar'
        }));
      }
      monthlyChart.appendChild(svgElement('text', {
        x: barX + maxWidth + 18, y: y + 19, class: 'chart-count-label'
      }, String(mood.count)));
    });
  }

  function render() {
    if (!state.response) return;
    var data = state.response;
    var isWeek = state.view === 'week';
    var period = isWeek ? data.week : data.month;
    var hasEntries = isWeek
      ? data.week.days.some(function (day) { return Boolean(day.mood); })
      : data.month.total > 0;

    weeklyChart.classList.toggle('is-hidden', !isWeek);
    monthlyChart.classList.toggle('is-hidden', isWeek);
    title.textContent = isWeek
      ? 'Mood Overview: ' + (state.weekStart === startOfWeek(today) ? 'This Week' : 'Week of ' + data.week.label)
      : 'Mood Overview: ' + data.month.label;
    subtitle.textContent = isWeek
      ? 'Your mood by day, Monday to Sunday.'
      : data.month.total + ' ' + (data.month.total === 1 ? 'entry' : 'entries') + ' recorded this month.';
    periodLabel.textContent = period.label || period.key;
    previous.setAttribute('aria-label', isWeek ? 'Previous week' : 'Previous month');
    next.setAttribute('aria-label', isWeek ? 'Next week' : 'Next month');
    next.disabled = isWeek
      ? state.weekStart >= startOfWeek(today)
      : state.month >= today.slice(0, 7);

    empty.classList.toggle('is-hidden', hasEntries);
    empty.textContent = hasEntries
      ? ''
      : (data.summary.totalAllTime === 0
        ? 'Your mood story starts with one small check-in. Log today’s mood to see it appear here.'
        : (isWeek ? 'No entries for this week yet. Blank days are left open, not scored as zero.' : 'No moods recorded in this month yet.'));
    footnote.textContent = isWeek
      ? 'Gaps mean no mood was recorded; they are not scored as zero.'
      : 'Bars show how often each mood was recorded this month.';

    if (isWeek) drawWeek(data);
    else drawMonth(data);
  }

  function load() {
    var requestId = ++state.requestId;
    error.classList.add('is-hidden');
    error.textContent = '';
    chartWrap.setAttribute('aria-busy', 'true');
    periodLabel.textContent = 'Loading…';
    var query = new URLSearchParams({ week: state.weekStart, month: state.month });

    fetch('/api/analytics?' + query.toString(), {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    })
      .then(function (response) {
        if (!response.ok) throw new Error('Analytics could not be loaded. Please try again.');
        return response.json();
      })
      .then(function (data) {
        if (requestId !== state.requestId) return;
        state.response = data;
        state.weekStart = data.week.start;
        state.month = data.month.key;
        updateSummary(data);
        render();
      })
      .catch(function () {
        if (requestId !== state.requestId) return;
        error.textContent = 'Mood analytics could not load right now. Refresh the page and try again.';
        error.classList.remove('is-hidden');
      })
      .finally(function () {
        if (requestId === state.requestId) chartWrap.setAttribute('aria-busy', 'false');
      });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      state.view = tab.getAttribute('data-view');
      tabs.forEach(function (item) {
        var active = item === tab;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      render();
    });
  });

  previous.addEventListener('click', function () {
    if (state.view === 'week') state.weekStart = shiftDate(state.weekStart, -7);
    else state.month = shiftMonth(state.month, -1);
    load();
  });

  next.addEventListener('click', function () {
    if (next.disabled) return;
    if (state.view === 'week') state.weekStart = shiftDate(state.weekStart, 7);
    else state.month = shiftMonth(state.month, 1);
    load();
  });

  load();
})();
