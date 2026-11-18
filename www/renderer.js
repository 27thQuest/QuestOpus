'use strict';

// ------------------------------------------------------------
// ADD BUTTON
// ------------------------------------------------------------
// Keep this completely independent from the rest of the app.
// The button should open the dialog as soon as it is clicked.
document.getElementById('btn-add').addEventListener('click', () => {
  document.getElementById('add-dialog').showModal();
});

// Safety guard: renderer.js must never run before db.js sets up window.timer.
if (!window.timer) {
  console.error('window.timer is not defined — db.js must load before renderer.js');
  throw new Error('db.js not loaded');
}

const el = {
  clockTime: document.getElementById('clock-time'),
  clockSubject: document.getElementById('clock-subject'),
  primary: document.getElementById('btn-primary'),
  stop: document.getElementById('btn-stop'),
  add: document.getElementById('btn-add'),
  grid: document.getElementById('subject-grid'),
  empty: document.getElementById('empty'),
  toast: document.getElementById('toast'),
  dialog: document.getElementById('add-dialog'),
  dialogInput: document.getElementById('subject-name'),
  dialogError: document.getElementById('dialog-error'),
  dialogSave: document.getElementById('dialog-save'),
  dialogCancel: document.getElementById('dialog-cancel'),
  renameDialog: document.getElementById('rename-dialog'),
  renameInput: document.getElementById('rename-input'),
  renameError: document.getElementById('rename-error'),
  renameSave: document.getElementById('rename-save'),
  renameCancel: document.getElementById('rename-cancel'),
  colorSwatches: document.getElementById('color-swatches'),
};

let state = {
  subjects: [],
  todayTotals: {},
  active: null,
  restId: '__rest__'
};

let selectedId = null;
let clockDrift = 0;
let toastTimer = null;

const pad = (n) => String(n).padStart(2, '0');

function formatHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

const now = () => Date.now() + clockDrift;

function liveMs() {
  const a = state.active;
  return a && a.running && a.startedAt ? now() - a.startedAt : 0;
}

/* ------------------------------- rendering ------------------------------- */

function renderStructure() {
  const activeId = state.active ? state.active.subjectId : null;

  if (!state.subjects.some((s) => s.id === selectedId)) {
    selectedId = activeId || (state.subjects[0] ? state.subjects[0].id : null);
  }

  el.empty.hidden = state.subjects.length > 0;

  el.grid.replaceChildren(
    ...state.subjects.map((subject) => {
      const card = document.createElement('button');
      const isRest = subject.id === state.restId;

      card.className = 'card' + (isRest ? ' card--rest' : '');
      card.dataset.id = subject.id;
      card.type = 'button';

      if (subject.id === activeId) {
        card.classList.add('is-active');
      } else {
        const color = subject.color || null;

        if (color) {
          card.style.background = color + '22';
          card.style.borderColor = color;
        }

        if (subject.id === selectedId) {
          card.style.borderColor = color || '#3a3a3a';
        }
      }

      const name = document.createElement('span');
      name.className = 'card__name';
      name.textContent = subject.name;

      const time = document.createElement('span');
      time.className = 'card__time';
      time.dataset.time = subject.id;
      time.textContent = '00:00:00';

      card.append(name, time);

      if (!isRest) {
        const remove = document.createElement('span');
        remove.className = 'card__remove';
        remove.dataset.remove = subject.id;
        remove.title = `Remove ${subject.name}`;
        remove.textContent = '×';
        card.append(remove);
      }

      return card;
    })
  );

  renderControls();
  tick();
}

