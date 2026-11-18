'use strict';


const path = require('path');
const fs = require('fs');

const {
    app,
    BrowserWindow,
    ipcMain,
    powerMonitor,
    dialog,
    Menu
} = require('electron');


// ============================================================
// Paths / Database
// ============================================================

const DATA_FILE = path.join(
    app.getPath('userData'),
    'data.json'
);


function defaultData() {
    return {
        version: 1,
        subjects: [],
        entries: [],
        tasks: [],
        diary: {},
        active: null,
        weeklyPlan: {},
        offlineSince: null
    };
}


function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return defaultData();
        }

        const raw = fs.readFileSync(
            DATA_FILE,
            'utf8'
        );

        const parsed = JSON.parse(raw);

        const data = {
            ...defaultData(),
            ...parsed
        };

        if (!Array.isArray(data.subjects)) {
            data.subjects = [];
        }

        if (!Array.isArray(data.entries)) {
            data.entries = [];
        }

        if (!Array.isArray(data.tasks)) {
            data.tasks = [];
        }

        if (
            !data.diary ||
            typeof data.diary !== 'object' ||
            Array.isArray(data.diary)
        ) {
            data.diary = {};
        }

        if (
            !data.weeklyPlan ||
            typeof data.weeklyPlan !== 'object'
        ) {
            data.weeklyPlan = {};
        }

        return data;

    } catch (error) {
        console.error(
            'Failed to load data:',
            error
        );

        return defaultData();
    }
}


let db = loadData();

let midnightSplitTimeout = null;


// Returns the next local midnight.
function getNextMidnight(from = new Date()) {
    const next = new Date(from);
    next.setHours(24, 0, 0, 0);
    return next;
}


// Save one segment of a running timer.
function saveTimerSegment(active, startMs, endMs, reason) {
    if (endMs <= startMs) return;

    db.entries.push({
        id: makeId('entry_'),
        subjectId: active.subjectId,
        start: startMs,
        end: endMs,
        duration: endMs - startMs,
        date: todayKey(new Date(startMs)),
        type: active.subjectId === '__rest__'
            ? 'rest'
            : 'timer',
        reason
    });
}

// Record an interval as Rest, splitting it at local midnight.
function recordRestInterval(startMs, endMs, reason = 'offline') {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    if (endMs <= startMs) return;

    const rest = ensureRestSubject();
    let cursor = startMs;

    while (cursor < endMs) {
        const midnight = getNextMidnight(new Date(cursor)).getTime();
        const segmentEnd = Math.min(midnight, endMs);

        saveTimerSegment(
            { subjectId: rest.id },
            cursor,
            segmentEnd,
            reason
        );

        cursor = segmentEnd;
    }
}
// Recover time elapsed while Quest Opus was closed.
function recoverOfflineTime() {
    if (db.offlineSince == null) return;

    const offlineSince = Number(db.offlineSince);
    const now = nowMs();

    if (!Number.isFinite(offlineSince) || offlineSince > now) {
        db.offlineSince = null;
        saveData();
        return;
    }

    recordRestInterval(offlineSince, now, 'offline');

    db.offlineSince = null;
    saveData();
}


// Split a running session at every midnight
// it has crossed, including missed midnights.
function splitActiveTimerAtMidnight() {
    if (!db.active) return;

    const active = db.active;
    const now = nowMs();
    let cursor = Number(active.startedAt);

    if (!Number.isFinite(cursor) || cursor >= now) return;

    let changed = false;

    while (
        todayKey(new Date(cursor)) !==
        todayKey(new Date(now))
    ) {
        const boundary = getNextMidnight(
            new Date(cursor)
        ).getTime();

        saveTimerSegment(
            active,
            cursor,
            boundary,
            'midnight'
        );

        cursor = boundary;
        changed = true;
    }

    if (changed) {
        db.active.startedAt = cursor;
        saveData();
        emitState();
    }
}


// Schedule the next midnight split.
function scheduleMidnightSplit() {
    clearTimeout(midnightSplitTimeout);

    const nextMidnight = getNextMidnight();
    const delay = Math.max(
        1,
        nextMidnight.getTime() - nowMs() + 50
    );

    midnightSplitTimeout = setTimeout(() => {
        splitActiveTimerAtMidnight();
        scheduleMidnightSplit();
    }, delay);
}



