'use strict';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_COLOR = '#822433';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

/** ISO string of the Monday that anchors the currently displayed week. */
let viewWeekStart = getThisMonday();

/** 'weekly' or 'monthly' */
let viewMode = 'weekly';

/** ISO string YYYY-MM-01 of the currently displayed month. */
let viewMonthStart = (function () {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}());

/** Currently selected calendar day. */
let selectedDate = null;

/* ------------------------------------------------------------------ *
 * Date helpers
 * ------------------------------------------------------------------ */

function localMidnight(date) {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [y, m, d] = date.split('-').map(Number);
        return new Date(y, m - 1, d, 0, 0, 0, 0);
    }

    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getThisMonday() {
    const today = localMidnight(new Date());
    const dow = today.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;

    today.setDate(today.getDate() + diff);

    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function weekDates(mondayISO) {
    const base = localMidnight(mondayISO);

    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(base);
        d.setDate(base.getDate() + i);

        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
}

function shiftWeek(mondayISO, delta) {
    const d = localMidnight(mondayISO);
    d.setDate(d.getDate() + delta * 7);

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(isoDate) {
    const d = localMidnight(isoDate);

    return d.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
    });
}

function rangeLabel(mondayISO) {
    const dates = weekDates(mondayISO);
    const start = localMidnight(dates[0]);
    const end = localMidnight(dates[6]);

    const fmt = {
        month: 'short',
        day: 'numeric'
    };

    return `${start.toLocaleDateString(undefined, fmt)} – ${end.toLocaleDateString(undefined, fmt)}`;
}

function isToday(isoDate) {
    const t = new Date();

    const todayLocal =
        `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

    return isoDate === todayLocal;
}

function monthDates(monthISO) {
    const [y, m] = monthISO.split('-').map(Number);
    const count = new Date(y, m, 0).getDate();

    return Array.from({ length: count }, (_, i) => {
        const day = String(i + 1).padStart(2, '0');

        return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${day}`;
    });
}

function shiftMonth(monthISO, delta) {
    const [y, m] = monthISO.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthLabel(monthISO) {
    const d = localMidnight(monthISO);

    return d.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric'
    });
}

function shortDayLabel(isoDate) {
    return String(localMidnight(isoDate).getDate());
}

