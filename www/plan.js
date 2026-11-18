let subjects = [];
let allocations = {};

const TOTAL_HOURS = 168;

document.addEventListener("DOMContentLoaded", initPlan);

async function initPlan() {
  const state = await window.timer.getState();
  const savedPlan = await window.timer.getPlan();

  subjects = (state.subjects || []).filter(
    (subject) => !subject.rest
  );

  allocations = {};

  for (const subject of subjects) {
    allocations[subject.id] = Number(savedPlan[subject.id] || 0);
  }

  render();

  document
    .getElementById("allocation-add-btn")
    ?.addEventListener("click", addAllocation);
}

function render() {
  renderBudget();
  renderAllocations();
}

function renderBudget() {
  const bar = document.getElementById("time-budget-bar");
  const legend = document.getElementById("time-budget-legend");

  const allocated = Object.values(allocations).reduce(
    (sum, hours) => sum + hours,
    0
  );

  const unallocated = Math.max(TOTAL_HOURS - allocated, 0);

  document.getElementById("plan-allocated").textContent =
    `${formatHours(allocated)}h`;

  document.getElementById("plan-unallocated").textContent =
    `${formatHours(unallocated)}h`;

  document.getElementById("plan-unallocated-bottom").textContent =
    `${formatHours(unallocated)}h`;

  bar.innerHTML = "";
  legend.innerHTML = "";

  for (const subject of subjects) {
    const hours = allocations[subject.id] || 0;

    if (hours <= 0) continue;

    const percentage = (hours / TOTAL_HOURS) * 100;

    // Use the project's actual color
    const color = subject.color || "var(--crimson)";

    const segment = document.createElement("div");
    segment.className = "time-budget__segment";
    segment.style.width = `${percentage}%`;
    segment.style.background = color;
    segment.title = `${subject.name}: ${formatHours(hours)}h`;

    bar.appendChild(segment);

    const legendItem = document.createElement("div");
    legendItem.className = "time-budget__legend-item";

    const dot = document.createElement("span");
    dot.className = "time-budget__legend-dot";
    dot.style.background = color;

    const label = document.createElement("span");
    label.textContent = `${subject.name} ${formatHours(hours)}h`;

    legendItem.appendChild(dot);
    legendItem.appendChild(label);

    legend.appendChild(legendItem);
  }

  // Show remaining unallocated time
  if (unallocated > 0) {
    const percentage = (unallocated / TOTAL_HOURS) * 100;

    const segment = document.createElement("div");
    segment.className =
      "time-budget__segment time-budget__segment--unallocated";

    segment.style.width = `${percentage}%`;

    bar.appendChild(segment);

    const legendItem = document.createElement("div");
    legendItem.className = "time-budget__legend-item";

    const dot = document.createElement("span");
    dot.className =
      "time-budget__legend-dot time-budget__legend-dot--unallocated";

    const label = document.createElement("span");
    label.textContent = `Unallocated ${formatHours(unallocated)}h`;

    legendItem.appendChild(dot);
    legendItem.appendChild(label);

    legend.appendChild(legendItem);
  }
}

function renderAllocations() {
  const list = document.getElementById("allocation-list");

  list.innerHTML = "";

  for (const subject of subjects) {
    const hours = allocations[subject.id] || 0;
    const color = subject.color || "var(--crimson)";

    const row = document.createElement("div");
    row.className = "allocation-row";

    const info = document.createElement("div");
    info.className = "allocation-info";

    const dot = document.createElement("span");
    dot.className = "allocation-color";
    dot.style.background = color;

    const name = document.createElement("span");
    name.className = "allocation-name";
    name.textContent = subject.name;

    info.appendChild(dot);
    info.appendChild(name);

    const controls = document.createElement("div");
    controls.className = "allocation-controls";

    const minus = document.createElement("button");
    minus.className = "allocation-btn";
    minus.type = "button";
    minus.textContent = "−";

    const value = document.createElement("span");
    value.className = "allocation-value";
    value.textContent = `${formatHours(hours)}h`;

    const plus = document.createElement("button");
    plus.className = "allocation-btn";
    plus.type = "button";
    plus.textContent = "+";

    minus.addEventListener("click", () => {
      changeAllocation(subject.id, -1);
    });

    plus.addEventListener("click", () => {
      changeAllocation(subject.id, 1);
    });

    controls.appendChild(minus);
    controls.appendChild(value);
    controls.appendChild(plus);

    row.appendChild(info);
    row.appendChild(controls);

    list.appendChild(row);
  }
}

function changeAllocation(subjectId, amount) {
  const current = allocations[subjectId] || 0;

  const totalOther = Object.entries(allocations)
    .filter(([id]) => id !== subjectId)
    .reduce((sum, [, hours]) => sum + hours, 0);

  const maxAllowed = TOTAL_HOURS - totalOther;

  const next = Math.max(
    0,
    Math.min(current + amount, maxAllowed)
  );

  allocations[subjectId] = next;

  savePlan();
  render();
}

async function savePlan() {
  await window.timer.setPlan(allocations);
}

function addAllocation() {
  // For now, find the first subject with no allocated time
  const subject = subjects.find(
    (subject) => (allocations[subject.id] || 0) === 0
  );

  if (!subject) return;

  allocations[subject.id] = 1;

  savePlan();
  render();
}

function formatHours(hours) {
  if (Number.isInteger(hours)) {
    return hours;
  }

  return Number(hours.toFixed(1));
}