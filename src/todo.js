'use strict';

/* ------------------------------------------------------------------ *
 * Shared task data
 * ------------------------------------------------------------------ */

let todos = [];
let subjects = [];

/* ------------------------------------------------------------------ *
 * Date formatting helpers
 * ------------------------------------------------------------------ */

function formatDateTime(ms) {
  if (!ms) return null;

  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
function formatDeadline(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return null;
  }

  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(year, month - 1, day);

  // Validate the date.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: year !== new Date().getFullYear() ? 'numeric' : undefined
  });
}

function appendDeadlineLabel(container, todo) {
  const formatted = formatDeadline(todo.deadline);

  if (!formatted) return;

  const label = document.createElement('span');

  label.className = 'todo-deadline';
  label.textContent = `Due ${formatted}`;
  label.title = `Deadline: ${formatted}`;

  const today = new Date();

  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');

  if (!todo.completed && todo.deadline < todayKey) {
    label.classList.add('is-overdue');
  } else if (!todo.completed && todo.deadline === todayKey) {
    label.classList.add('is-due-today');
  }

  container.appendChild(label);
}

function formatDeadline(dateKey) {
  if (!dateKey) return '';

  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function deadlineStatus(todo) {
  if (!todo.deadline || todo.completed) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [year, month, day] = todo.deadline.split('-').map(Number);
  const due = new Date(year, month - 1, day);
  due.setHours(0, 0, 0, 0);

  if (due < today) return 'overdue';
  if (due.getTime() === today.getTime()) return 'due today';

  return '';
}

function appendDeadlineLabel(container, todo) {
  if (!todo.deadline) return;

  const label = document.createElement('span');
  const status = deadlineStatus(todo);

  label.className =
    'todo-deadline' +
    (status === 'overdue' ? ' todo-deadline--overdue' : '');

  label.textContent =
    `Due ${formatDeadline(todo.deadline)}` +
    (status ? ` · ${status}` : '');

  label.style.display = 'inline-block';
  label.style.fontSize = '0.72rem';
  label.style.marginTop = '0.35rem';
  label.style.marginRight = '0.5rem';
  label.style.padding = '0.15rem 0.45rem';
  label.style.border =
    '1px solid ' +
    (status === 'overdue'
      ? 'rgba(220,70,70,0.5)'
      : 'rgba(255,255,255,0.14)');
  label.style.borderRadius = '999px';
  label.style.color =
    status === 'overdue'
      ? '#ff7777'
      : status === 'due today'
        ? '#e6b86a'
        : '#999999';

  if (todo.completed) {
    label.style.opacity = '0.55';
  }

  container.appendChild(label);
}

function todoTooltip(todo) {
  const created = formatDateTime(todo.createdAt);
  const completed = formatDateTime(todo.completedAt);

  const lines = [];

  if (created) lines.push(`Created: ${created}`);
  if (todo.completed && completed) lines.push(`Completed: ${completed}`);

  return lines.join('\n');
}

/** Incomplete tasks first (manual order), completed tasks pushed to the
 *  bottom (oldest-completed-first). Order among incomplete tasks is
 *  whatever the user last dragged it to. */
function sortTodos(list) {
  const incomplete = list
    .filter(todo => !todo.completed)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const completed = list
    .filter(todo => todo.completed)
    .sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));

  return [...incomplete, ...completed];
}

/* ------------------------------------------------------------------ *
 * Streak badge (lives in the Tasks panel on index.html)
 * ------------------------------------------------------------------ */

async function refreshStreak() {
  const badge = document.getElementById('streak-badge');

  if (!badge) return; // not on this page

  let streak;

  try {
    streak = await window.timer.getStreak();
  } catch (err) {
    console.error('Failed to load streak:', err);
    return;
  }

  const count = document.getElementById('streak-count');
  const banner = document.getElementById('streak-banner');
  const bannerText = document.getElementById('streak-banner-text');

  const { current, todayDone, atRisk } = streak;

  if (count) count.textContent = current;

  badge.classList.remove('is-active', 'is-at-risk', 'is-zero');

  if (current === 0) {
    badge.classList.add('is-zero');
    badge.title = 'Complete a task to start a streak!';
  } else if (todayDone) {
    badge.classList.add('is-active');
    badge.title = `${current} day streak — nice work today!`;
  } else if (atRisk) {
    badge.classList.add('is-at-risk');
    badge.title = `${current} day streak — complete a task today to keep it alive!`;
  }

  if (banner) {
    const showBanner = current > 0 && atRisk && !todayDone;

    banner.classList.toggle('is-visible', showBanner);

    if (showBanner && bannerText) {
      bannerText.textContent =
        `Your ${current}-day streak is on the line — finish a task today to keep it going!`;
    }
  }
}