function localDateKey(ms) {
    const d = new Date(ms);

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${y}-${m}-${day}`;
}

/* ------------------------------------------------------------------ *
 * Task helpers
 * ------------------------------------------------------------------ */

function getCompletedTaskDates(tasks) {
    const set = new Set();

    for (const task of tasks || []) {
        if (task && task.completed && task.completedAt) {
            set.add(localDateKey(task.completedAt));
        }
    }

    return set;
}

/**
 * Returns true when a task should appear on a particular date.
 *
 * A task appears:
 * - on its creation date
 * - on every day after creation
 * - until and including its completion date
 *
 * This means a task created on the 20th and completed on the 24th
 * appears on the 20th, 21st, 22nd, 23rd and 24th.
 */
function taskExistsOnDate(task, date) {
    if (!task || !task.createdAt) return false;

    const createdDate = localDateKey(task.createdAt);

    if (date < createdDate) {
        return false;
    }

    if (task.completed && task.completedAt) {
        const completedDate = localDateKey(task.completedAt);

        return date <= completedDate;
    }

    return true;
}

function taskCompletedOnDate(task, date) {
    if (!task || !task.completed || !task.completedAt) {
        return false;
    }

    return localDateKey(task.completedAt) === date;
}

function getTasksForDate(tasks, date) {
    return (tasks || []).filter(task =>
        taskExistsOnDate(task, date)
    );
}

function makeFlameBadge(compact = false) {
    const flame = document.createElement('span');

    flame.className = 'cal-flame';
    flame.textContent = '🔥';
    flame.title = 'Task completed this day — streak day!';

    flame.style.display = 'block';
    flame.style.textAlign = 'center';
    flame.style.fontSize = compact ? '1.05rem' : '1.25rem';
    flame.style.margin = '0.2rem auto 0';
    flame.style.filter = 'drop-shadow(0 0 3px rgba(255,140,0,0.7))';

    return flame;
}

/* ------------------------------------------------------------------ *
 * Format helpers
 * ------------------------------------------------------------------ */

function formatHours(ms) {
    if (!ms || ms <= 0) return null;

    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;

    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;

    return `${h}h ${m}m`;
}

function formatHoursFull(ms) {
    if (!ms || ms <= 0) return '0h 00m';

    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;

    return `${h}h ${String(m).padStart(2, '0')}m`;
}

/* ------------------------------------------------------------------ *
 * Selected Day / Diary / Todo rendering
 * ------------------------------------------------------------------ */

async function renderSelectedDay(state) {
    const section = document.getElementById('cal-day-section');
    const title = document.getElementById('cal-day-title');
    const sub = document.getElementById('cal-day-sub');
    const diary = document.getElementById('cal-diary');
    const todos = document.getElementById('cal-day-todos');

    if (!section || !title || !sub || !diary || !todos) {
        return;
    }

    /*
     * If no day has been selected yet, default to today.
     */
    if (!selectedDate) {
        const now = new Date();

        selectedDate =
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    const tasks = getTasksForDate(
        state.tasks || [],
        selectedDate
    );

    title.textContent = dayLabel(selectedDate);

    if (isToday(selectedDate)) {
        sub.textContent = 'Today';
    } else {
        sub.textContent = selectedDate;
    }

    /*
     * Diary
     */

    diary.replaceChildren();

    const textarea = document.createElement('textarea');

    textarea.className = 'cal-diary__input';
    textarea.id = 'cal-diary-input';
    textarea.placeholder = 'Write about your day...';
    textarea.spellcheck = true;

    try {
        textarea.value = await window.diary.get(selectedDate);
    } catch (error) {
        console.error('Failed to load diary:', error);
        textarea.value = '';
    }

    const status = document.createElement('div');

    status.className = 'cal-diary__status';
    status.id = 'cal-diary-status';

    diary.append(textarea, status);

    let saveTimeout = null;

    textarea.addEventListener('input', () => {
        status.textContent = 'Saving...';

        clearTimeout(saveTimeout);

        saveTimeout = setTimeout(async () => {
            try {
                await window.diary.set(
                    selectedDate,
                    textarea.value
                );

                status.textContent = 'Saved';

                setTimeout(() => {
                    if (status.textContent === 'Saved') {
                        status.textContent = '';
                    }
                }, 1200);

            } catch (error) {
                console.error(
                    'Failed to save diary:',
                    error
                );

                status.textContent = 'Failed to save';
            }
        }, 500);
    });

    /*
     * Todos
     */
    todos.replaceChildren();

    if (tasks.length === 0) {
        const empty = document.createElement('p');

        empty.className = 'cal-day-todos__empty';
        empty.textContent = 'No todos for this day.';

        todos.appendChild(empty);

        return;
    }

    for (const task of tasks) {
        const row = document.createElement('div');
        row.className = 'cal-day-todo';

        const checkbox = document.createElement('span');
        checkbox.className = 'cal-day-todo__checkbox';

        const completedToday =
            taskCompletedOnDate(task, selectedDate);

        checkbox.className = 'todo-check';
        checkbox.disabled = true;
        checkbox.setAttribute(
            'aria-label',
            completedToday ? 'Completed' : 'Not completed'
        );

        if (completedToday) {
            checkbox.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
                d="M2 6l3 3 5-5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    `;
        } else {
            checkbox.innerHTML = '';
        }

        const text = document.createElement('span');
        text.className = 'cal-day-todo__text';
        text.textContent = task.text || '';

        if (completedToday) {
            text.style.textDecoration = 'line-through';
            text.style.opacity = '0.65';
        }

        row.appendChild(checkbox);
        row.appendChild(text);

        if (completedToday) {
            const flame = document.createElement('span');

            flame.className = 'cal-day-todo__flame';
            flame.textContent = '🔥';
            flame.title = 'Completed on this day';

            row.appendChild(flame);
        }

        todos.appendChild(row);
    }
}

/* ------------------------------------------------------------------ *
 * Data loading
 * ------------------------------------------------------------------ */

