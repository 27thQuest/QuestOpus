let subjects = [];
let allocations = {};
let extras = [];
let state = null; // full timer state, kept for re-render

const TOTAL_HOURS = 168;
const EXTRAS_KEY = "plan_extras";
const INCLUDE_LIFESTYLE_KEY = "plan_include_lifestyle";

let includeLifestyle = false;

const EXTRA_COLORS = [
  "#6b7280",
  "#7c6f9f",
  "#4a7c6f",
  "#7a6048",
  "#4a6080",
];

/* ------------------------------------------------------------------ */
/* Extras persistence                                                   */
/* ------------------------------------------------------------------ */

function loadExtras() {
  try { return JSON.parse(localStorage.getItem(EXTRAS_KEY) || "[]"); }
  catch { return []; }
}

function saveExtras() {
  localStorage.setItem(EXTRAS_KEY, JSON.stringify(extras));
}

function loadIncludeLifestyle() {
  return localStorage.getItem(INCLUDE_LIFESTYLE_KEY) === "true";
}

function saveIncludeLifestyle() {
  localStorage.setItem(
    INCLUDE_LIFESTYLE_KEY,
    String(includeLifestyle)
  );
}

function nextExtraColor() {
  return EXTRA_COLORS[extras.length % EXTRA_COLORS.length];
}

function genExtraId() {
  return "extra_" + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 6);
}

/* ------------------------------------------------------------------ */
/* Date helpers (current week Mon–Sun)                                  */
/* ------------------------------------------------------------------ */

function getThisWeekDates() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);

  // Format using LOCAL calendar dates, not UTC.
  function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return localDateKey(date);
  });
}

/* ms → "Xh Ym" */
function msToHours(ms) {
  return ms / 3600000;
}

/* ------------------------------------------------------------------ */
/* Init                                                                 */
/* ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", initPlan);

async function initPlan() {
  state = await window.timer.getState();
  const savedPlan = await window.timer.getPlan();

  subjects = (state.subjects || []);

  allocations = {};
  for (const subject of subjects) {
    allocations[subject.id] = Number(savedPlan[subject.id] || 0);
  }

  extras = loadExtras();
  includeLifestyle = loadIncludeLifestyle();

  const lifestyleCheckbox =
    document.getElementById("include-lifestyle-checkbox");

  if (lifestyleCheckbox) {
    lifestyleCheckbox.checked = includeLifestyle;

    lifestyleCheckbox.addEventListener("change", () => {
      includeLifestyle = lifestyleCheckbox.checked;
      saveIncludeLifestyle();
      renderActiveBar();
    });
  }

  render();

  document.getElementById("allocation-add-btn")
    ?.addEventListener("click", addAllocation);

  document.getElementById("extra-add-btn")
    .addEventListener("click", openExtraDialog);

  document.getElementById("extra-dialog-cancel")
    .addEventListener("click", closeExtraDialog);

  document.getElementById("extra-dialog-save")
    .addEventListener("click", saveExtraDialog);
}

/* ------------------------------------------------------------------ */
/* Render                                                               */
/* ------------------------------------------------------------------ */

function render() {
  renderPlannedBar();
  renderActiveBar();
  renderAllocations();
  renderExtras();
}

/* ------------------------------------------------------------------ */
/* Planned Week bar                                                     */
/* ------------------------------------------------------------------ */

function renderPlannedBar() {
  const bar = document.getElementById("plan-bar");
  const legend = document.getElementById("plan-legend");

  const projectHours = Object.values(allocations)
    .reduce((s, h) => s + h, 0);

  const extraHours = extras
    .reduce((s, e) => s + e.hours, 0);

  const allocated = projectHours + extraHours;
  const unallocated = Math.max(TOTAL_HOURS - allocated, 0);

  document.getElementById("plan-allocated-label").textContent =
    `${formatHours(allocated)}h allocated`;

  document.getElementById("plan-unallocated-label").textContent =
    `${formatHours(unallocated)}h unallocated`;

  bar.innerHTML = "";
  legend.innerHTML = "";

  for (const subject of subjects) {
    const hours = allocations[subject.id] || 0;
    if (hours <= 0) continue;

    appendBarSegment(
      bar,
      legend,
      subject.name,
      hours,
      subject.color || "var(--crimson)"
    );
  }

  for (const extra of extras) {
    if (extra.hours <= 0) continue;

    appendBarSegment(
      bar,
      legend,
      extra.name,
      extra.hours,
      extra.color
    );
  }

  if (unallocated > 0) {
    appendBarSegmentUntracked(
      bar,
      legend,
      "Unallocated",
      unallocated
    );
  }
}

/* ------------------------------------------------------------------ */
/* Active Week bar (real data + optional lifestyle blocks)              */
/* ------------------------------------------------------------------ */

