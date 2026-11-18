'use strict';

const PALETTE = {
  crimson: '#822433',
  crimsonSoft: '#c9737f',
  text: '#e0e0e0',
  dim: '#8d8d8d',
  line: '#2a2a2a',
  surface: '#1e1e1e',
};

const DEFAULT_COLOR = PALETTE.crimson;

// Given a hex color, return a darkened version for last week's bar.
function darken(hex, amount = 0.45) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((n >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((n >> 8) & 0xff) * (1 - amount));
  const b = Math.round((n & 0xff) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

function formatHours(hours) {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

function weekRangeLabel(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(weekStart + 6 * 24 * 3600 * 1000);
  const fmt = { month: 'short', day: 'numeric' };
  return `Week of ${start.toLocaleDateString(undefined, fmt)} – ${end.toLocaleDateString(undefined, fmt)}`;
}

function renderTotals(data) {
  const wrap = document.getElementById('totals');
  wrap.replaceChildren(
    ...data.labels.map((label, i) => {
      const thisWeek = data.thisWeek[i];
      const lastWeek = data.lastWeek[i];
      const diff = thisWeek - lastWeek;
      const color = data.colors[i] || DEFAULT_COLOR;

      const card = document.createElement('article');
      card.className = 'total';
      card.style.borderLeft = `3px solid ${color}`;

      const name = document.createElement('p');
      name.className = 'total__name';
      name.textContent = label;

      const value = document.createElement('p');
      value.className = 'total__value';
      value.textContent = formatHours(thisWeek);

      const delta = document.createElement('p');
      delta.className = 'total__delta';
      delta.textContent =
        lastWeek === 0 && thisWeek === 0
          ? 'No time logged either week'
          : `${diff >= 0 ? '+' : '−'}${formatHours(Math.abs(diff))} vs last week`;

      card.append(name, value, delta);
      return card;
    })
  );
}

async function init() {
  const data = await window.timer.weekly();
  document.getElementById('week-range').textContent = weekRangeLabel(data.weekStart);
  renderTotals(data);

  if (typeof Chart === 'undefined') {
    document.getElementById('chart-error').hidden = false;
    return;
  }

  // Per-subject colors: this week = subject color, last week = darkened shade.
  const thisWeekColors = data.colors.map((c) => c || DEFAULT_COLOR);
  const lastWeekColors = data.colors.map((c) => darken(c || DEFAULT_COLOR));

  Chart.defaults.color = PALETTE.dim;
  Chart.defaults.font.family = 'Inter, "Segoe UI", system-ui, sans-serif';

  new Chart(document.getElementById('chart'), {
    type: 'bar',
    data: {
      labels: data.labels,
      // Last week on the left, this week on the right.
      datasets: [
        {
          label: 'Last week',
          data: data.lastWeek,
          backgroundColor: lastWeekColors,
          hoverBackgroundColor: lastWeekColors.map((c) => c),
          borderRadius: 3,
        },
        {
          label: 'This week',
          data: data.thisWeek,
          backgroundColor: thisWeekColors,
          hoverBackgroundColor: thisWeekColors,
          borderRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: PALETTE.surface,
          borderColor: PALETTE.line,
          borderWidth: 1,
          titleColor: PALETTE.text,
          bodyColor: PALETTE.text,
          padding: 10,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatHours(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: PALETTE.line },
          ticks: { color: PALETTE.text },
        },
        y: {
          beginAtZero: true,
          grid: { color: PALETTE.line },
          border: { display: false },
          ticks: { color: PALETTE.dim, callback: (v) => `${v}h` },
          title: { display: true, text: 'Hours', color: PALETTE.dim },
        },
      },
    },
  });
}

init();