function saveData() {
    try {
        const dir = path.dirname(DATA_FILE);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {
                recursive: true
            });
        }

        const tempFile =
            `${DATA_FILE}.tmp`;

        fs.writeFileSync(
            tempFile,
            JSON.stringify(
                db,
                null,
                2
            ),
            'utf8'
        );

        fs.renameSync(
            tempFile,
            DATA_FILE
        );

    } catch (error) {
        console.error(
            'Failed to save data:',
            error
        );
    }
}


// ============================================================
// Helpers
// ============================================================

function makeId(prefix = '') {
    return (
        prefix +
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .slice(2, 8)
    );
}


function todayKey(date = new Date()) {
    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, '0');

    const day =
        String(
            date.getDate()
        ).padStart(2, '0');

    return `${year}-${month}-${day}`;
}


function nowMs() {
    return Date.now();
}


function emitState() {
    if (
        !mainWindow ||
        mainWindow.isDestroyed()
    ) {
        return;
    }

    mainWindow.webContents.send(
        'state',
        getState()
    );
}


function emitNotice(message) {
    if (
        !mainWindow ||
        mainWindow.isDestroyed()
    ) {
        return;
    }

    mainWindow.webContents.send(
        'notice',
        message
    );
}


function getState() {
    const today =
        todayKey();

    const todayTotals = {};

    for (const entry of db.entries) {
        if (!entry) continue;

        if (entry.date !== today) {
            continue;
        }

        const duration =
            Number(
                entry.duration || 0
            );

        if (!todayTotals[entry.subjectId]) {
            todayTotals[entry.subjectId] = 0;
        }

        todayTotals[entry.subjectId] +=
            duration;
    }

    return {
        version: db.version,

        subjects:
            db.subjects,

        entries:
            db.entries,

        tasks:
            db.tasks,

        todayTotals,

        streak: computeStreak(),

        active: db.active
            ? {
                subjectId:
                    db.active.subjectId,

                running: true,

                startedAt:
                    Number(
                        db.active.startedAt
                    ),

                committedMs: 0
            }
            : null,

        serverNow:
            Date.now()
    };
}


// ============================================================
// Streaks
//
// A "streak day" is any local calendar day on which the user
// completed at least one task. The streak counts consecutive
// streak days, Duolingo-style: it survives until the end of the
// day it was last extended on. If today has no completed task
// yet but yesterday did, the streak is still "alive" but
// `atRisk` — it will break at midnight unless a task is finished.
// ============================================================

function getCompletedDateSet() {
    const set = new Set();

    for (const task of db.tasks) {
        if (task && task.completed && task.completedAt) {
            set.add(
                todayKey(new Date(task.completedAt))
            );
        }
    }

    return set;
}


function computeStreak() {
    const dates = getCompletedDateSet();

    const today = todayKey();

    const yesterday = todayKey(
        new Date(nowMs() - 24 * 60 * 60 * 1000)
    );

    const todayDone = dates.has(today);
    const yesterdayDone = dates.has(yesterday);

    let cursor;

    if (todayDone) {
        cursor = new Date();
    } else if (yesterdayDone) {
        cursor = new Date(nowMs() - 24 * 60 * 60 * 1000);
    } else {
        return {
            current: 0,
            todayDone: false,
            atRisk: false,
            completedDates: Array.from(dates)
        };
    }

    let count = 0;

    while (dates.has(todayKey(cursor))) {
        count++;
        cursor = new Date(
            cursor.getTime() - 24 * 60 * 60 * 1000
        );
    }

    return {
        current: count,
        todayDone,
        atRisk: !todayDone,
        completedDates: Array.from(dates)
    };
}


function findSubject(subjectId) {
    return db.subjects.find(
        subject =>
            subject.id === subjectId
    );
}


function ensureRestSubject() {
    let rest =
        db.subjects.find(
            subject =>
                subject.id === '__rest__' ||
                subject.rest === true
        );

    if (!rest) {
        rest = {
            id: '__rest__',
            name: 'Rest',
            color: '#666666',
            rest: true
        };

        db.subjects.push(rest);

        saveData();
    }

    return rest;
}


