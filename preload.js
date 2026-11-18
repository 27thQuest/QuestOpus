'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timer', {

  // -------------------------------
  // Timer
  // -------------------------------

  getState: () =>
    ipcRenderer.invoke('state:get'),

  start: (subjectId) =>
    ipcRenderer.invoke('timer:start', subjectId),

  pause: () =>
    ipcRenderer.invoke('timer:pause'),

  stop: () =>
    ipcRenderer.invoke('timer:stop'),

  rest: () =>
    ipcRenderer.invoke('timer:rest'),


  // -------------------------------
  // Subjects
  // -------------------------------

  addSubject: (name) =>
    ipcRenderer.invoke('subjects:add', name),

  removeSubject: (subjectId) =>
    ipcRenderer.invoke('subjects:remove', subjectId),

  renameSubject: (subjectId, name, color) =>
    ipcRenderer.invoke(
      'subjects:rename',
      subjectId,
      name,
      color
    ),


  // -------------------------------
  // Analytics
  // -------------------------------

  weekly: () =>
    ipcRenderer.invoke('analytics:weekly'),


  // -------------------------------
  // Weekly Plan
  // -------------------------------

  getPlan: () =>
    ipcRenderer.invoke('plan:get'),

  setPlan: (plan) =>
    ipcRenderer.invoke('plan:set', plan),


  // -------------------------------
  // Data
  // -------------------------------

  dataPath: () =>
    ipcRenderer.invoke('data:path'),


  // -------------------------------
  // Streak
  // -------------------------------

  getStreak: () =>
    ipcRenderer.invoke('streak:get'),


  // -------------------------------
  // Events
  // -------------------------------

  onState: (cb) => {

    const handler = (_event, state) =>
      cb(state);

    ipcRenderer.on('state', handler);

    return () =>
      ipcRenderer.removeListener('state', handler);
  },

  onNotice: (cb) => {

    const handler = (_event, message) =>
      cb(message);

    ipcRenderer.on('notice', handler);

    return () =>
      ipcRenderer.removeListener('notice', handler);
  },

});


contextBridge.exposeInMainWorld('tasks', {

  getAll: () =>
    ipcRenderer.invoke('tasks:get'),

add: (text, projectId = null, deadline = null) =>
  ipcRenderer.invoke(
    'tasks:add',
    text,
    projectId,
    deadline
  ),

  toggle: (taskId) =>
    ipcRenderer.invoke(
      'tasks:toggle',
      taskId
    ),

  update: (taskId, text) =>
    ipcRenderer.invoke(
      'tasks:update',
      taskId,
      text
    ),

  remove: (taskId) =>
    ipcRenderer.invoke(
      'tasks:remove',
      taskId
    ),

  reorder: (orderedIds) =>
    ipcRenderer.invoke(
      'tasks:reorder',
      orderedIds
    ),



});

// -------------------------------
// Diary
// -------------------------------

contextBridge.exposeInMainWorld('diary', {

  get: (dateKey) =>
    ipcRenderer.invoke(
      'diary:get',
      dateKey
    ),

  set: (dateKey, text) =>
    ipcRenderer.invoke(
      'diary:set',
      dateKey,
      text
    ),

});