async function loadData() {
    const state = await window.timer.getState();

    return { state };
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

async function render() {
    const { state } = await loadData();

    renderSelectedDay(state);

    if (viewMode === 'monthly') {
        return renderMonthly(state);
    }

    return renderWeekly(state);
}

/* ------------------------------------------------------------------ *
 * Weekly rendering
 * ------------------------------------------------------------------ */

async function renderWeekly(state) {

    const subjects = (state.subjects || []).filter(
        s => !s.rest && s.id !== state.restId
    );

    document.getElementById('cal-range').textContent =
        rangeLabel(viewWeekStart);

    const grid = document.getElementById('cal-grid');
    // Reset the grid layout when returning from Monthly view.
    grid.className = 'cal-grid';
    grid.removeAttribute('style');
    const empty = document.getElementById('cal-empty');
    const totalsRow = document.getElementById('cal-totals-row');

    if (subjects.length === 0) {
        grid.replaceChildren();
        totalsRow.replaceChildren();
        empty.hidden = false;
        return;
    }

    empty.hidden = true;

    const dates = weekDates(viewWeekStart);

    const t = new Date();

    const todayISO =
        `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

    const completedDates =
        getCompletedTaskDates(state.tasks);

    const cellData = {};

    for (const subject of subjects) {
        cellData[subject.id] = {};

        for (const date of dates) {
            cellData[subject.id][date] = 0;
        }
    }

    for (const entry of state.entries || []) {
        if (!entry) continue;

        const subjectId = entry.subjectId;
        const date = entry.date;
        const duration = Number(entry.duration || 0);

        if (!cellData[subjectId]) continue;
        if (!dates.includes(date)) continue;
        if (!Number.isFinite(duration) || duration <= 0) continue;

        cellData[subjectId][date] += duration;
    }

    const dayTotals = {};

    for (const date of dates) {
        dayTotals[date] = subjects.reduce(
            (sum, s) =>
                sum + (cellData[s.id][date] || 0),
            0
        );
    }

    let maxCell = 0;

    for (const subject of subjects) {
        for (const date of dates) {
            const v = cellData[subject.id][date] || 0;

            if (v > maxCell) {
                maxCell = v;
            }
        }
    }

    const COLS = 8;
    const totalRows = subjects.length + 1;

    grid.className = 'cal-grid';
    grid.style.setProperty('--cal-cols', COLS);
    grid.style.setProperty('--cal-rows', totalRows);
    grid.replaceChildren();

    /* Header row */

    const corner = document.createElement('div');

    corner.className =
        'cal-cell cal-cell--corner';

    grid.appendChild(corner);

    for (const date of dates) {

        const cell = document.createElement('div');

        cell.className =
            'cal-cell cal-cell--day-header' +
            (isToday(date)
                ? ' cal-cell--today'
                : '') +
            (date === selectedDate && !isToday(date)
                ? ' cal-cell--selected'
                : '');

        const label = document.createElement('span');

        label.className = 'cal-day-label';
        label.textContent = dayLabel(date);

        cell.appendChild(label);

        if (completedDates.has(date)) {
            cell.appendChild(
                makeFlameBadge()
            );
        }

        cell.style.cursor = 'pointer';

        cell.addEventListener('click', () => {
            selectedDate = date;
            render();
        });

        grid.appendChild(cell);
    }

    /* Subject rows */

    for (const subject of subjects) {

        const color =
            subject.color || DEFAULT_COLOR;

        const labelCell =
            document.createElement('div');

        labelCell.className =
            'cal-cell cal-cell--label';

        const dot =
            document.createElement('span');

        dot.className = 'cal-dot';
        dot.style.background = color;

        const name =
            document.createElement('span');

        name.className =
            'cal-label-text';

        name.textContent =
            subject.name;

        labelCell.append(dot, name);

        grid.appendChild(labelCell);

        for (const date of dates) {

            const ms =
                cellData[subject.id][date] || 0;

            const intensity =
                maxCell > 0
                    ? ms / maxCell
                    : 0;

            const cell =
                document.createElement('div');

            cell.className =
                'cal-cell cal-cell--data' +
                (isToday(date)
                    ? ' cal-cell--today'
                    : '') +
                (date === selectedDate && !isToday(date)
                    ? ' cal-cell--selected'
                    : '') +
                (date > todayISO
                    ? ' cal-cell--future'
                    : '');

            if (ms > 0) {

                const alpha =
                    Math.round(
                        (0.12 + intensity * 0.75) * 255
                    )
                        .toString(16)
                        .padStart(2, '0');

                cell.style.background =
                    color + alpha;

                cell.style.borderColor =
                    color + '55';

                const timeLabel =
                    document.createElement('span');

                timeLabel.className =
                    'cal-cell-time';

                timeLabel.textContent =
                    formatHours(ms);

                cell.appendChild(timeLabel);
            }

            cell.title = ms > 0
                ? `${subject.name} · ${dayLabel(date)}: ${formatHoursFull(ms)}`
                : `${subject.name} · ${dayLabel(date)}: no time logged`;

            cell.style.cursor = 'pointer';

            cell.addEventListener('click', () => {
                selectedDate = date;
                render();
            });

            grid.appendChild(cell);
        }
    }

    /* Daily totals */

    totalsRow.replaceChildren();

    for (const date of dates) {

        const ms =
            dayTotals[date] || 0;

        const card =
            document.createElement('div');

        card.className =
            'cal-total-card' +
            (isToday(date)
                ? ' cal-total-card--today'
                : '') +
            (date === selectedDate && !isToday(date)
                ? ' cal-total-card--selected'
                : '') +
            (date > todayISO
                ? ' cal-total-card--future'
                : '');

        const daySpan =
            document.createElement('span');

        daySpan.className =
            'cal-total-card__day';

        daySpan.textContent =
            DAY_LABELS[dates.indexOf(date)];

        if (completedDates.has(date)) {
            daySpan.appendChild(
                makeFlameBadge(true)
            );
        }

        const timeSpan =
            document.createElement('span');

        timeSpan.className =
            'cal-total-card__time';

        timeSpan.textContent =
            ms > 0
                ? formatHoursFull(ms)
                : '—';

        card.append(daySpan, timeSpan);

        card.style.cursor = 'pointer';

        card.addEventListener('click', () => {
            selectedDate = date;
            render();
        });

        totalsRow.appendChild(card);
    }
}

/* ------------------------------------------------------------------ *
 * Monthly rendering
 * ------------------------------------------------------------------ */

async function renderMonthly(state) {

    const subjects = (state.subjects || []).filter(
        s => !s.rest && s.id !== state.restId
    );

    document.getElementById('cal-range').textContent =
        monthLabel(viewMonthStart);

    const grid =
        document.getElementById('cal-grid');

    const empty =
        document.getElementById('cal-empty');

    const totalsRow =
        document.getElementById('cal-totals-row');

    if (subjects.length === 0) {
        grid.replaceChildren();
        totalsRow.replaceChildren();
        empty.hidden = false;
        return;
    }

    empty.hidden = true;

    const dates =
        monthDates(viewMonthStart);

    const t = new Date();

    const todayISO =
        `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

    const completedDates =
        getCompletedTaskDates(state.tasks);

    /* Aggregate time */

    const dayData = {};

    for (const date of dates) {
        dayData[date] = {};
    }

    for (const entry of state.entries || []) {

        if (!entry) continue;

        const {
            subjectId,
            date,
            duration
        } = entry;

        const dur =
            Number(duration || 0);

        if (!dates.includes(date)) continue;
        if (!Number.isFinite(dur) || dur <= 0) continue;

        if (!subjects.find(
            s => s.id === subjectId
        )) {
            continue;
        }

        dayData[date][subjectId] =
            (dayData[date][subjectId] || 0) +
            dur;
    }

    /* Per-day totals */

    const dayTotals = {};
    const dayTop = {};

    let maxDayTotal = 0;

    for (const date of dates) {

        const entries =
            dayData[date];

        let total = 0;
        let topMs = 0;
        let topSubject = null;

        for (const subject of subjects) {

            const ms =
                entries[subject.id] || 0;

            total += ms;

            if (ms > topMs) {
                topMs = ms;
                topSubject = subject;
            }
        }

        dayTotals[date] = total;

        dayTop[date] =
            topSubject
                ? {
                    subject: topSubject,
                    ms: topMs
                }
                : null;

        if (total > maxDayTotal) {
            maxDayTotal = total;
        }
    }

    /* Build weeks */

    const firstDow =
        localMidnight(dates[0]).getDay();

    const firstOffset =
        firstDow === 0
            ? 6
            : firstDow - 1;

    const paddedDates = [
        ...Array(firstOffset).fill(null),
        ...dates
    ];

    while (
        paddedDates.length % 7 !== 0
    ) {
        paddedDates.push(null);
    }

    const weeks = [];

    for (
        let i = 0;
        i < paddedDates.length;
        i += 7
    ) {
        weeks.push(
            paddedDates.slice(i, i + 7)
        );
    }

    /* Calendar grid */

    grid.className =
        'cal-grid cal-grid--monthly';

    grid.removeAttribute('style');

    grid.replaceChildren();

    grid.style.display = 'grid';
    grid.style.gridTemplateColumns =
        'repeat(7, 1fr)';
    grid.style.gap = '2px';

    /* Day-of-week headers */

    for (const label of DAY_LABELS) {

        const cell =
            document.createElement('div');

        cell.className =
            'cal-mcell cal-mcell--dow';

        cell.textContent = label;

        cell.style.fontSize = '0.6rem';
        cell.style.padding = '1px 0';
        cell.style.textAlign = 'center';

        grid.appendChild(cell);
    }

    /* Day cells */

    for (const week of weeks) {

        for (const date of week) {

            const cell =
                document.createElement('div');

            if (!date) {

                cell.className =
                    'cal-mcell cal-mcell--filler';

                cell.style.minHeight =
                    '30px';

                grid.appendChild(cell);

                continue;
            }

            const total =
                dayTotals[date] || 0;

            const top =
                dayTop[date];

            const future =
                date > todayISO;

            const today =
                isToday(date);

            const selected =
                date === selectedDate;

            cell.className =
                'cal-mcell cal-mcell--day' +
                (today
                    ? ' cal-mcell--today'
                    : '') +
                (selected && !today
                    ? ' cal-mcell--selected'
                    : '') +
                (future
                    ? ' cal-mcell--future'
                    : '');

            cell.style.position =
                'relative';

            cell.style.minHeight =
                '30px';

            cell.style.padding =
                '1px';

            cell.style.display =
                'flex';

            cell.style.flexDirection =
                'column';

            cell.style.alignItems =
                'center';

            cell.style.justifyContent =
                'center';

            cell.style.gap =
                '0';

            cell.style.overflow =
                'hidden';

            cell.style.boxSizing =
                'border-box';

            /* Project color */

            if (top && total > 0) {

                const color =
                    top.subject.color ||
                    DEFAULT_COLOR;

                const intensity =
                    maxDayTotal > 0
                        ? total / maxDayTotal
                        : 0;

                const alpha =
                    Math.round(
                        (0.10 + intensity * 0.75) * 255
                    )
                        .toString(16)
                        .padStart(2, '0');

                cell.style.background =
                    color + alpha;

                cell.style.borderColor =
                    color + '66';
            }

            /* Date number */

            const numEl =
                document.createElement('span');

            numEl.className =
                'cal-mcell__num';

            numEl.textContent =
                shortDayLabel(date);

            numEl.style.position =
                'absolute';

            numEl.style.top = '1px';
            numEl.style.left = '3px';
            numEl.style.fontSize = '0.55rem';
            numEl.style.opacity = '0.7';

            cell.appendChild(numEl);

            /* Completed task flame */

            if (completedDates.has(date)) {

                const flame =
                    document.createElement('span');

                flame.className =
                    'cal-flame';

                flame.textContent =
                    '🔥';

                flame.title =
                    'Task completed this day — streak day!';

                flame.style.fontSize =
                    '1rem';

                flame.style.lineHeight =
                    '1';

                flame.style.filter =
                    'drop-shadow(0 0 3px rgba(255,140,0,0.7))';

                cell.appendChild(flame);
            }

            /* Top project */

            if (top && total > 0) {

                const nameEl =
                    document.createElement('span');

                nameEl.className =
                    'cal-mcell__project';

                nameEl.textContent =
                    top.subject.name;

                nameEl.style.fontSize =
                    '0.52rem';

                nameEl.style.fontWeight =
                    '600';

                nameEl.style.maxWidth =
                    '100%';

                nameEl.style.overflow =
                    'hidden';

                nameEl.style.textOverflow =
                    'ellipsis';

                nameEl.style.whiteSpace =
                    'nowrap';

                nameEl.style.textAlign =
                    'center';

                nameEl.style.lineHeight =
                    '1.1';

                cell.appendChild(nameEl);

                const timeEl =
                    document.createElement('span');

                timeEl.className =
                    'cal-mcell__time';

                timeEl.textContent =
                    formatHours(total);

                timeEl.style.fontSize =
                    '0.5rem';

                timeEl.style.opacity =
                    '0.8';

                timeEl.style.lineHeight =
                    '1.1';

                cell.appendChild(timeEl);
            }

            /* Tooltip */

            const lines =
                subjects
                    .map(s => {

                        const ms =
                            dayData[date][s.id] || 0;

                        return ms > 0
                            ? `${s.name}: ${formatHoursFull(ms)}`
                            : null;
                    })
                    .filter(Boolean);

            const flameNote =
                completedDates.has(date)
                    ? '\n🔥 Task completed — streak day'
                    : '';

            cell.title =
                lines.length
                    ? `${dayLabel(date)}\n${lines.join('\n')}${flameNote}`
                    : `${dayLabel(date)}${flameNote}`;

            cell.style.cursor =
                'pointer';

            cell.addEventListener(
                'click',
                () => {
                    selectedDate = date;
                    render();
                }
            );

            grid.appendChild(cell);
        }
    }

    /* Weekly totals strip */

    totalsRow.replaceChildren();

    totalsRow.className =
        'cal-totals-row cal-totals-row--monthly';

    for (const week of weeks) {

        const weekMs =
            week.reduce(
                (sum, d) =>
                    sum +
                    (
                        d
                            ? (dayTotals[d] || 0)
                            : 0
                    ),
                0
            );

        const [startLabel, endLabel] =
            (() => {

                const realDates =
                    week.filter(Boolean);

                if (!realDates.length) {
                    return ['', ''];
                }

                const s =
                    localMidnight(
                        realDates[0]
                    );

                const e =
                    localMidnight(
                        realDates[realDates.length - 1]
                    );

                const fmt = {
                    month: 'short',
                    day: 'numeric'
                };

                return [
                    s.toLocaleDateString(
                        undefined,
                        fmt
                    ),
                    e.toLocaleDateString(
                        undefined,
                        fmt
                    )
                ];
            })();

        const containsToday =
            week.includes(todayISO);

        const card =
            document.createElement('div');

        card.className =
            'cal-week-card' +
            (
                containsToday
                    ? ' cal-week-card--current'
                    : ''
            );

        const rangeEl =
            document.createElement('span');

        rangeEl.className =
            'cal-week-card__range';

        rangeEl.textContent =
            startLabel && endLabel
                ? `${startLabel} – ${endLabel}`
                : '—';

        const timeEl =
            document.createElement('span');

        timeEl.className =
            'cal-week-card__time';

        timeEl.textContent =
            weekMs > 0
                ? formatHoursFull(weekMs)
                : '—';

        card.append(
            rangeEl,
            timeEl
        );

        totalsRow.appendChild(card);
    }
}

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

document
    .getElementById('cal-prev')
    .addEventListener('click', () => {

        if (viewMode === 'monthly') {
            viewMonthStart =
                shiftMonth(
                    viewMonthStart,
                    -1
                );
        } else {
            viewWeekStart =
                shiftWeek(
                    viewWeekStart,
                    -1
                );
        }

        render();
    });

document
    .getElementById('cal-next')
    .addEventListener('click', () => {

        if (viewMode === 'monthly') {
            viewMonthStart =
                shiftMonth(
                    viewMonthStart,
                    1
                );
        } else {
            viewWeekStart =
                shiftWeek(
                    viewWeekStart,
                    1
                );
        }

        render();
    });

document
    .getElementById('cal-today')
    .addEventListener('click', () => {

        const now = new Date();

        selectedDate =
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        if (viewMode === 'monthly') {

            viewMonthStart =
                `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

        } else {

            viewWeekStart =
                getThisMonday();
        }

        render();
    });

document
    .getElementById('cal-view-weekly')
    .addEventListener('click', () => {

        if (viewMode === 'weekly') {
            return;
        }

        viewMode = 'weekly';

        document
            .getElementById('cal-view-weekly')
            .classList.add('is-active');

        document
            .getElementById('cal-view-monthly')
            .classList.remove('is-active');

        render();
    });

document
    .getElementById('cal-view-monthly')
    .addEventListener('click', () => {

        if (viewMode === 'monthly') {
            return;
        }

        viewMode = 'monthly';

        document
            .getElementById('cal-view-monthly')
            .classList.add('is-active');

        document
            .getElementById('cal-view-weekly')
            .classList.remove('is-active');

        render();
    });

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

render();