function closeActiveTimer(
    reason = 'stop'
) {
    if (!db.active) {
        return null;
    }
    clearTimeout(midnightSplitTimeout);
    scheduleMidnightSplit();

    const active =
        db.active;

    const elapsed =
        Math.max(
            0,
            nowMs() -
            active.startedAt
        );

    /*
     * Rest is intentionally not written
     * to the normal project analytics entries.
     */
    db.entries.push({
        id:
            makeId('entry_'),

        subjectId:
            active.subjectId,

        start:
            active.startedAt,

        end:
            nowMs(),

        duration:
            elapsed,

        date:
            todayKey(
                new Date(
                    active.startedAt
                )
            ),

        type:
            active.subjectId === '__rest__'
                ? 'rest'
                : 'timer',

        reason
    });

    db.active = null;

    saveData();
    emitState();

    return elapsed;
}


// ============================================================
// Electron Window
// ============================================================

let mainWindow = null;


function createWindow() {
    mainWindow =
        new BrowserWindow({
            icon: path.join(__dirname, 'public', 'icon.ico'),
            width: 1280,
            height: 820,

            minWidth: 900,
            minHeight: 650,

            webPreferences: {
                preload:
                    path.join(
                        __dirname,
                        'preload.js'
                    ),

                contextIsolation:
                    true,

                nodeIntegration:
                    false
            }
        });

    mainWindow.loadFile(
        path.join(
            __dirname,
            'src',
            'auth.html'
        )
    );

    mainWindow.on(
        'closed',
        () => {
            mainWindow = null;
        }
    );
}


// ============================================================
// Timer IPC
// ============================================================

ipcMain.handle(
    'state:get',
    () => {
        return getState();
    }
);


ipcMain.handle(
    'timer:start',
    (_event, subjectId) => {

        const subject =
            findSubject(
                subjectId
            );

        if (!subject) {
            throw new Error(
                'Subject not found.'
            );
        }

        /*
         * Rest is handled separately.
         */
        if (subject.rest) {
            return {
                ok: false,

                message:
                    'Use the Rest button for rest.'
            };
        }

        /*
         * Switching projects closes
         * the previous timer first.
         */
        if (db.active) {
            closeActiveTimer(
                'switch'
            );
        }

        db.active = {
            subjectId,

            startedAt:
                nowMs()
        };

        saveData();
        emitState();

        return getState();
    }
);


ipcMain.handle('timer:pause', () => {
    if (!db.active) {
        return getState();
    }

    closeActiveTimer('pause');

    return getState();
});


ipcMain.handle('timer:stop', () => {
    if (!db.active) {
        return getState();
    }

    closeActiveTimer('stop');

    return getState();
});


ipcMain.handle(
    'timer:rest',
    () => {

        const rest =
            ensureRestSubject();

        if (db.active) {
            closeActiveTimer(
                'switch'
            );
        }

        db.active = {
            subjectId:
                rest.id,

            startedAt:
                nowMs()
        };

        saveData();
        emitState();

        return {
            ok: true
        };
    }
);


// ============================================================
// Subject / Project IPC
// ============================================================

ipcMain.handle(
    'subjects:add',
    (_event, name) => {

        const cleanName =
            String(name || '')
                .trim();

        if (!cleanName) {
            throw new Error(
                'Subject name is required.'
            );
        }

        const exists =
            db.subjects.some(
                subject =>
                    !subject.rest &&
                    subject.name
                        .toLowerCase() ===
                    cleanName
                        .toLowerCase()
            );

        if (exists) {
            throw new Error(
                'That name is already in use.'
            );
        }

        const subject = {
            id:
                makeId('subject_'),

            name:
                cleanName,

            color:
                '#822433',

            rest:
                false
        };

        db.subjects.push(
            subject
        );

        saveData();
        emitState();

        return getState();
    }
);


ipcMain.handle(
    'subjects:rename',
    (
        _event,
        subjectId,
        name,
        color
    ) => {

        const subject =
            findSubject(
                subjectId
            );

        if (!subject) {
            throw new Error(
                'Subject not found.'
            );
        }

        const cleanName =
            String(name || '')
                .trim();

        if (!cleanName) {
            throw new Error(
                'Subject name is required.'
            );
        }

        const duplicate =
            db.subjects.some(
                other =>
                    other.id !== subjectId &&
                    !other.rest &&
                    other.name
                        .toLowerCase() ===
                    cleanName
                        .toLowerCase()
            );

        if (duplicate) {
            throw new Error(
                'That name is already in use.'
            );
        }

        subject.name =
            cleanName;

        if (color) {
            subject.color =
                color;
        }

        saveData();
        emitState();

        return getState();
    }
);


