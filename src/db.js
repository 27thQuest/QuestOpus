'use strict';

(() => {

  /* ------------------------------------------------------------------ *
   * db.js — localStorage-backed data layer for the mobile/web build.
   * Mirrors the shape of the Electron main-process db exactly so the
   * UI files can stay almost identical.
   * ------------------------------------------------------------------ */

  const DB_KEY = 'quest-opus-db';
  const REST_ID = '__rest__';

  function id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function startOfWeek(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return d.getTime();
  }

  /* ---------- persistence ---------- */

  function defaultDb() {
    return {
      version: 1,
      subjects: [
        { id: REST_ID, name: 'Rest', rest: true },
        { id: id(), name: 'Calculus II' },
        { id: id(), name: 'Physics II' },
      ],
      entries: [],
      tasks: [],
      active: null,
      weeklyPlan: {},
    };
  }

  function loadDb() {
    try {
      const raw = localStorage.getItem(DB_KEY);

      if (!raw) return defaultDb();

      const parsed = JSON.parse(raw);

      const db = {
        version: 1,
        subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        active: parsed.active || null,
        weeklyPlan:
          parsed.weeklyPlan && typeof parsed.weeklyPlan === 'object'
            ? parsed.weeklyPlan
            : {},
      };

      // Ensure Rest always exists and is first
      if (!db.subjects.find(s => s.id === REST_ID)) {
        db.subjects.unshift({
          id: REST_ID,
          name: 'Rest',
          rest: true
        });
      } else {
        const idx = db.subjects.findIndex(s => s.id === REST_ID);

        if (idx !== 0) {
          const [rest] = db.subjects.splice(idx, 1);
          db.subjects.unshift(rest);
        }
      }

      return db;

    } catch {
      return defaultDb();
    }
  }

  function saveDb(db) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch { }
  }

  /* ---------- timer core ---------- */

  function commitSegment(db, endTs, reason) {
    if (!db.active || !db.active.running || !db.active.startedAt) {
      return false;
    }

    const start = db.active.startedAt;
    const end = Math.max(endTs, start);
    const ms = end - start;

    db.active.startedAt = null;
    db.active.running = false;

    if (ms < 1000) return false;

    db.entries.push({
      id: id(),
      sessionId: db.active.sessionId,
      subjectId: db.active.subjectId,
      start,
      end,
      ms,
      day: dayKey(start),
      reason,
    });

    return true;
  }

  function startRest(db) {
    const rest = db.subjects.find(s => s.id === REST_ID);

    if (!rest) return;

    const now = Date.now();

    db.active = {
      sessionId: id(),
      subjectId: REST_ID,
      running: true,
      startedAt: now,
      lastHeartbeat: now,
    };
  }

  /* ---------- public API (mirrors Electron IPC handlers) ---------- */

  window.timerDB = {

    getPlan() {
      const db = loadDb();
      return { ...db.weeklyPlan };
    },

    setPlan(plan) {
      const db = loadDb();

      if (!plan || typeof plan !== 'object') {
        return { ...db.weeklyPlan };
      }

      db.weeklyPlan = {};

      for (const [subjectId, hours] of Object.entries(plan)) {
        const value = Number(hours);

        if (!Number.isFinite(value)) continue;
        if (value <= 0) continue;

        db.weeklyPlan[subjectId] = Math.min(168, value);
      }

      saveDb(db);

      return { ...db.weeklyPlan };
    },

    getState() {
      const db = loadDb();
      return buildSnapshot(db);
    },

    start(subjectId) {
      const db = loadDb();

      const subject = db.subjects.find(s => s.id === subjectId);

      if (!subject) {
        return buildSnapshot(db);
      }

      if (db.active && db.active.subjectId !== subjectId) {
        commitSegment(db, Date.now(), 'switched');
        db.active = null;
      }

      const now = Date.now();

      if (!db.active) {
        db.active = {
          sessionId: id(),
          subjectId,
          running: true,
          startedAt: now,
          lastHeartbeat: now
        };
      } else {
        db.active.running = true;
        db.active.startedAt = now;
        db.active.lastHeartbeat = now;
      }

      saveDb(db);

      return buildSnapshot(db);
    },

    pause() {
      const db = loadDb();

      if (!db.active) {
        return buildSnapshot(db);
      }

      const wasRest = db.active.subjectId === REST_ID;

      commitSegment(db, Date.now(), 'pause');

      db.active = null;

      if (!wasRest) {
        startRest(db);
      }

      saveDb(db);

      return buildSnapshot(db);
    },

    stop() {
      const db = loadDb();

      if (!db.active) {
        return buildSnapshot(db);
      }

      commitSegment(db, Date.now(), 'stop');

      db.active = null;

      startRest(db);

      saveDb(db);

      return buildSnapshot(db);
    },

    rest() {
      const db = loadDb();

      commitSegment(db, Date.now(), 'rest');

      db.active = null;

      startRest(db);

      saveDb(db);

      return buildSnapshot(db);
    },

    addSubject(name) {
      const clean = String(name || '').trim().slice(0, 60);

      const db = loadDb();

      if (!clean) {
        return buildSnapshot(db);
      }

      if (
        db.subjects.some(
          s => s.name.toLowerCase() === clean.toLowerCase()
        )
      ) {
        return buildSnapshot(db);
      }

      db.subjects.push({
        id: id(),
        name: clean
      });

      saveDb(db);

      return buildSnapshot(db);
    },

    renameSubject(subjectId, name, color) {
      const clean = String(name || '').trim().slice(0, 60);

      const db = loadDb();

      if (!clean) {
        return buildSnapshot(db);
      }

      if (
        db.subjects.some(
          s =>
            s.name.toLowerCase() === clean.toLowerCase() &&
            s.id !== subjectId
        )
      ) {
        return buildSnapshot(db);
      }

      const subject = db.subjects.find(s => s.id === subjectId);

      if (!subject) {
        return buildSnapshot(db);
      }

      subject.name = clean;

      subject.color =
        typeof color === 'string'
          ? color.slice(0, 20)
          : '';

      saveDb(db);

      return buildSnapshot(db);
    },

    removeSubject(subjectId) {
      const db = loadDb();

      if (subjectId === REST_ID) {
        return buildSnapshot(db);
      }

      if (db.active && db.active.subjectId === subjectId) {
        commitSegment(db, Date.now(), 'subject-removed');
        db.active = null;
        startRest(db);
      }

      for (const task of db.tasks) {
        if (task.projectId === subjectId) {
          task.projectId = null;
        }
      }

      db.subjects = db.subjects.filter(
        s => s.id !== subjectId
      );

      saveDb(db);

      return buildSnapshot(db);
    },

    weekly() {
      const db = loadDb();

      const thisWeekStart = startOfWeek(Date.now());

      const lastWeekStart =
        startOfWeek(
          thisWeekStart - 24 * 3600 * 1000
        );

      const totals = new Map(
        db.subjects.map(
          s => [
            s.id,
            {
              thisWeek: 0,
              lastWeek: 0
            }
          ]
        )
      );

      for (const e of db.entries) {
        const bucket = totals.get(e.subjectId);

        if (!bucket) continue;

        if (e.start >= thisWeekStart) {
          bucket.thisWeek += e.ms;
        } else if (e.start >= lastWeekStart) {
          bucket.lastWeek += e.ms;
        }
      }

      return {
        weekStart: thisWeekStart,

        labels: db.subjects.map(
          s => s.name
        ),

        colors: db.subjects.map(
          s => s.color || null
        ),

        thisWeek: db.subjects.map(
          s =>
            +(
              totals.get(s.id).thisWeek /
              3600000
            ).toFixed(2)
        ),

        lastWeek: db.subjects.map(
          s =>
            +(
              totals.get(s.id).lastWeek /
              3600000
            ).toFixed(2)
        ),
      };
    },

    /* tasks */

    getTasks() {
      return loadDb().tasks;
    },

    addTask(text, projectId = null) {
      const db = loadDb();

      const cleanText = String(text || '').trim().slice(0, 200);

      if (!cleanText) {
        return db.tasks;
      }

      let relatedProjectId = null;

      if (projectId) {
        const project = db.subjects.find(
          (subject) =>
            subject.id === projectId &&
            subject.id !== REST_ID
        );

        if (project) {
          relatedProjectId = project.id;
        }
      }

      db.tasks.push({
        id: id(),
        text: cleanText,
        done: false,
        projectId: relatedProjectId
      });

      saveDb(db);

      return db.tasks;
    },

    toggleTask(taskId) {
      const db = loadDb();

      const t = db.tasks.find(
        t => t.id === taskId
      );

      if (t) {
        t.done = !t.done;
      }

      saveDb(db);

      return db.tasks;
    },

    updateTask(taskId, text) {
      const db = loadDb();

      const t = db.tasks.find(
        t => t.id === taskId
      );

      if (t) {
        t.text = String(text)
          .trim()
          .slice(0, 200);
      }

      saveDb(db);

      return db.tasks;
    },

    removeTask(taskId) {
      const db = loadDb();

      db.tasks = db.tasks.filter(
        t => t.id !== taskId
      );

      saveDb(db);

      return db.tasks;
    },
  };

  /* ---------- snapshot ---------- */

  function buildSnapshot(db) {
    const today = dayKey(Date.now());

    const todayTotals = {};

    let sessionCommitted = 0;

    for (const e of db.entries) {

      if (e.day === today) {
        todayTotals[e.subjectId] =
          (todayTotals[e.subjectId] || 0) +
          e.ms;
      }

      if (
        db.active &&
        e.sessionId === db.active.sessionId
      ) {
        sessionCommitted += e.ms;
      }
    }

    return {
      subjects: db.subjects,

      todayTotals,

      restId: REST_ID,

      active: db.active
        ? {
          subjectId: db.active.subjectId,
          running: !!db.active.running,
          startedAt: db.active.startedAt,
          committedMs: sessionCommitted,
        }
        : null,

      serverNow: Date.now(),
    };
  }

  /* ---------- expose window.timer shim ---------- */

  window.timer = {
    getState: () =>
      Promise.resolve(
        window.timerDB.getState()
      ),

    start: id =>
      Promise.resolve(
        window.timerDB.start(id)
      ),

    pause: () =>
      Promise.resolve(
        window.timerDB.pause()
      ),

    stop: () =>
      Promise.resolve(
        window.timerDB.stop()
      ),

    rest: () =>
      Promise.resolve(
        window.timerDB.rest()
      ),

    addSubject: name =>
      Promise.resolve(
        window.timerDB.addSubject(name)
      ),

    renameSubject: (id, name, color) =>
      Promise.resolve(
        window.timerDB.renameSubject(
          id,
          name,
          color
        )
      ),

    removeSubject: id =>
      Promise.resolve(
        window.timerDB.removeSubject(id)
      ),

    weekly: () =>
      Promise.resolve(
        window.timerDB.weekly()
      ),

    getPlan: () => Promise.resolve(
      window.timerDB.getPlan()
    ),
    setPlan: (plan) => Promise.resolve(
      window.timerDB.setPlan(plan)
    ),

    onState: () => () => { },

    onNotice: () => () => { },
  };

  window.tasks = {
    getAll: () =>
      Promise.resolve(
        window.timerDB.getTasks()
      ),

    add: (text, projectId = null) =>
      Promise.resolve(
        window.timerDB.addTask(text, projectId)
      ),

    toggle: id =>
      Promise.resolve(
        window.timerDB.toggleTask(id)
      ),

    update: (id, text) =>
      Promise.resolve(
        window.timerDB.updateTask(id, text)
      ),

    remove: id =>
      Promise.resolve(
        window.timerDB.removeTask(id)
      ),
  };

  /* ---------- kick off rest on first load ---------- */

  (function bootstrap() {
    try {
      const db = loadDb();

      if (!db.active || !db.active.running) {
        startRest(db);
        saveDb(db);
      }

    } catch (e) {
      console.error(
        'bootstrap failed:',
        e
      );
    }
  })();

  /* ---------- mobile failsafe ---------- */

  document.addEventListener(
    'visibilitychange',
    () => {

      if (
        document.visibilityState === 'hidden'
      ) {

        const db = loadDb();

        if (
          db.active &&
          db.active.running
        ) {

          commitSegment(
            db,
            Date.now(),
            'background'
          );

          db.active = null;

          startRest(db);

          saveDb(db);
        }
      }
    }
  );

})();