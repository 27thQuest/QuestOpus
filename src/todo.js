'use strict';

/* ------------------------------------------------------------------ *
 * Shared task data
 * ------------------------------------------------------------------ */

let todos = [];
let subjects = [];

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

  empty.hidden = todosToRender.length > 0;

  list.replaceChildren(
    ...todosToRender.map((todo) => {
      const li = document.createElement('li');

      li.className =
        'todo-item' + (todo.done ? ' todo-item--done' : '');

      const check = document.createElement('button');

      check.className = 'todo-check';
      check.type = 'button';

      check.setAttribute(
        'aria-label',
        todo.done ? 'Mark incomplete' : 'Mark complete'
      );

      check.innerHTML = todo.done
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

      return li;
    })
  );
}

/* ------------------------------------------------------------------ *
 * Task dialog
 * ------------------------------------------------------------------ */

const taskDialog = document.getElementById('task-dialog');
const taskDialogText = document.getElementById('task-dialog-text');
const taskDialogProject = document.getElementById('task-dialog-project');
const taskDialogSave = document.getElementById('task-dialog-save');
const taskDialogCancel = document.getElementById('task-dialog-cancel');

let taskDialogTargetInput = null;

function openTaskDialog(input = null) {
  if (!taskDialog) return;

  taskDialogTargetInput = input;

  const initialText = input
    ? input.value.trim()
    : '';

  taskDialogText.value = initialText;
  taskDialogProject.value = '';

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

  const updated = await window.tasks.add(
    text,
    projectId
  );

  todos = updated;

  taskDialog.close();

  if (taskDialogTargetInput) {
    taskDialogTargetInput.value = '';
    taskDialogTargetInput.focus();
  }

  taskDialogTargetInput = null;

  render(updated);

  if (document.getElementById('panel-todo-list')) {
    renderPanel(updated);
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

  empty.hidden = todosToRender.length > 0;

  list.replaceChildren(
    ...todosToRender.map((todo) => {
      const li = document.createElement('li');

      li.className =
        'todo-item todo-item--compact' +
        (todo.done ? ' todo-item--done' : '');

      const check = document.createElement('button');

      check.className = 'todo-check';
      check.type = 'button';

      check.innerHTML = todo.done
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

      li.append(check, content);

      return li;
    })
  );
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