ipcMain.handle(
    'subjects:remove',
    (_event, subjectId) => {

        const subject =
            findSubject(
                subjectId
            );

        if (!subject) {
            throw new Error(
                'Subject not found.'
            );
        }

        if (
            db.active &&
            db.active.subjectId ===
            subjectId
        ) {
            closeActiveTimer(
                'subject-removed'
            );
        }

        db.subjects =
            db.subjects.filter(
                subject =>
                    subject.id !==
                    subjectId
            );

        /*
         * Remove deleted subject
         * from weekly plan.
         */
        if (db.weeklyPlan) {
            delete db.weeklyPlan[
                subjectId
            ];
        }

        /*
         * Tasks belonging to a
         * deleted project become
         * unassigned.
         */
        for (
            const task of db.tasks
        ) {
            if (
                task.projectId ===
                subjectId
            ) {
                task.projectId =
                    null;
            }
        }

        saveData();
        emitState();

        return {
            ok: true
        };
    }
);


// ============================================================
// Weekly Plan IPC
// ============================================================

ipcMain.handle(
    'plan:get',
    () => {
        return db.weeklyPlan || {};
    }
);


ipcMain.handle(
    'plan:set',
    (_event, plan) => {

        if (
            !plan ||
            typeof plan !== 'object'
        ) {
            throw new Error(
                'Invalid weekly plan.'
            );
        }

        const validSubjectIds =
            new Set(
                db.subjects
                    .filter(
                        subject =>
                            !subject.rest
                    )
                    .map(
                        subject =>
                            subject.id
                    )
            );

        const cleanedPlan =
            {};

        for (
            const [
                subjectId,
                value
            ] of Object.entries(plan)
        ) {

            if (
                !validSubjectIds.has(
                    subjectId
                )
            ) {
                continue;
            }

            const hours =
                Number(value);

            if (
                !Number.isFinite(
                    hours
                )
            ) {
                continue;
            }

            cleanedPlan[
                subjectId
            ] =
                Math.max(
                    0,
                    hours
                );
        }

        db.weeklyPlan =
            cleanedPlan;

        saveData();

        return db.weeklyPlan;
    }
);


// ============================================================
// Analytics IPC
// ============================================================

ipcMain.handle(
    'analytics:weekly',
    () => {

        const now =
            new Date();

        /*
         * Find Monday of the
         * current week.
         */
        const currentDay =
            now.getDay();

        const mondayOffset =
            currentDay === 0
                ? -6
                : 1 - currentDay;

        const startOfThisWeek =
            new Date(now);

        startOfThisWeek.setHours(
            0,
            0,
            0,
            0
        );

        startOfThisWeek.setDate(
            now.getDate() +
            mondayOffset
        );

        /*
         * Previous Monday.
         */
        const startOfLastWeek =
            new Date(
                startOfThisWeek
            );

        startOfLastWeek.setDate(
            startOfLastWeek.getDate() -
            7
        );

        /*
         * Next Monday.
         */
        const endOfThisWeek =
            new Date(
                startOfThisWeek
            );

        endOfThisWeek.setDate(
            endOfThisWeek.getDate() +
            7
        );

        /*
         * Create an entry for
         * every current project.
         */
        const thisWeek = {};
        const lastWeek = {};

        for (
            const subject of
            db.subjects
        ) {
            thisWeek[
                subject.id
            ] = 0;

            lastWeek[
                subject.id
            ] = 0;
        }

        /*
         * Add logged time to the
         * appropriate week.
         */
        for (
            const entry of
            db.entries
        ) {

            if (
                !entry ||
                !entry.start
            ) {
                continue;
            }

            const start =
                new Date(
                    entry.start
                );

            const duration =
                Number(
                    entry.duration ||
                    0
                );

            if (
                !Number.isFinite(
                    duration
                )
            ) {
                continue;
            }

            /*
             * This week.
             */
            if (
                start >=
                startOfThisWeek &&
                start <
                endOfThisWeek
            ) {

                if (
                    Object.prototype
                        .hasOwnProperty
                        .call(
                            thisWeek,
                            entry.subjectId
                        )
                ) {
                    thisWeek[
                        entry.subjectId
                    ] += duration;
                }
            }

            /*
             * Last week.
             */
            else if (
                start >=
                startOfLastWeek &&
                start <
                startOfThisWeek
            ) {

                if (
                    Object.prototype
                        .hasOwnProperty
                        .call(
                            lastWeek,
                            entry.subjectId
                        )
                ) {
                    lastWeek[
                        entry.subjectId
                    ] += duration;
                }
            }
        }

        /*
         * This is the exact format
         * expected by the current
         * analytics.js.
         */
        return {
            thisWeek,

            lastWeek,

            weekStart:
                startOfThisWeek
                    .toISOString(),

            previousWeekStart:
                startOfLastWeek
                    .toISOString()
        };
    }
);