function renderControls() {
  const a = state.active;

  const subjectName = (idValue) => {
    const s = state.subjects.find((x) => x.id === idValue);
    return s ? s.name : '';
  };

  const isRestActive = a && a.subjectId === state.restId;

  if (isRestActive) {
    el.primary.textContent = 'Pause';
    el.primary.style.visibility = 'hidden';
    el.clockSubject.textContent = subjectName(a.subjectId);
    el.clockSubject.classList.add('is-live');
    el.clockTime.className = 'clock__time is-running';

  } else if (a && a.running) {
    el.primary.style.visibility = 'visible';
    el.primary.textContent = 'Pause';
    el.clockSubject.textContent = subjectName(a.subjectId);
    el.clockSubject.classList.add('is-live');
    el.clockTime.className = 'clock__time is-running';

  } else if (a) {
    el.primary.style.visibility = 'visible';
    el.primary.textContent = 'Resume';
    el.clockSubject.textContent = `${subjectName(a.subjectId)} — paused`;
    el.clockSubject.classList.add('is-live');
    el.clockTime.className = 'clock__time is-paused';

  } else {
    el.primary.style.visibility = 'visible';
    el.primary.textContent = 'Start';
    el.clockSubject.textContent = selectedId
      ? subjectName(selectedId)
      : 'Pick a subject to begin';

    el.clockSubject.classList.toggle('is-live', !!selectedId);
    el.clockTime.className = 'clock__time';
  }

  el.primary.disabled = !a && !selectedId;
  el.stop.textContent = isRestActive ? 'Stop' : 'Rest';
  el.stop.disabled = !a || isRestActive;
}

function tick() {
  const live = liveMs();
  const a = state.active;

  el.clockTime.textContent = formatHMS(a ? a.committedMs + live : 0);

  for (const node of el.grid.querySelectorAll('[data-time]')) {
    const subjectId = node.dataset.time;
    const base = state.todayTotals[subjectId] || 0;
    const extra = a && a.subjectId === subjectId ? live : 0;

    node.textContent = formatHMS(base + extra);
  }
}

function apply(next) {
  state = next;
  clockDrift = next.serverNow ? next.serverNow - Date.now() : 0;
  renderStructure();
}

/* ------------------------------- rename ------------------------------- */

const COLORS = [
  { label: 'Crimson', value: '#822433' },
  { label: 'Rose', value: '#a0334a' },
  { label: 'Amber', value: '#b45309' },
  { label: 'Emerald', value: '#166534' },
  { label: 'Teal', value: '#0f766e' },
  { label: 'Blue', value: '#1d4ed8' },
  { label: 'Indigo', value: '#4338ca' },
  { label: 'Purple', value: '#7e22ce' },
  { label: 'Slate', value: '#475569' },
  { label: 'Default', value: '' },
];

let renamingId = null;
let pendingColor = '';

function buildSwatches(currentColor) {
  pendingColor = currentColor || '';

  el.colorSwatches.replaceChildren(
    ...COLORS.map(({ label, value }) => {
      const btn = document.createElement('button');

      btn.type = 'button';
      btn.className = 'swatch' + (value === pendingColor ? ' is-selected' : '');
      btn.title = label;
      btn.style.background = value || '#2a2a2a';

      if (!value) {
        btn.style.border = '2px dashed #555';
        btn.style.background = '#1e1e1e';
      }

      btn.addEventListener('click', () => {
        pendingColor = value;

        el.colorSwatches
          .querySelectorAll('.swatch')
          .forEach(s => s.classList.remove('is-selected'));

        btn.classList.add('is-selected');
      });

      return btn;
    })
  );
}

function openRenameDialog(subjectId) {
  const subject = state.subjects.find((s) => s.id === subjectId);
  if (!subject) return;

  renamingId = subjectId;
  el.renameInput.value = subject.name;
  el.renameError.hidden = true;

  buildSwatches(subject.color || '');

  el.renameDialog.showModal();
  el.renameInput.select();
}

async function saveRename() {
  const name = el.renameInput.value.trim();

  if (!name) {
    el.renameError.hidden = false;
    return;
  }

  const before = state.subjects.find((s) => s.id === renamingId)?.name;

  const next = await window.timer.renameSubject(
    renamingId,
    name,
    pendingColor
  );

  const after = next.subjects.find((s) => s.id === renamingId)?.name;

  if (
    after === before &&
    name.toLowerCase() !== before.toLowerCase()
  ) {
    el.renameError.hidden = false;
    return;
  }

  apply(next);
  el.renameDialog.close();
}