async function load() {
  try {
    const [taskData, state] = await Promise.all([
      window.tasks.getAll(),
      window.timer.getState()
    ]);

    todos = taskData || [];
    subjects = (state.subjects || []).filter(
      subject => !subject.rest && subject.id !== state.restId
    );

    return todos;
  } catch (err) {
    console.error('Failed to load tasks:', err);
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Project selector
 * ------------------------------------------------------------------ */

function populateProjectSelector() {
  const select = document.getElementById('task-dialog-project');

  if (!select) return;

  select.replaceChildren();

  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'None';
  select.appendChild(none);

  for (const subject of subjects) {
    const option = document.createElement('option');

    option.value = subject.id;
    option.textContent = subject.name;

    select.appendChild(option);
  }
}

/* ------------------------------------------------------------------ *
 * Full Todo page
 * ------------------------------------------------------------------ */

async function render(todosToRender) {
  const list = document.getElementById('todo-list');
  const empty = document.getElementById('todo-empty');

  if (!list || !empty) return;

  todosToRender = sortTodos(todosToRender);

  empty.hidden = todosToRender.length > 0;

  const firstCompletedIndex = todosToRender.findIndex(t => t.completed);

  const rows = todosToRender.map((todo, index) => {
    const li = document.createElement('li');

    li.className =
      'todo-item' + (todo.completed ? ' todo-item--done' : '');

    li.dataset.id = todo.id;
    li.draggable = !todo.completed;

    const tooltip = todoTooltip(todo);
    if (tooltip) li.title = tooltip;

    const handle = document.createElement('span');
    handle.className = 'todo-drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Drag to reorder';
    handle.style.cursor = todo.completed ? 'default' : 'grab';
    handle.style.opacity = todo.completed ? '0.25' : '0.5';
    handle.style.marginRight = '0.4rem';
    handle.style.userSelect = 'none';

    const check = document.createElement('button');

    check.className = 'todo-check';
    check.type = 'button';

    check.setAttribute(
      'aria-label',
      todo.completed ? 'Mark incomplete' : 'Mark complete'
    );

    check.innerHTML = todo.completed
      ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
             <path
               d="M2 6l3 3 5-5"
               stroke="currentColor"
               stroke-width="1.8"
               stroke-linecap="round"
               stroke-linejoin="round"
             />
           </svg>`
      : '';

    check.addEventListener('click', async () => {
      const updated = await window.tasks.toggle(todo.id);
      todos = updated;
      render(updated);
    });

    const content = document.createElement('div');
    content.className = 'todo-item__content';

    const text = document.createElement('span');

    text.className = 'todo-text';
    text.textContent = todo.text;
    text.contentEditable = true;
    text.spellcheck = true;

    text.addEventListener('blur', async () => {
      const val = text.textContent.trim();

      if (!val) {
        const updated = await window.tasks.remove(todo.id);
        todos = updated;
        render(updated);
        return;
      }

      const updated = await window.tasks.update(todo.id, val);
      todos = updated;
      render(updated);
    });

    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        text.blur();
      }
    });

    content.appendChild(text);

    /* Related project */

    if (todo.projectId) {
      const project = subjects.find(
        subject => subject.id === todo.projectId
      );

      if (project) {
        const projectLabel = document.createElement('span');

        projectLabel.className = 'todo-project';
        projectLabel.textContent = project.name;

        if (project.color) {
          projectLabel.style.color = project.color;
          projectLabel.style.borderColor = project.color + '66';
          projectLabel.style.background = project.color + '18';
        }

        content.appendChild(projectLabel);
      }
    }
    

    /* Deadline */
    appendDeadlineLabel(content, todo);
    /* Completed-on flair — this is also what feeds the streak */

    if (todo.completed && todo.completedAt) {
      const doneLabel = document.createElement('span');

      doneLabel.className = 'todo-done-date';
      doneLabel.textContent = `🔥 ${formatDateTime(todo.completedAt)}`;

      doneLabel.style.fontSize = '0.7rem';
      doneLabel.style.opacity = '0.65';
      doneLabel.style.marginLeft = '0.5rem';
      doneLabel.style.whiteSpace = 'nowrap';

      content.appendChild(doneLabel);
    }

    const del = document.createElement('button');

    del.className = 'todo-del';
    del.type = 'button';
    del.title = 'Delete';
    del.textContent = '×';

    del.addEventListener('click', async () => {
      const updated = await window.tasks.remove(todo.id);
      todos = updated;
      render(updated);
    });

    li.append(check, content, del);
    li.prepend(handle);

    return li;
  });

  // Simple visual divider between active and completed tasks.
  if (firstCompletedIndex > 0) {
    const divider = document.createElement('li');
    divider.className = 'todo-divider';
    divider.setAttribute('aria-hidden', 'true');
    divider.style.listStyle = 'none';
    divider.style.borderTop = '1px solid rgba(255,255,255,0.12)';
    divider.style.margin = '0.6rem 0';
    divider.style.padding = '0';

    rows.splice(firstCompletedIndex, 0, divider);
  }

  list.replaceChildren(...rows);

  refreshStreak();
}

/* ------------------------------------------------------------------ *
 * Drag-to-reorder (full Todo page only)
 * ------------------------------------------------------------------ */

(function setupDragReorder() {
  const list = document.getElementById('todo-list');

  if (!list) return;

  let draggingId = null;

  list.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.todo-item');

    if (!li || li.classList.contains('todo-item--done')) {
      e.preventDefault();
      return;
    }

    draggingId = li.dataset.id;
    li.classList.add('todo-item--dragging');
    li.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
  });

  list.addEventListener('dragend', (e) => {
    const li = e.target.closest('.todo-item');
    if (li) {
      li.classList.remove('todo-item--dragging');
      li.style.opacity = '';
    }
    draggingId = null;
  });

  list.addEventListener('dragover', (e) => {
    if (!draggingId) return;

    e.preventDefault();

    const overLi = e.target.closest('.todo-item');

    // Never drop into the completed section.
    if (!overLi || overLi.classList.contains('todo-item--done')) return;
    if (overLi.dataset.id === draggingId) return;

    const draggingEl = list.querySelector(
      `.todo-item[data-id="${draggingId}"]`
    );

    if (!draggingEl) return;

    const rect = overLi.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;

    overLi.parentNode.insertBefore(
      draggingEl,
      before ? overLi : overLi.nextSibling
    );
  });

  list.addEventListener('drop', async (e) => {
    e.preventDefault();

    if (!draggingId) return;

    const orderedIds = [...list.querySelectorAll('.todo-item:not(.todo-item--done)')]
      .map(li => li.dataset.id);

    draggingId = null;

    try {
      const updated = await window.tasks.reorder(orderedIds);
      todos = updated;
      render(todos);
    } catch (err) {
      console.error('Failed to save task order:', err);
    }
  });
}());

/* ------------------------------------------------------------------ *
 * Task dialog
 * ------------------------------------------------------------------ */

const taskDialog = document.getElementById('task-dialog');
const taskDialogText = document.getElementById('task-dialog-text');
const taskDialogProject = document.getElementById('task-dialog-project');
const taskDialogSave = document.getElementById('task-dialog-save');
const taskDialogCancel = document.getElementById('task-dialog-cancel');

/* =========================================================
   CUSTOM DEADLINE CALENDAR
   ========================================================= */

const taskDialogDeadline =
  document.getElementById('task-dialog-deadline');

const deadlineCalendar =
  document.getElementById('deadline-calendar');

const deadlinePicker =
  document.getElementById('deadline-picker');

let deadlineCalendarMonth = new Date();
deadlineCalendarMonth.setDate(1);

function deadlineISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function deadlineParseISO(value) {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );

  return deadlineISO(date) === value ? date : null;
}

function deadlineDisplayDate(value) {
  const date = deadlineParseISO(value);
  if (!date) return '';

  return [
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    date.getFullYear()
  ].join('/');
}

function openDeadlineCalendar() {
  if (!deadlineCalendar || !taskDialogDeadline) return;

  const selectedDate = deadlineParseISO(
    taskDialogDeadline.dataset.isoDate
  );

  const startingDate = selectedDate || new Date();

  deadlineCalendarMonth = new Date(
    startingDate.getFullYear(),
    startingDate.getMonth(),
    1
  );

  renderDeadlineCalendar();

  deadlineCalendar.hidden = false;
  taskDialogDeadline.setAttribute('aria-expanded', 'true');
}

function closeDeadlineCalendar() {
  if (!deadlineCalendar || !taskDialogDeadline) return;

  deadlineCalendar.hidden = true;
  taskDialogDeadline.setAttribute('aria-expanded', 'false');
}

function renderDeadlineCalendar() {
  if (!deadlineCalendar) return;

  deadlineCalendar.replaceChildren();

  const year = deadlineCalendarMonth.getFullYear();
  const month = deadlineCalendarMonth.getMonth();

  const selectedISO =
    taskDialogDeadline?.dataset.isoDate || '';

  const todayISO = deadlineISO(new Date());

  // Header
  const header = document.createElement('div');
  header.className = 'deadline-calendar__header';

  const monthLabel = document.createElement('div');
  monthLabel.className = 'deadline-calendar__month';
  monthLabel.textContent = deadlineCalendarMonth.toLocaleDateString(
    undefined,
    { month: 'long', year: 'numeric' }
  );

  const nav = document.createElement('div');
  nav.className = 'deadline-calendar__nav';

  const previousButton = document.createElement('button');
  previousButton.type = 'button';
  previousButton.textContent = '‹';
  previousButton.setAttribute('aria-label', 'Previous month');

  previousButton.addEventListener('click', () => {
    deadlineCalendarMonth.setMonth(
      deadlineCalendarMonth.getMonth() - 1
    );
    renderDeadlineCalendar();
  });

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.textContent = '›';
  nextButton.setAttribute('aria-label', 'Next month');

  nextButton.addEventListener('click', () => {
    deadlineCalendarMonth.setMonth(
      deadlineCalendarMonth.getMonth() + 1
    );
    renderDeadlineCalendar();
  });

  nav.append(previousButton, nextButton);
  header.append(monthLabel, nav);

  // Weekday headings, Monday first
  const weekdays = document.createElement('div');
  weekdays.className = 'deadline-calendar__weekdays';

  for (const label of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
    const weekday = document.createElement('div');
    weekday.className = 'deadline-calendar__weekday';
    weekday.textContent = label;
    weekdays.appendChild(weekday);
  }

  // Date grid
  const daysGrid = document.createElement('div');
  daysGrid.className = 'deadline-calendar__days';

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Convert Sunday=0 to Monday-first offset.
  const offset = (firstDay.getDay() + 6) % 7;

  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('div');
    empty.className = 'deadline-calendar__empty';
    daysGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const iso = deadlineISO(date);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'deadline-calendar__day';
    button.textContent = String(day);
    button.setAttribute('aria-label', date.toLocaleDateString());

    if (iso === todayISO) {
      button.classList.add('is-today');
    }

    if (iso === selectedISO) {
      button.classList.add('is-selected');
      button.setAttribute('aria-pressed', 'true');
    }

    button.addEventListener('click', () => {
      if (!taskDialogDeadline) return;

      // Store the ISO date for the task database.
      taskDialogDeadline.dataset.isoDate = iso;

      // Show the familiar MM/DD/YYYY format in the field.
      taskDialogDeadline.value = deadlineDisplayDate(iso);

      closeDeadlineCalendar();
    });

    daysGrid.appendChild(button);
  }

  // Footer
  const footer = document.createElement('div');
  footer.className = 'deadline-calendar__footer';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'Clear date';

  clearButton.addEventListener('click', () => {
    if (taskDialogDeadline) {
      taskDialogDeadline.value = '';
      delete taskDialogDeadline.dataset.isoDate;
    }

    closeDeadlineCalendar();
  });

  const todayButton = document.createElement('button');
  todayButton.type = 'button';
  todayButton.className = 'is-primary';
  todayButton.textContent = 'Today';

  todayButton.addEventListener('click', () => {
    const iso = deadlineISO(new Date());

    if (taskDialogDeadline) {
      taskDialogDeadline.dataset.isoDate = iso;
      taskDialogDeadline.value = deadlineDisplayDate(iso);
    }

    closeDeadlineCalendar();
  });

  footer.append(clearButton, todayButton);

  deadlineCalendar.append(
    header,
    weekdays,
    daysGrid,
    footer
  );
}

// Clicking the date field opens our custom popup.
if (taskDialogDeadline) {
  taskDialogDeadline.addEventListener('click', () => {
    if (deadlineCalendar?.hidden) {
      openDeadlineCalendar();
    } else {
      closeDeadlineCalendar();
    }
  });
}

// Clicking outside the calendar closes it.
document.addEventListener('pointerdown', (event) => {
  if (
    deadlineCalendar &&
    !deadlineCalendar.hidden &&
    deadlinePicker &&
    !deadlinePicker.contains(event.target)
  ) {
    closeDeadlineCalendar();
  }
});

// Escape closes the calendar without closing the task dialog.
if (deadlineCalendar) {
  deadlineCalendar.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeDeadlineCalendar();
      taskDialogDeadline?.focus();
    }
  });
}

// Keep the date field's placeholder grey until a date is selected.
function updateDeadlineAppearance() {
  if (!taskDialogDeadline) return;

  taskDialogDeadline.classList.toggle(
    'has-value',
    Boolean(taskDialogDeadline.value)
  );
}

if (taskDialogDeadline) {
  taskDialogDeadline.addEventListener(
    'input',
    updateDeadlineAppearance
  );

  taskDialogDeadline.addEventListener(
    'change',
    updateDeadlineAppearance
  );

  // Open the native calendar picker when the field is clicked.
  taskDialogDeadline.addEventListener('click', () => {
    if (typeof taskDialogDeadline.showPicker === 'function') {
      try {
        taskDialogDeadline.showPicker();
      } catch (error) {
        // The browser can open the picker normally instead.
      }
    }
  });

  updateDeadlineAppearance();
}

let taskDialogTargetInput = null;

function openTaskDialog(input = null) {
  if (!taskDialog) return;

  taskDialogTargetInput = input;

  const initialText = input
    ? input.value.trim()
    : '';

  taskDialogText.value = initialText;
  taskDialogProject.value = '';

  if (taskDialogDeadline) {
    taskDialogDeadline.value = '';
    delete taskDialogDeadline.dataset.isoDate;
  }

  closeDeadlineCalendar();
  if (taskDialogDeadline) {
    taskDialogDeadline.value = '';
    updateDeadlineAppearance();
  }

  taskDialog.showModal();

  setTimeout(() => {
    taskDialogText.focus();
  }, 0);
}

async function saveTaskDialog() {
  const text = taskDialogText.value.trim();

  if (!text) {
    taskDialogText.focus();
    return;
  }

  const projectId = taskDialogProject.value || null;
  const deadline = taskDialogDeadline?.dataset.isoDate || null;

  try {
    // Save the task, including its optional deadline.
    await window.tasks.add(text, projectId, deadline);

    // IMPORTANT:
    // Fetch the actual current task list from the main process.
    todos = await window.tasks.getAll();

    // Make absolutely sure we have an array.
    if (!Array.isArray(todos)) {
      todos = [];
    }

    taskDialog.close();

    // Clear the original input
    if (taskDialogTargetInput) {
      taskDialogTargetInput.value = '';
    }

    taskDialogTargetInput = null;

    // Full Todo page
    const fullList = document.getElementById('todo-list');

    if (fullList) {
      render(todos);
    }

    // Timer / Index task panel
    const panelList =
      document.getElementById('panel-todo-list');

    if (panelList) {
      renderPanel(todos);
    }

  } catch (error) {
    console.error(
      '[Quest Opus] Failed to add task:',
      error
    );
  }
}

if (taskDialogSave) {
  taskDialogSave.addEventListener(
    'click',
    saveTaskDialog
  );
}

if (taskDialogCancel) {
  taskDialogCancel.addEventListener(
    'click',
    () => taskDialog.close()
  );
}

if (taskDialogText) {
  taskDialogText.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveTaskDialog();
      }

      if (e.key === 'Escape') {
        taskDialog.close();
      }
    }
  );
}

/* ------------------------------------------------------------------ *
 * Full page Add
 * ------------------------------------------------------------------ */

const mainAddBtn =
  document.getElementById('todo-add-btn');

const mainInput =
  document.getElementById('todo-input');

if (mainAddBtn && mainInput) {
  mainAddBtn.addEventListener(
    'click',
    () => openTaskDialog(mainInput)
  );

  mainInput.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        openTaskDialog(mainInput);
      }
    }
  );

  load().then(() => {
    populateProjectSelector();
    render(todos);
  });
}

/* ------------------------------------------------------------------ *
 * Compact panel used on the timer page
 * ------------------------------------------------------------------ */

async function renderPanel(todosToRender) {
  const list =
    document.getElementById('panel-todo-list');

  const empty =
    document.getElementById('panel-todo-empty');

  if (!list) return;

  // Completed tasks are cleared from the compact panel — they're
  // still on the full Todo page, just not cluttering the quick view.
  todosToRender = sortTodos(todosToRender).filter(
    todo => !todo.completed
  );

  empty.hidden = todosToRender.length > 0;

  list.replaceChildren(
    ...todosToRender.map((todo) => {
      const li = document.createElement('li');

      li.className =
        'todo-item todo-item--compact' +
        (todo.completed ? ' todo-item--done' : '');

      const compactTooltip = todoTooltip(todo);
      if (compactTooltip) li.title = compactTooltip;

      const check = document.createElement('button');

      check.className = 'todo-check';
      check.type = 'button';

      check.innerHTML = todo.completed
        ? `<svg width="10" height="10" viewBox="0 0 12 12" fill="none">
             <path
               d="M2 6l3 3 5-5"
               stroke="currentColor"
               stroke-width="1.8"
               stroke-linecap="round"
               stroke-linejoin="round"
             />
           </svg>`
        : '';

      check.addEventListener('click', async () => {
        const updated =
          await window.tasks.toggle(todo.id);

        todos = updated;
        renderPanel(updated);
      });

      const content =
        document.createElement('div');

      content.className =
        'todo-item__content';

      const text =
        document.createElement('span');

      text.className = 'todo-text';
      text.textContent = todo.text;

      content.appendChild(text);

      if (todo.projectId) {
        const project = subjects.find(
          subject => subject.id === todo.projectId
        );

        if (project) {
          const projectLabel =
            document.createElement('span');

          projectLabel.className =
            'todo-project';

          projectLabel.textContent =
            project.name;

          if (project.color) {
            projectLabel.style.color =
              project.color;

            projectLabel.style.borderColor =
              project.color + '66';

            projectLabel.style.background =
              project.color + '18';
          }

          content.appendChild(projectLabel);
        }
      }

      appendDeadlineLabel(content, todo);
      li.append(check, content);

      return li;
    })
  );

  refreshStreak();
}

async function initPanel() {
  const input = document.getElementById('panel-todo-input');
  const addBtn = document.getElementById('panel-todo-add-btn');

  if (!input || !addBtn) return;

  async function handlePanelAdd() {
    const text = input.value.trim();

    if (!text) {
      input.focus();
      return;
    }

    openTaskDialog(input);
  }

  await load();

  populateProjectSelector();
  renderPanel(todos);

  addBtn.addEventListener('click', handlePanelAdd);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlePanelAdd();
    }
  });
}

if (document.getElementById('panel-todo-list')) {
  initPanel();
}

/* Keep the streak badge fresh even when no task action has happened
 * recently (e.g. the day rolls over while the app is idle). */
setInterval(() => {
  if (document.getElementById('streak-badge')) {
    refreshStreak();
  }
}, 30000);