// ============================================================
// Diary IPC
// ============================================================

ipcMain.handle(
    'diary:get',
    (_event, dateKey) => {
        const key = String(dateKey || '').trim();

        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
            throw new Error(
                'Invalid diary date.'
            );
        }

        return db.diary[key] || '';
    }
);


ipcMain.handle(
    'diary:set',
    (_event, dateKey, text) => {
        const key = String(dateKey || '').trim();

        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
            throw new Error(
                'Invalid diary date.'
            );
        }

        const cleanText =
            String(text || '').trim();

        if (cleanText) {
            db.diary[key] = cleanText;
        } else {
            delete db.diary[key];
        }

        saveData();

        return db.diary[key] || '';
    }
);


// ============================================================
// Tasks IPC
// ============================================================

ipcMain.handle(
    'tasks:get',
    () => {
        return db.tasks;
    }
);


ipcMain.handle(
    'tasks:add',
    (
        _event,
        text,
        projectId = null,
        deadline = null
    ) => {

        const cleanText =
            String(text || '')
                .trim();

        if (!cleanText) {
            throw new Error(
                'Task text is required.'
            );
        }

        let validProjectId =
            null;

        if (projectId) {

            const project =
                findSubject(
                    projectId
                );

            if (
                project &&
                !project.rest
            ) {
                validProjectId =
                    projectId;
            }
        }

        let validDeadline = null;

        if (deadline !== null && deadline !== '') {
            const deadlineText = String(deadline).trim();

            if (!/^\d{4}-\d{2}-\d{2}$/.test(deadlineText)) {
                throw new Error('Invalid task deadline.');
            }

            const parsedDeadline = new Date(
                `${deadlineText}T00:00:00`
            );

            if (
                Number.isNaN(parsedDeadline.getTime()) ||
                todayKey(parsedDeadline) !== deadlineText
            ) {
                throw new Error('Invalid task deadline.');
            }

            validDeadline = deadlineText;
        }

        const task = {
            id: makeId('task_'),
            text: cleanText,
            completed: false,
            projectId: validProjectId,
            deadline: validDeadline,
            createdAt: nowMs(),
            completedAt: null,
            order: db.tasks.length
        };

        db.tasks.push(
            task
        );

        saveData();

        return task;
    }
);


ipcMain.handle(
    'tasks:toggle',
    (_event, taskId) => {

        const task =
            db.tasks.find(
                task =>
                    task.id ===
                    taskId
            );

        if (!task) {
            throw new Error(
                'Task not found.'
            );
        }

        task.completed =
            !task.completed;

        task.completedAt =
            task.completed
                ? nowMs()
                : null;

        saveData();

        /*
         * Tell every renderer
         * that the task state changed
         * (including any streak change).
         */
        emitState();

        /*
         * Return the complete
         * task list because the
         * current todo.js expects it.
         */
        return db.tasks;
    }
);


ipcMain.handle(
    'tasks:update',
    (
        _event,
        taskId,
        text
    ) => {

        const task =
            db.tasks.find(
                task =>
                    task.id ===
                    taskId
            );

        if (!task) {
            throw new Error(
                'Task not found.'
            );
        }

        const cleanText =
            String(text || '')
                .trim();

        if (!cleanText) {
            throw new Error(
                'Task text is required.'
            );
        }

        task.text =
            cleanText;

        saveData();

        return task;
    }
);


ipcMain.handle(
    'tasks:remove',
    (_event, taskId) => {

        const exists =
            db.tasks.some(
                task =>
                    task.id ===
                    taskId
            );

        if (exists) {

            db.tasks =
                db.tasks.filter(
                    task =>
                        task.id !==
                        taskId
                );

            saveData();
        }

        /*
         * Always return the
         * current task list.
         */
        return db.tasks;
    }
);