el.renameSave.addEventListener('click', saveRename);

el.renameCancel.addEventListener('click', () => {
  el.renameDialog.close();
});

el.renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveRename();
  if (e.key === 'Escape') el.renameDialog.close();
});


/* ------------------------------- card interactions ------------------------------- */

el.grid.addEventListener('contextmenu', (event) => {
  const card = event.target.closest('.card');

  if (!card) return;

  event.preventDefault();
  openRenameDialog(card.dataset.id);
});

let _pressTimer = null;
let _pressMoved = false;

el.grid.addEventListener('touchstart', (event) => {
  const card = event.target.closest('.card');

  if (!card) return;

  _pressMoved = false;

  _pressTimer = setTimeout(() => {
    if (_pressMoved) return;

    if (navigator.vibrate) {
      navigator.vibrate(40);
    }

    openRenameDialog(card.dataset.id);
  }, 500);
}, { passive: true });

el.grid.addEventListener('touchmove', () => {
  _pressMoved = true;
  clearTimeout(_pressTimer);
}, { passive: true });

el.grid.addEventListener('touchend', () => {
  clearTimeout(_pressTimer);
});

el.grid.addEventListener('touchcancel', () => {
  clearTimeout(_pressTimer);
});

/* ------------------------------- subject cards ------------------------------- */

el.grid.addEventListener('click', async (event) => {
  const removeBtn = event.target.closest('[data-remove]');

  if (removeBtn) {
    event.stopPropagation();

    apply(
      await window.timer.removeSubject(removeBtn.dataset.remove)
    );

    return;
  }

  const card = event.target.closest('.card');

  if (!card) return;

  const subjectId = card.dataset.id;

  selectedId = subjectId;

  if (state.active) {
    apply(await window.timer.start(subjectId));
  } else {
    renderStructure();
  }
});

/* ------------------------------- timer controls ------------------------------- */

el.primary.addEventListener('click', async () => {
  if (state.active && state.active.running) {
    apply(await window.timer.pause());
  } else if (state.active) {
    apply(await window.timer.start(state.active.subjectId));
  } else if (selectedId) {
    apply(await window.timer.start(selectedId));
  }
});

el.stop.addEventListener('click', async () => {
  apply(await window.timer.rest());
});

/* ------------------------------- add subject ------------------------------- */

async function saveSubject() {
  const name = el.dialogInput.value.trim();

  if (!name) {
    el.dialogError.hidden = false;
    return;
  }

  const before = state.subjects.length;

  const next = await window.timer.addSubject(name);

  if (next.subjects.length === before) {
    el.dialogError.hidden = false;
    return;
  }

  selectedId = next.subjects[next.subjects.length - 1].id;

  apply(next);

  el.dialog.close();
}

el.dialogSave.addEventListener('click', saveSubject);

el.dialogCancel.addEventListener('click', () => {
  el.dialog.close();
});

el.dialogInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    saveSubject();
  }
});

/* ------------------------------- keyboard ------------------------------- */

document.addEventListener('keydown', (e) => {
  if (
    e.code === 'Space' &&
    !el.dialog.open &&
    e.target === document.body
  ) {
    e.preventDefault();
    el.primary.click();
  }
});

/* ------------------------------- wiring ------------------------------- */

function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 6000);
}

window.timer.onState(apply);
window.timer.onNotice(showToast);
window.timer.getState().then(apply);

setInterval(tick, 250);

setInterval(async () => {
  const next = await window.timer.getState();
  state = next;
}, 1000);

/* ------------------------------- midnight ------------------------------- */

let currentDay = new Date().getDate();

setInterval(async () => {
  const day = new Date().getDate();

  if (day !== currentDay) {
    currentDay = day;
    apply(await window.timer.getState());
  }
}, 30000);

/* ------------------------------- menu  ------------------------------- */
const menuButton = document.querySelector('.menu-btn');

if (menuButton) {
  menuButton.addEventListener('click', () => {
    window.location.href = 'settings.html';
  });
}