function renderActiveBar() {
  const bar = document.getElementById("active-bar");
  const legend = document.getElementById("active-legend");

  bar.innerHTML = "";
  legend.innerHTML = "";

  const weekDates = getThisWeekDates();

  // Sum real tracked time per subject for this week
  const subjectMs = {};

  for (const subject of subjects) {
    subjectMs[subject.id] = 0;
  }

  for (const entry of state.entries || []) {
    if (!entry) continue;

    const dur = Number(entry.duration || 0);

    if (!Number.isFinite(dur) || dur <= 0) continue;
    if (!weekDates.includes(entry.date)) continue;
    if (subjectMs[entry.subjectId] === undefined) continue;

    subjectMs[entry.subjectId] += dur;
  }

  // Convert to hours
  const subjectHours = {};
  let trackedTotal = 0;

  for (const subject of subjects) {
    const h = msToHours(subjectMs[subject.id] || 0);

    subjectHours[subject.id] = h;
    trackedTotal += h;
  }

  // Lifestyle blocks are included only when the checkbox is enabled.
  const extraHours = includeLifestyle
    ? extras.reduce((s, e) => s + e.hours, 0)
    : 0;

  const now = new Date();
  const nextMonday = new Date(now);

  // Sunday → tomorrow; other days → next Monday.
  const daysUntilMonday = ((8 - now.getDay()) % 7) || 7;

  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);

  const remainingMs = Math.max(0, nextMonday.getTime() - now.getTime());
  const remainingMinutes = Math.ceil(remainingMs / 60000);

  const unloggedHours = Math.floor(remainingMinutes / 60);
  const unloggedMins = remainingMinutes % 60;

  const logged = trackedTotal + extraHours;
  const unlogged = remainingMs / 3600000;

  document.getElementById("active-logged-label").textContent =
    `${formatHours(logged)}h logged`;

  document.getElementById("active-unlogged-label").textContent =
    `${unloggedHours}h ${String(unloggedMins).padStart(2, "0")}m unlogged`;

  // Project segments
  for (const subject of subjects) {
    const h = subjectHours[subject.id] || 0;

    if (h <= 0) continue;

    appendBarSegment(
      bar,
      legend,
      subject.name,
      h,
      subject.color || "var(--crimson)"
    );
  }

  // Lifestyle block segments
  if (includeLifestyle) {
    for (const extra of extras) {
      if (extra.hours <= 0) continue;

      appendBarSegment(
        bar,
        legend,
        extra.name,
        extra.hours,
        extra.color
      );
    }
  }

  // Unlogged
  if (unlogged > 0) {
    appendBarSegmentUntracked(
      bar,
      legend,
      "Unlogged",
      unlogged
    );
  }
}

/* ------------------------------------------------------------------ */
/* Bar segment helpers                                                  */
/* ------------------------------------------------------------------ */

function appendBarSegment(bar, legend, name, hours, color) {
  const pct = (hours / TOTAL_HOURS) * 100;

  const seg = document.createElement("div");
  seg.className = "time-budget__segment";
  seg.style.width = `${pct}%`;
  seg.style.background = color;
  seg.title = `${name}: ${formatHours(hours)}h`;

  bar.appendChild(seg);

  const item = document.createElement("div");
  item.className = "time-budget__legend-item";

  const dot = document.createElement("span");
  dot.className = "time-budget__legend-dot";
  dot.style.background = color;

  const lbl = document.createElement("span");
  lbl.textContent = `${name} ${formatHours(hours)}h`;

  item.append(dot, lbl);
  legend.appendChild(item);
}

function appendBarSegmentUntracked(bar, legend, label, hours) {
  const pct = (hours / TOTAL_HOURS) * 100;

  const seg = document.createElement("div");
  seg.className =
    "time-budget__segment time-budget__segment--unallocated";

  seg.style.width = `${pct}%`;

  bar.appendChild(seg);

  const item = document.createElement("div");
  item.className = "time-budget__legend-item";

  const dot = document.createElement("span");
  dot.className =
    "time-budget__legend-dot time-budget__legend-dot--unallocated";

  const lbl = document.createElement("span");
  lbl.textContent = `${label} ${formatHours(hours)}h`;

  item.append(dot, lbl);
  legend.appendChild(item);
}

/* ------------------------------------------------------------------ */
/* Project allocations list                                             */
/* ------------------------------------------------------------------ */

function renderAllocations() {
  const list = document.getElementById("allocation-list");
  list.innerHTML = "";

  for (const subject of subjects) {
    const hours = allocations[subject.id] || 0;
    const color = subject.color || "var(--crimson)";

    list.appendChild(
      makeAllocationRow(
        subject.name,
        color,
        hours,
        () => changeAllocation(subject.id, -1),
        () => changeAllocation(subject.id, 1),
        null
      )
    );
  }
}