ipcMain.handle(
    'tasks:reorder',
    (_event, orderedIds) => {

        if (!Array.isArray(orderedIds)) {
            return db.tasks;
        }

        orderedIds.forEach((taskId, index) => {
            const task = db.tasks.find(
                task => task.id === taskId
            );

            if (task) {
                task.order = index;
            }
        });

        saveData();
        emitState();

        return db.tasks;
    }
);


// ============================================================
// Streak IPC
// ============================================================

ipcMain.handle(
    'streak:get',
    () => {
        return computeStreak();
    }
);


// ============================================================
// Data Path
// ============================================================

ipcMain.handle(
    'data:path',
    () => {
        return DATA_FILE;
    }
);


// ============================================================
// Timer Recovery / Failsafes
// ============================================================

function recoverTimer() {

    if (!db.active) {
        return;
    }

    const elapsed =
        nowMs() -
        Number(
            db.active.startedAt ||
            nowMs()
        );

    /*
     * If the timer was left
     * running for more than
     * 24 hours, close it.
     */
    if (
        elapsed >
        24 * 60 * 60 * 1000
    ) {

        console.warn(
            'Recovering stale timer:',
            elapsed
        );

        closeActiveTimer(
            'recovery'
        );
    }
}


// ============================================================
// Sleep / Resume
// ============================================================

powerMonitor.on(
    'suspend',
    () => {

        const rest = ensureRestSubject();

        // Already on Rest — nothing to do.
        if (db.active && db.active.subjectId === rest.id) {
            return;
        }

        // Close whatever is running (or nothing), then start Rest.
        if (db.active) {
            closeActiveTimer('suspend');
        }

        db.active = {
            subjectId: rest.id,
            startedAt: nowMs()
        };

        saveData();
        emitState();
    }
);


powerMonitor.on(
    'resume',
    () => {

        emitState();

        if (
            mainWindow &&
            !mainWindow.isDestroyed()
        ) {
            mainWindow.show();
            mainWindow.restore();

            // Temporarily force Quest Opus above other windows
            mainWindow.setAlwaysOnTop(true);
            mainWindow.focus();
            mainWindow.moveTop();

            // Return to normal window behavior
            setTimeout(() => {
                if (
                    mainWindow &&
                    !mainWindow.isDestroyed()
                ) {
                    mainWindow.setAlwaysOnTop(false);
                }
            }, 500);
        }
    }
);


// ============================================================
// App Lifecycle
// ============================================================

const gotLock =
    app.requestSingleInstanceLock();


if (!gotLock) {

    app.quit();

} else {

    app.on(
        'second-instance',
        () => {

            if (!mainWindow) {
                return;
            }

            if (
                mainWindow.isMinimized()
            ) {
                mainWindow.restore();
            }

            mainWindow.focus();
        }
    );


    app.whenReady().then(
        () => {

            Menu.setApplicationMenu(
                null
            );
            db = loadData();

            ensureRestSubject();

            // Recover any time from the previous app shutdown first.
            recoverOfflineTime();

            // Ensure tracking resumes under Rest, not the previous project.
            if (db.active) {
                closeActiveTimer('startup-recovery');
            }

            const rest = ensureRestSubject();

            db.active = {
                subjectId: rest.id,
                startedAt: nowMs()
            };

            splitActiveTimerAtMidnight();
            scheduleMidnightSplit();

            saveData();

            createWindow();


            app.on(
                'activate',
                () => {

                    if (
                        BrowserWindow
                            .getAllWindows()
                            .length === 0
                    ) {
                        createWindow();
                    }
                }
            );
        }
    );


    app.on('before-quit', () => {
        // Close the current session before the app exits.
        if (db.active) {
            closeActiveTimer('quit');
        }

        // The next launch will assign the offline interval to Rest.
        db.offlineSince = nowMs();

        saveData();
    });


    app.on(
        'window-all-closed',
        () => {

            if (
                process.platform !==
                'darwin'
            ) {
                app.quit();
            }
        }
    );
}


// ============================================================
// Global Error Handling
// ============================================================

process.on(
    'uncaughtException',
    error => {

        console.error(
            'Uncaught exception:',
            error
        );

        if (
            mainWindow &&
            !mainWindow.isDestroyed()
        ) {

            dialog.showErrorBox(
                'Quest Opus Error',
                error.stack ||
                error.message
            );
        }
    }
);


process.on(
    'unhandledRejection',
    error => {

        console.error(
            'Unhandled promise rejection:',
            error
        );
    }
);