/* ------------------------------------------------------------------ */
/* Extras list                                                          */
/* ------------------------------------------------------------------ */

function renderExtras() {
  const list = document.getElementById("extras-list");
  list.innerHTML = "";

  if (extras.length === 0) {
    const empty = document.createElement("p");
    empty.className = "extras-empty";
    empty.textContent =
      "No lifestyle blocks yet. Add sleep, meals, commute…";

    list.appendChild(empty);
    return;
  }

  for (const extra of extras) {
    list.appendChild(
      makeAllocationRow(
        extra.name,
        extra.color,
        extra.hours,
        () => changeExtra(extra.id, -1),
        () => changeExtra(extra.id, 1),
        () => deleteExtra(extra.id)
      )
    );
  }
}

/* Shared row builder */
function makeAllocationRow(
  name,
  color,
  hours,
  onMinus,
  onPlus,
  onDelete
) {
  const row = document.createElement("div");
  row.className = "allocation-row";

  const info = document.createElement("div");
  info.className = "allocation-info";

  const dot = document.createElement("span");
  dot.className = "allocation-color";
  dot.style.background = color;

  const nameEl = document.createElement("span");
  nameEl.className = "allocation-name";
  nameEl.textContent = name;

  info.append(dot, nameEl);

  const controls = document.createElement("div");
  controls.className = "allocation-controls";

  const minus = document.createElement("button");
  minus.className = "allocation-btn";
  minus.type = "button";
  minus.textContent = "−";
  minus.addEventListener("click", onMinus);

  const value = document.createElement("span");
  value.className = "allocation-value";
  value.textContent = `${formatHours(hours)}h`;

  const plus = document.createElement("button");
  plus.className = "allocation-btn";
  plus.type = "button";
  plus.textContent = "+";
  plus.addEventListener("click", onPlus);

  controls.append(minus, value, plus);

  if (onDelete) {
    const del = document.createElement("button");
    del.className = "allocation-btn allocation-btn--delete";
    del.type = "button";
    del.textContent = "×";
    del.title = "Remove";
    del.addEventListener("click", onDelete);

    controls.appendChild(del);
  }

  row.append(info, controls);
  return row;
}

/* ------------------------------------------------------------------ */
/* Allocation logic                                                     */
/* ------------------------------------------------------------------ */

function changeAllocation(subjectId, amount) {
  const current = allocations[subjectId] || 0;
  const totalOther = totalAllocatedExcept(subjectId);

  allocations[subjectId] = Math.max(
    0,
    Math.min(
      current + amount,
      TOTAL_HOURS - totalOther
    )
  );

  savePlan();
  render();
}

function totalAllocatedExcept(excludeId) {
  const p = Object.entries(allocations)
    .filter(([id]) => id !== excludeId)
    .reduce((s, [, h]) => s + h, 0);

  return p + extras.reduce((s, e) => s + e.hours, 0);
}

async function savePlan() {
  await window.timer.setPlan(allocations);
}

function addAllocation() {
  const subject = subjects.find(
    s => (allocations[s.id] || 0) === 0
  );

  if (!subject) return;

  allocations[subject.id] = 1;

  savePlan();
  render();
}

function changeExtra(id, amount) {
  const extra = extras.find(e => e.id === id);
  if (!extra) return;

  const otherProject = Object.values(allocations)
    .reduce((s, h) => s + h, 0);

  const otherExtras = extras
    .filter(e => e.id !== id)
    .reduce((s, e) => s + e.hours, 0);

  extra.hours = Math.max(
    0,
    Math.min(
      extra.hours + amount,
      TOTAL_HOURS - otherProject - otherExtras
    )
  );

  saveExtras();
  render();
}

function deleteExtra(id) {
  extras = extras.filter(e => e.id !== id);

  saveExtras();
  render();
}

/* ------------------------------------------------------------------ */
/* Dialog                                                               */
/* ------------------------------------------------------------------ */

function openExtraDialog() {
  const dialog = document.getElementById("extra-dialog");
  const input = document.getElementById("extra-dialog-name");

  input.value = "";
  dialog.hidden = false;
  input.focus();
}

function closeExtraDialog() {
  document.getElementById("extra-dialog").hidden = true;
}

function saveExtraDialog() {
  const input = document.getElementById("extra-dialog-name");
  const name = input.value.trim();

  if (!name) {
    input.focus();
    return;
  }

  extras.push({
    id: genExtraId(),
    name,
    hours: 0,
    color: nextExtraColor()
  });

  saveExtras();
  closeExtraDialog();
  render();
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function formatHours(hours) {
  if (Number.isInteger(hours)) return hours;
  return Number(hours.toFixed(1));
}