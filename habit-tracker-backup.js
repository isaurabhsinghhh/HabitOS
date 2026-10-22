(() => {
  'use strict';

  const STORAGE_KEY = 'habitos.tracker.v1';
  const EXPENSE_STORAGE_KEY = 'habitos.expenses.v1';
  const STANDARD_HABITS = [
    { id: 'no-junk', name: 'No Junk' },
    { id: 'no-sugar', name: 'No Sugar' },
    { id: 'class', name: 'Class' },
    { id: 'study', name: 'Study' },
    { id: 'gym', name: 'GYM' },
    { id: 'bath', name: 'Bath' },
    { id: 'book', name: 'Book' },
    { id: 'speaking', name: 'Speaking' },
    { id: 'habit', name: 'Habit' }
  ];
  const STANDARD_IDS = new Set(STANDARD_HABITS.map((habit) => habit.id));
  const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const els = {
    calendar: document.getElementById('calendar-grid'),
    daily: document.getElementById('daily-detail'),
    month: document.getElementById('month-picker'),
    insightMonth: document.getElementById('insights-month-filter'),
    waterTarget: document.getElementById('water-target'),
    message: document.getElementById('storage-message'),
    dialog: document.getElementById('habit-dialog'),
    form: document.getElementById('habit-form'),
    habitName: document.getElementById('habit-name'),
    habitTitle: document.getElementById('habit-dialog-title'),
    habitCopy: document.getElementById('habit-dialog-copy'),
    habitSubmit: document.getElementById('save-habit'),
    habitError: document.getElementById('habit-form-error'),
    importFile: document.getElementById('import-file'),
    analyticsDialog: document.getElementById('analytics-dialog'),
    comparisonDialog: document.getElementById('comparison-dialog'),
    historyDialog: document.getElementById('history-dialog'),
    readingDialog: document.getElementById('reading-dialog'),
    readingSetup: document.getElementById('reading-setup'),
    readingStatus: document.getElementById('reading-status'),
    readingForm: document.getElementById('reading-form'),
    readingTitle: document.getElementById('book-title'),
    readingAuthor: document.getElementById('book-author')
  };

  function pad(value) { return String(value).padStart(2, '0'); }
  function localISO(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function todayISO() { return localISO(new Date()); }
  function monthOf(dateString) { return dateString.slice(0, 7); }
  function dateFromISO(dateString) { return new Date(dateString + 'T12:00:00'); }
  function addDays(dateString, amount) {
    const date = dateFromISO(dateString);
    date.setDate(date.getDate() + amount);
    return localISO(date);
  }
  function isValidISODate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = dateFromISO(value);
    return !Number.isNaN(date.getTime()) && localISO(date) === value;
  }
  function isValidTime(value) { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }
  function formatNumber(value, digits) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits == null ? 2 : digits }).format(value);
  }
  function formatLongDate(dateString) {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(dateFromISO(dateString));
  }
  function formatShortDate(dateString) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(dateFromISO(dateString));
  }
  function formatMonth(monthString) {
    const parts = monthString.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(parts[0], parts[1] - 1, 1, 12));
  }
  function daysInMonth(monthString) {
    const parts = monthString.split('-').map(Number);
    return new Date(parts[0], parts[1], 0).getDate();
  }
  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return 'custom-' + window.crypto.randomUUID();
    return 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function emptyData() {
    return { version: 1, settings: { waterTarget: 2.5, trackingStartDate: todayISO() }, customHabits: [], records: {}, reading: { preference: 'unknown', book: null } };
  }

  function validateData(source) {
    if (!isObject(source) || source.version !== 1 || !isObject(source.settings) || !Array.isArray(source.customHabits) || !isObject(source.records)) {
      return { ok: false, message: 'This backup does not match the HabitOS tracker format.' };
    }
    const target = source.settings.waterTarget;
    if (typeof target !== 'number' || !Number.isFinite(target) || target < 0.1 || target > 20) return { ok: false, message: 'The water target in this backup is invalid.' };
    if (source.customHabits.length > 500) return { ok: false, message: 'This backup contains too many custom habits.' };

    const seenIds = new Set();
    const seenNames = new Set();
    const customHabits = [];
    for (const habit of source.customHabits) {
      if (!isObject(habit) || typeof habit.id !== 'string' || !/^custom-[a-zA-Z0-9-]{3,100}$/.test(habit.id) || seenIds.has(habit.id)) {
        return { ok: false, message: 'A custom habit in this backup has an invalid or duplicate ID.' };
      }
      const name = typeof habit.name === 'string' ? habit.name.trim() : '';
      if (!name || name.length > 40) return { ok: false, message: 'A custom habit name in this backup is missing or too long.' };
      const folded = name.toLocaleLowerCase();
      if (seenNames.has(folded)) return { ok: false, message: 'Custom habit names in a backup must be unique.' };
      if (!isValidISODate(habit.createdAt) || (habit.deletedAt !== null && (!isValidISODate(habit.deletedAt) || habit.deletedAt < habit.createdAt))) {
        return { ok: false, message: 'A custom habit date in this backup is invalid.' };
      }
      seenIds.add(habit.id);
      seenNames.add(folded);
      customHabits.push({ id: habit.id, name, createdAt: habit.createdAt, deletedAt: habit.deletedAt });
    }

    const validIds = new Set([...STANDARD_IDS, ...seenIds]);
    const recordDates = Object.keys(source.records);
    if (recordDates.length > 10000) return { ok: false, message: 'This backup contains too many daily records.' };
    const records = {};
    for (const date of recordDates) {
      const input = source.records[date];
      if (!isValidISODate(date) || !isObject(input)) return { ok: false, message: 'A daily record in this backup is malformed.' };
      if (input.habits != null && !isObject(input.habits)) return { ok: false, message: 'A habit entry list in this backup is malformed.' };
      const habitValues = isObject(input.habits) ? input.habits : {};
      const habits = {};
      for (const [id, status] of Object.entries(habitValues)) {
        if (!validIds.has(id) || (status !== 'done' && status !== 'missed')) return { ok: false, message: 'A habit entry in this backup is invalid.' };
        habits[id] = status;
      }
      const numeric = {};
      for (const field of ['water', 'weight', 'spent']) {
        const value = input[field] == null ? null : input[field];
        if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return { ok: false, message: 'A numeric entry in this backup is invalid.' };
        numeric[field] = value;
      }
      let sleep = null;
      if (input.sleep != null) {
        if (!isObject(input.sleep)) return { ok: false, message: 'A sleep entry in this backup is invalid.' };
        const start = input.sleep.start == null || input.sleep.start === '' ? '' : input.sleep.start;
        const wake = input.sleep.wake == null || input.sleep.wake === '' ? '' : input.sleep.wake;
        if ((start && !isValidTime(start)) || (wake && !isValidTime(wake))) return { ok: false, message: 'A sleep time in this backup is invalid.' };
        if (start || wake) sleep = { start: start || '', wake: wake || '' };
      }
      const notes = input.notes == null ? '' : input.notes;
      if (typeof notes !== 'string' || notes.length > 5000) return { ok: false, message: 'A notes entry in this backup is too long or invalid.' };
      records[date] = { habits, water: numeric.water, weight: numeric.weight, spent: numeric.spent, sleep, notes };
    }
    let reading = { preference: 'unknown', book: null };
    if (source.reading != null) {
      if (!isObject(source.reading) || !['unknown', 'yes', 'no'].includes(source.reading.preference)) {
        return { ok: false, message: 'The reading preference in this backup is invalid.' };
      }
      let book = null;
      if (source.reading.book != null) {
        const input = source.reading.book;
        if (!isObject(input) || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 ||
            (input.author != null && (typeof input.author !== 'string' || input.author.length > 100)) ||
            !['reading', 'finished'].includes(input.status)) {
          return { ok: false, message: 'The book details in this backup are invalid.' };
        }
        book = { title: input.title.trim(), author: (input.author || '').trim(), status: input.status };
      }
      reading = { preference: source.reading.preference, book };
      if (reading.preference !== 'yes' && reading.book) return { ok: false, message: 'A saved book needs an active reading preference.' };
    }
    const savedStartDate = source.settings.trackingStartDate;
    if (savedStartDate != null && !isValidISODate(savedStartDate)) return { ok: false, message: 'The tracking start date in this backup is invalid.' };
    const historyStart = [...Object.keys(records), ...customHabits.map((habit) => habit.createdAt)].sort()[0] || todayISO();
    const trackingStartDate = savedStartDate || historyStart;
    return { ok: true, data: { version: 1, settings: { waterTarget: target, trackingStartDate }, customHabits, records, reading } };
  }

  let data = emptyData();
  let selectedDate = todayISO();
  let viewMonth = monthOf(selectedDate);
  let storageLocked = false;
  let editingHabitId = null;
  let messageTimer = null;
  let rolloverTimer = null;
  let finalizedStartDate = null;
  let finalizedThroughDate = null;
  let expenseTotalsByDate = new Map();

  function setMessage(message, type, permanent) {
    if (!els.message) return;
    window.clearTimeout(messageTimer);
    els.message.textContent = message || '';
    els.message.classList.toggle('is-visible', Boolean(message));
    els.message.classList.toggle('is-error', type === 'error');
    if (message && !permanent) messageTimer = window.setTimeout(() => els.message.classList.remove('is-visible'), 3600);
  }

  function loadData() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        data = emptyData();
        persistData();
        return;
      }
      const parsed = JSON.parse(raw);
      const checked = validateData(parsed);
      if (!checked.ok) {
        storageLocked = true;
        data = emptyData();
        setMessage('Saved tracker data was not changed, but it could not be read safely. Import a valid backup to restore records. ' + checked.message, 'error', true);
        return;
      }
      data = checked.data;
      if (parsed.settings.trackingStartDate == null) persistData();
    } catch (error) {
      storageLocked = true;
      data = emptyData();
      setMessage('Local browser storage could not be read. Your current session will work, but changes cannot be saved until storage is available.', 'error', true);
    }
  }

  function persistData() {
    if (storageLocked) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      storageLocked = true;
      setMessage('This browser could not save to local storage. Your current changes remain on screen, but export a backup before closing.', 'error', true);
      return false;
    }
  }

  function blankRecord() { return { habits: {}, water: null, weight: null, spent: null, sleep: null, notes: '' }; }
  function getRecord(date) { return data.records[date] || blankRecord(); }
  function refreshExpenseTotals() {
    const totals = new Map();
    try {
      const raw = window.localStorage.getItem(EXPENSE_STORAGE_KEY);
      if (!raw) {
        expenseTotalsByDate = totals;
        return;
      }
      const source = JSON.parse(raw);
      if (!isObject(source) || source.version !== 1 || !Array.isArray(source.transactions)) {
        expenseTotalsByDate = totals;
        return;
      }
      for (const transaction of source.transactions) {
        if (!isObject(transaction) || !isValidISODate(transaction.date) ||
            typeof transaction.amount !== 'number' || !Number.isFinite(transaction.amount) || transaction.amount <= 0) continue;
        const total = (totals.get(transaction.date) || 0) + transaction.amount;
        totals.set(transaction.date, Math.round((total + Number.EPSILON) * 100) / 100);
      }
    } catch (error) {
      // If Expense Tracker data is unavailable, retain Habit Tracker's existing manual values.
    }
    expenseTotalsByDate = totals;
  }
  function getSpentValue(date) {
    return expenseTotalsByDate.has(date) ? expenseTotalsByDate.get(date) : getRecord(date).spent;
  }
  function getOrCreateRecord(date) {
    if (date < data.settings.trackingStartDate) data.settings.trackingStartDate = date;
    if (!data.records[date]) data.records[date] = blankRecord();
    return data.records[date];
  }
  function isRecordEmpty(record) {
    return Object.keys(record.habits).length === 0 && record.water == null && record.weight == null && record.spent == null && record.sleep == null && !record.notes;
  }
  function cleanRecord(date) {
    const record = data.records[date];
    if (record && isRecordEmpty(record)) delete data.records[date];
  }
  function saveAndRender(message) {
    finalizeMissedDays(false);
    const saved = persistData();
    if (message && saved) setMessage(message, 'success', false);
    renderAll();
  }

  function finalizeMissedDays(persistChanges) {
    const startDate = data.settings.trackingStartDate || todayISO();
    const lastCompletedDate = addDays(todayISO(), -1);
    if (startDate > lastCompletedDate) return false;
    let cursor = startDate;
    if (finalizedStartDate === startDate && finalizedThroughDate) {
      if (finalizedThroughDate >= lastCompletedDate) return false;
      cursor = addDays(finalizedThroughDate, 1);
    }
    let changed = false;
    for (; cursor <= lastCompletedDate; cursor = addDays(cursor, 1)) {
      const record = getOrCreateRecord(cursor);
      for (const habit of STANDARD_HABITS) {
        if (!Object.prototype.hasOwnProperty.call(record.habits, habit.id)) {
          record.habits[habit.id] = 'missed';
          changed = true;
        }
      }
      for (const habit of data.customHabits) {
        const applies = cursor >= habit.createdAt && (!habit.deletedAt || cursor < habit.deletedAt);
        if (applies && !Object.prototype.hasOwnProperty.call(record.habits, habit.id)) {
          record.habits[habit.id] = 'missed';
          changed = true;
        }
      }
    }
    finalizedStartDate = startDate;
    finalizedThroughDate = lastCompletedDate;
    if (changed && persistChanges !== false) persistData();
    return changed;
  }

  function scheduleDayRollover() {
    window.clearTimeout(rolloverTimer);
    const scheduledDate = todayISO();
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const delay = Math.max(1000, nextMidnight.getTime() - Date.now());
    rolloverTimer = window.setTimeout(() => {
      finalizeMissedDays();
      const currentDate = todayISO();
      if (currentDate !== scheduledDate && selectedDate === scheduledDate) {
        selectedDate = currentDate;
        viewMonth = monthOf(currentDate);
      }
      renderAll();
      scheduleDayRollover();
    }, delay);
  }

  function getCustomHabit(id) { return data.customHabits.find((habit) => habit.id === id) || null; }
  function getApplicableHabits(date) {
    const record = getRecord(date);
    const custom = data.customHabits.filter((habit) => {
      const recorded = Object.prototype.hasOwnProperty.call(record.habits, habit.id);
      const afterCreation = date >= habit.createdAt;
      const beforeRetirement = !habit.deletedAt || date < habit.deletedAt;
      return recorded || (afterCreation && beforeRetirement);
    }).map((habit) => ({ id: habit.id, name: habit.name, custom: true, archived: Boolean(habit.deletedAt && date >= habit.deletedAt) }));
    return STANDARD_HABITS.map((habit) => ({ ...habit, custom: false, archived: false })).concat(custom);
  }
  function getDailyStats(date) {
    const record = getRecord(date);
    const applicable = getApplicableHabits(date);
    let recorded = 0;
    let completed = 0;
    let missed = 0;
    for (const habit of applicable) {
      const status = record.habits[habit.id];
      if (status === 'done') { recorded += 1; completed += 1; }
      else if (status === 'missed') { recorded += 1; missed += 1; }
    }
    return { recorded, completed, missed, percent: recorded ? Math.round(completed * 100 / recorded) : null };
  }
  function monthDates(month) {
    const count = daysInMonth(month);
    const parts = month.split('-').map(Number);
    return Array.from({ length: count }, (_, index) => localISO(new Date(parts[0], parts[1] - 1, index + 1, 12)));
  }
  function monthRecordDates(month) { return Object.keys(data.records).filter((date) => monthOf(date) === month).sort(); }
  function getMonthHabitRows(month) {
    const dates = monthDates(month);
    const monthStart = dates[0];
    const monthEnd = dates[dates.length - 1];
    const applicable = STANDARD_HABITS.map((habit) => ({ ...habit, custom: false }));
    for (const habit of data.customHabits) {
      const recordedSomewhere = dates.some((date) => Object.prototype.hasOwnProperty.call(getRecord(date).habits, habit.id));
      const existedInMonth = habit.createdAt <= monthEnd && (!habit.deletedAt || habit.deletedAt > monthStart);
      if (recordedSomewhere || existedInMonth) applicable.push({ id: habit.id, name: habit.name, custom: true });
    }
    return applicable.map((habit) => {
      let recorded = 0;
      let completed = 0;
      for (const date of dates) {
        if (habit.custom) {
          const definition = getCustomHabit(habit.id);
          const hasValue = Object.prototype.hasOwnProperty.call(getRecord(date).habits, habit.id);
          const applies = definition && date >= definition.createdAt && (!definition.deletedAt || date < definition.deletedAt);
          if (!hasValue && !applies) continue;
        }
        const status = getRecord(date).habits[habit.id];
        if (status === 'done' || status === 'missed') {
          recorded += 1;
          if (status === 'done') completed += 1;
        }
      }
      return { ...habit, recorded, completed, percent: recorded ? completed * 100 / recorded : null };
    });
  }
  function sleepMinutes(start, wake) {
    if (!isValidTime(start) || !isValidTime(wake)) return null;
    const from = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
    const to = Number(wake.slice(0, 2)) * 60 + Number(wake.slice(3, 5));
    return (to - from + 1440) % 1440;
  }
  function formatDuration(minutes) {
    if (minutes == null) return '—';
    return Math.floor(minutes / 60) + 'h ' + pad(minutes % 60) + 'm';
  }
  function renderCalendar() {
    const parts = viewMonth.split('-').map(Number);
    const first = new Date(parts[0], parts[1] - 1, 1, 12);
    const mondayOffset = (first.getDay() + 6) % 7;
    const count = daysInMonth(viewMonth);
    const totalCells = Math.ceil((mondayOffset + count) / 7) * 7;
    const today = todayISO();
    let html = '<div class="weekday-row" role="row">' + WEEKDAYS.map((day) => '<div class="weekday-label" role="columnheader">' + day + '</div>').join('') + '</div>';
    for (let rowStart = 0; rowStart < totalCells; rowStart += 7) {
      html += '<div class="calendar-week" role="row">';
      for (let column = 0; column < 7; column += 1) {
        const offset = rowStart + column;
        const date = localISO(new Date(parts[0], parts[1] - 1, offset - mondayOffset + 1, 12));
        const isCurrentMonth = monthOf(date) === viewMonth;
        const stats = getDailyStats(date);
        const selected = date === selectedDate;
        const current = date === today;
        let description = stats.recorded ? stats.completed + ' of ' + stats.recorded + ' recorded habits complete, ' + stats.percent + ' percent.' : 'No habits recorded.';
        if (!isCurrentMonth) description += ' Adjacent month.';
        const classNames = ['day-cell', isCurrentMonth ? '' : 'is-outside', selected ? 'is-selected' : '', current ? 'is-today' : '', stats.recorded && stats.percent === 100 ? 'is-complete' : '', stats.recorded && stats.percent > 0 && stats.percent < 100 ? 'is-partial' : '', stats.recorded && stats.completed === 0 ? 'is-missed' : ''].filter(Boolean).join(' ');
        const indicator = stats.recorded ? '<i class="day-indicator" aria-hidden="true"></i>' : '';
        html += '<button class="' + classNames + '" type="button" role="gridcell" data-date="' + date + '" tabindex="' + (selected ? '0' : '-1') + '" aria-label="' + escapeHTML(formatLongDate(date) + '. ' + description) + '" aria-selected="' + (selected ? 'true' : 'false') + '"' + (current ? ' aria-current="date"' : '') + ' title="' + escapeHTML(description) + '"><span class="day-topline"><span class="day-number">' + Number(date.slice(-2)) + '</span>' + indicator + (current ? '<i class="today-pin" aria-hidden="true"></i>' : '') + '</span></button>';
      }
      html += '</div>';
    }
    els.calendar.innerHTML = html;
    els.calendar.setAttribute('aria-label', formatMonth(viewMonth) + ' habit calendar. Monday through Sunday.');
  }

  function renderHabitRow(habit, record) {
    const status = record.habits[habit.id] || 'unrecorded';
    const statusLabel = status === 'done' ? 'Completed' : status === 'missed' ? 'Not completed' : 'Not recorded';
    const action = status === 'done' ? 'Mark ' + habit.name + ' not completed' : status === 'missed' ? 'Clear ' + habit.name + ' status' : 'Mark ' + habit.name + ' complete';
    const stateIcon = status === 'done' ? '✓' : status === 'missed' ? '−' : '';
    const definition = habit.custom ? getCustomHabit(habit.id) : null;
    const controls = habit.custom && definition && !definition.deletedAt ? '<span class="habit-row-actions"><button class="row-action" type="button" data-action="rename" data-habit-id="' + escapeHTML(habit.id) + '" aria-label="Rename ' + escapeHTML(habit.name) + '">Edit</button><button class="row-action delete" type="button" data-action="delete" data-habit-id="' + escapeHTML(habit.id) + '" aria-label="Delete ' + escapeHTML(habit.name) + '">Delete</button></span>' : '<span class="habit-row-actions"></span>';
    const pressed = status === 'done' ? 'true' : status === 'missed' ? 'false' : 'mixed';
    return '<div class="habit-row"><span class="habit-name' + (habit.archived ? ' is-archived' : '') + '">' + escapeHTML(habit.name) + (habit.archived ? ' · archived' : '') + '</span><button class="habit-toggle" type="button" data-habit-id="' + escapeHTML(habit.id) + '" data-state="' + status + '" aria-pressed="' + pressed + '" aria-label="' + escapeHTML(action + '. Current state: ' + statusLabel) + '"><span class="toggle-icon" aria-hidden="true">' + stateIcon + '</span><span>' + (status === 'done' ? 'Done' : status === 'missed' ? 'Missed' : 'Not recorded') + '</span></button>' + controls + '</div>';
  }

  function renderDaily() {
    const record = getRecord(selectedDate);
    const spentValue = getSpentValue(selectedDate);
    const spentSynced = expenseTotalsByDate.has(selectedDate);
    const stats = getDailyStats(selectedDate);
    const applicable = getApplicableHabits(selectedDate);
    const custom = applicable.filter((habit) => habit.custom);
    const waterTarget = data.settings.waterTarget;
    const waterProgress = record.water == null ? 0 : Math.min(100, Math.round(record.water * 100 / waterTarget));
    const sleepValue = record.sleep ? sleepMinutes(record.sleep.start, record.sleep.wake) : null;
    const duration = sleepValue == null ? 'Add both times to calculate duration.' : formatDuration(sleepValue) + ' recorded';
    const percent = stats.percent == null ? 0 : stats.percent;
    const sleep = record.sleep || { start: '', wake: '' };
    const completeLabel = stats.recorded ? stats.percent + '%' : '—';
    const recordCount = stats.recorded ? '<strong>' + stats.completed + '</strong> complete <span>·</span> <strong>' + stats.recorded + '</strong> recorded' : 'No checklist entries recorded yet';
    const selectedLabel = selectedDate === todayISO() ? 'Today' : 'Selected date';
    let html = '<div class="daily-head"><p class="daily-kicker">' + selectedLabel + '</p><div class="daily-title-row"><h2 id="daily-title">' + escapeHTML(formatLongDate(selectedDate)) + '</h2><span class="daily-completion">' + completeLabel + (stats.recorded ? ' complete' : '') + '</span></div><div class="daily-progress-track" aria-hidden="true"><span style="width:' + percent + '%"></span></div><div class="daily-counts">' + recordCount + '</div></div>';
    html += '<section class="daily-section" aria-labelledby="daily-habits-title"><div class="daily-section-head"><h3 class="daily-section-title" id="daily-habits-title">Daily checklist</h3><span class="daily-section-label">Unmarked items become missed at midnight</span></div><div class="habit-list">' + STANDARD_HABITS.map((habit) => renderHabitRow(habit, record)).join('') + '</div></section>';
    html += '<section class="daily-section" aria-labelledby="daily-special-title"><div class="daily-section-head"><h3 class="daily-section-title" id="daily-special-title">SPECIAL</h3><span class="daily-section-label">Custom habits</span></div>' + (custom.length ? '<div class="habit-list">' + custom.map((habit) => renderHabitRow(habit, record)).join('') + '</div>' : '<p class="empty-custom">Personal routines you add will appear here.</p>') + '</section>';
    html += '<section class="daily-section" aria-labelledby="daily-measurements-title"><div class="daily-section-head"><h3 class="daily-section-title" id="daily-measurements-title">Daily measures</h3></div><div class="numeric-grid"><div class="number-field"><label for="water-value">Water (L)</label><input id="water-value" type="number" data-field="water" min="0" step="0.01" inputmode="decimal" placeholder="Not recorded" value="' + (record.water == null ? '' : escapeHTML(record.water)) + '"></div><div class="number-field"><label for="weight-value">Weight (kg)</label><input id="weight-value" type="number" data-field="weight" min="0" step="0.1" inputmode="decimal" placeholder="Not recorded" value="' + (record.weight == null ? '' : escapeHTML(record.weight)) + '"></div><div class="number-field"><label for="spent-value">Spent (₹)</label><input id="spent-value" type="number" data-field="spent" min="0" step="0.01" inputmode="decimal" placeholder="Not recorded" value="' + (spentValue == null ? '' : escapeHTML(spentValue)) + '"' + (spentSynced ? ' readonly aria-describedby="spent-source-note"' : ' aria-describedby="spent-source-note"') + '><span class="field-note" id="spent-source-note">' + (spentSynced ? 'From Expense Tracker' : 'Add expenses to auto-fill') + '</span></div><div class="water-progress"><span>' + (record.water == null ? 'Water target ' + formatNumber(waterTarget) + ' L' : formatNumber(record.water) + ' / ' + formatNumber(waterTarget) + ' L') + '</span><span class="water-track"><span style="width:' + waterProgress + '%"></span></span><span>' + (record.water == null ? '—' : waterProgress + '%') + '</span></div></div></section>';
    html += '<section class="daily-section" aria-labelledby="daily-sleep-title"><div class="daily-section-head"><h3 class="daily-section-title" id="daily-sleep-title">Sleep</h3><span class="daily-section-label">Record start and wake time</span></div><div class="sleep-fields"><div class="time-field"><label for="sleep-start">Sleep start</label><input id="sleep-start" type="time" data-field="sleep-start" value="' + escapeHTML(sleep.start) + '"></div><div class="time-field"><label for="sleep-wake">Wake-up</label><input id="sleep-wake" type="time" data-field="sleep-wake" value="' + escapeHTML(sleep.wake) + '"></div></div><p class="sleep-duration' + (sleepValue == null ? ' is-muted' : '') + '" aria-live="polite">' + escapeHTML(duration) + '</p></section>';
    html += '<details class="notes-toggle"><summary>Daily note</summary><div class="notes-field"><label for="daily-notes">Note for this date</label><textarea id="daily-notes" data-field="notes" maxlength="5000" placeholder="Add a note…">' + escapeHTML(record.notes) + '</textarea></div><p class="daily-save-note">Saves automatically on this device.</p></details>';
    els.daily.innerHTML = html;
  }

  function lineChart(containerId, config) {
    const container = document.getElementById(containerId);
    const dates = monthDates(viewMonth);
    const values = dates.map((date, index) => {
      const result = config.getValue(date);
      if (result == null || !Number.isFinite(result.value)) return null;
      return { date, index, value: result.value, label: result.label };
    });
    const populated = values.filter(Boolean);
    const width = 800;
    const height = 215;
    const left = 49;
    const right = 17;
    const top = 15;
    const bottom = 30;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    let min = config.min == null ? (populated.length ? Math.min(...populated.map((point) => point.value)) : 0) : config.min;
    let max = config.max == null ? (populated.length ? Math.max(...populated.map((point) => point.value)) : 1) : config.max;
    if (config.dynamicRange && populated.length) {
      const padding = Math.max((max - min) * .2, config.minPadding || 1);
      min = Math.max(config.floor == null ? 0 : config.floor, Math.floor(min - padding));
      max = Math.ceil(max + padding);
    }
    if (config.reference != null) max = Math.max(max, config.reference * 1.08);
    if (max <= min) max = min + (config.minRange || 1);
    const y = (value) => top + (max - value) / (max - min) * plotHeight;
    const x = (index) => left + (dates.length <= 1 ? 0 : index / (dates.length - 1) * plotWidth);
    let svg = '<svg class="chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHTML(config.title) + ' for ' + escapeHTML(formatMonth(viewMonth)) + '">';
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = min + (max - min) * tick / 4;
      const lineY = y(value);
      svg += '<line class="chart-grid-line" x1="' + left + '" y1="' + lineY.toFixed(2) + '" x2="' + (width - right) + '" y2="' + lineY.toFixed(2) + '"></line><text class="chart-axis-label" x="' + (left - 8) + '" y="' + (lineY + 3).toFixed(2) + '" text-anchor="end">' + escapeHTML(config.formatAxis(value)) + '</text>';
    }
    if (config.reference != null && config.reference >= min && config.reference <= max) {
      const refY = y(config.reference);
      svg += '<line class="chart-target-line" x1="' + left + '" y1="' + refY.toFixed(2) + '" x2="' + (width - right) + '" y2="' + refY.toFixed(2) + '"></line><text class="chart-target-label" x="' + (width - right - 3) + '" y="' + (refY - 5).toFixed(2) + '" text-anchor="end">TARGET ' + escapeHTML(formatNumber(config.reference)) + ' L</text>';
    }
    const labelStep = Math.max(1, Math.ceil(dates.length / 7));
    dates.forEach((date, index) => {
      if (index % labelStep === 0 || index === dates.length - 1) svg += '<text class="chart-axis-label" x="' + x(index).toFixed(2) + '" y="' + (height - 9) + '" text-anchor="middle">' + Number(date.slice(-2)) + '</text>';
    });
    svg += '<text class="chart-axis-caption" transform="translate(12 ' + (top + plotHeight / 2) + ') rotate(-90)" text-anchor="middle">' + escapeHTML(config.axisTitle) + '</text>';
    let path = '';
    let previous = null;
    for (const point of values) {
      if (!point) { previous = null; continue; }
      const command = previous && point.index === previous.index + 1 ? ' L ' : ' M ';
      path += command + x(point.index).toFixed(2) + ' ' + y(point.value).toFixed(2);
      previous = point;
    }
    if (path) svg += '<path class="chart-line' + (config.teal ? ' chart-line-teal' : '') + '" d="' + path + '"></path>';
    for (const point of populated) {
      const label = point.label || (formatLongDate(point.date) + ': ' + config.formatTooltip(point.value));
      svg += '<circle class="chart-point' + (config.teal ? ' chart-point-teal' : '') + '" cx="' + x(point.index).toFixed(2) + '" cy="' + y(point.value).toFixed(2) + '" r="3.5" tabindex="0" aria-label="' + escapeHTML(label) + '"><title>' + escapeHTML(label) + '</title></circle>';
    }
    if (!populated.length) svg += '<text class="chart-axis-label" x="' + (left + plotWidth / 2) + '" y="' + (top + plotHeight / 2) + '" text-anchor="middle">' + escapeHTML(config.emptyText) + '</text>';
    svg += '</svg>';
    container.innerHTML = svg;
  }

  function renderCompletionChart() {
    lineChart('completion-chart', {
      title: 'Daily habit completion',
      min: 0,
      max: 100,
      axisTitle: 'PERCENT',
      formatAxis: (value) => Math.round(value) + '%',
      formatTooltip: (value) => Math.round(value) + '% complete',
      emptyText: 'No checklist habits recorded this month.',
      getValue: (date) => {
        const stats = getDailyStats(date);
        return stats.recorded ? { value: stats.percent, label: formatLongDate(date) + ': ' + stats.percent + '% (' + stats.completed + ' of ' + stats.recorded + ' recorded habits complete)' } : null;
      }
    });
  }

  function renderConsistencyChart() {
    const container = document.getElementById('consistency-chart');
    const rows = getMonthHabitRows(viewMonth);
    const recordedWater = monthDates(viewMonth).map((date) => getRecord(date).water).filter((value) => value != null);
    const waterMet = recordedWater.filter((value) => value >= data.settings.waterTarget).length;
    const allRows = rows.map((row) => ({ name: row.name, recorded: row.recorded, complete: row.completed, percent: row.percent, measure: false }));
    allRows.push({ name: 'Water target met', recorded: recordedWater.length, complete: waterMet, percent: recordedWater.length ? waterMet * 100 / recordedWater.length : null, measure: true });
    const nonEmpty = allRows.some((row) => row.recorded > 0);
    const list = allRows.map((row) => {
      const percent = row.percent == null ? 0 : row.percent;
      const ratio = row.recorded ? row.complete + ' / ' + row.recorded + ' · ' + Math.round(percent) + '%' : 'No entries';
      return '<div class="consistency-row' + (row.measure ? ' is-measure' : '') + '" title="' + escapeHTML(row.name + ': ' + ratio) + '"><span class="consistency-name' + (row.measure ? ' is-measure' : '') + '">' + escapeHTML(row.name) + '</span><span class="consistency-track" aria-hidden="true"><span style="width:' + percent + '%"></span></span><span class="consistency-value">' + escapeHTML(ratio) + '</span></div>';
    }).join('');
    container.innerHTML = (nonEmpty ? list : '<p class="consistency-empty">No checklist or water entries recorded this month. Records will appear here as you add them.</p>') + '<p class="consistency-note">Water uses target days ÷ recorded water days. Weight is shown as measurements in the trend chart.</p>';
  }

  function renderWeightChart() {
    lineChart('weight-chart', {
      title: 'Weight trend',
      dynamicRange: true,
      floor: 0,
      minPadding: 1,
      minRange: 2,
      teal: true,
      axisTitle: 'KG',
      formatAxis: (value) => formatNumber(value, 0),
      formatTooltip: (value) => formatNumber(value) + ' kg',
      emptyText: 'No weight measurements recorded this month.',
      getValue: (date) => {
        const value = getRecord(date).weight;
        return value == null ? null : { value, label: formatLongDate(date) + ': ' + formatNumber(value) + ' kg' };
      }
    });
  }

  function renderSleepChart() {
    const sleepValues = monthDates(viewMonth).map((date) => {
      const sleep = getRecord(date).sleep;
      if (!sleep) return 0;
      const minutes = sleepMinutes(sleep.start, sleep.wake);
      return minutes == null ? 0 : minutes / 60;
    });
    lineChart('sleep-chart', {
      title: 'Sleep duration',
      min: 0,
      max: Math.max(12, ...sleepValues),
      teal: true,
      axisTitle: 'HOURS',
      formatAxis: (value) => formatNumber(value, 0),
      formatTooltip: (value) => formatDuration(Math.round(value * 60)),
      emptyText: 'No complete sleep records this month.',
      getValue: (date) => {
        const sleep = getRecord(date).sleep;
        if (!sleep) return null;
        const minutes = sleepMinutes(sleep.start, sleep.wake);
        return minutes == null ? null : { value: minutes / 60, label: formatLongDate(date) + ': ' + formatDuration(minutes) };
      }
    });
    const sleepEntries = monthDates(viewMonth).map((date) => getRecord(date).sleep).filter(Boolean).map((sleep) => sleepMinutes(sleep.start, sleep.wake)).filter((minutes) => minutes != null);
    const average = sleepEntries.length ? Math.round(sleepEntries.reduce((sum, value) => sum + value, 0) / sleepEntries.length) : null;
    document.getElementById('sleep-summary').textContent = sleepEntries.length ? sleepEntries.length + ' recorded nights · average ' + formatDuration(average) : 'No sleep times recorded this month.';
  }

  function renderWaterChart() {
    document.getElementById('water-target-label').textContent = formatNumber(data.settings.waterTarget) + ' L';
    lineChart('water-chart', {
      title: 'Water intake',
      min: 0,
      max: Math.max(data.settings.waterTarget * 1.25, ...monthDates(viewMonth).map((date) => getRecord(date).water || 0), 1),
      reference: data.settings.waterTarget,
      teal: true,
      axisTitle: 'LITRES',
      formatAxis: (value) => formatNumber(value, 1),
      formatTooltip: (value) => formatNumber(value) + ' L',
      emptyText: 'No water entries recorded this month.',
      getValue: (date) => {
        const value = getRecord(date).water;
        return value == null ? null : { value, label: formatLongDate(date) + ': ' + formatNumber(value) + ' L' };
      }
    });
  }

  function renderInsights() {
    document.getElementById('insights-month').textContent = formatMonth(viewMonth);
    renderCompletionChart();
    renderConsistencyChart();
    renderWeightChart();
    renderSleepChart();
    renderWaterChart();
    const dates = monthDates(viewMonth);
    const counts = {
      completion: dates.filter((date) => getDailyStats(date).recorded > 0).length,
      weight: dates.filter((date) => getRecord(date).weight != null).length,
      sleep: dates.filter((date) => {
        const sleep = getRecord(date).sleep;
        return Boolean(sleep && sleepMinutes(sleep.start, sleep.wake) != null);
      }).length,
      water: dates.filter((date) => getRecord(date).water != null).length,
      consistency: dates.reduce((sum, date) => sum + getDailyStats(date).recorded, 0)
    };
    const visible = {
      'completion-card': counts.completion >= 2,
      'consistency-card': counts.consistency > 0,
      'weight-card': counts.weight >= 2,
      'sleep-card': counts.sleep >= 2,
      'water-card': counts.water >= 2
    };
    Object.entries(visible).forEach(([id, show]) => { document.getElementById(id).hidden = !show; });
    document.getElementById('analytics-empty').hidden = Object.values(visible).some(Boolean);
  }

  function renderAll() {
    if (!els.calendar) return;
    els.month.value = viewMonth;
    els.insightMonth.value = viewMonth;
    els.waterTarget.value = data.settings.waterTarget;
    renderCalendar();
    renderDaily();
    if (els.analyticsDialog.open) renderInsights();
  }

  function setMonth(month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const [year, monthNumber] = month.split('-').map(Number);
    if (monthNumber < 1 || monthNumber > 12) return;
    const day = Math.min(Number(selectedDate.slice(-2)), new Date(year, monthNumber, 0).getDate());
    viewMonth = month;
    selectedDate = year + '-' + pad(monthNumber) + '-' + pad(day);
    renderAll();
  }

  function selectDate(date, restoreFocus) {
    if (!isValidISODate(date)) return;
    selectedDate = date;
    viewMonth = monthOf(date);
    renderAll();
    if (restoreFocus) {
      const button = Array.from(els.calendar.querySelectorAll('[data-date]')).find((element) => element.dataset.date === date);
      if (button) button.focus();
    }
  }

  function updateHabitStatus(date, id) {
    const isClosedDay = date < todayISO() && date >= data.settings.trackingStartDate;
    const record = getOrCreateRecord(date);
    const current = record.habits[id] || (isClosedDay ? 'missed' : null);
    if (isClosedDay) record.habits[id] = current === 'done' ? 'missed' : 'done';
    else if (!current) record.habits[id] = 'done';
    else if (current === 'done') record.habits[id] = 'missed';
    else delete record.habits[id];
    cleanRecord(date);
    saveAndRender('Habit entry saved on this device.');
  }

  function updateNumericField(field, value) {
    if (field === 'spent' && expenseTotalsByDate.has(selectedDate)) {
      renderDaily();
      setMessage('Spent is filled from Expense Tracker for this date.', 'success', false);
      return;
    }
    const numeric = value === '' ? null : Number(value);
    if (numeric !== null && (!Number.isFinite(numeric) || numeric < 0)) {
      setMessage('Enter a valid number that is zero or greater.', 'error', false);
      renderDaily();
      return;
    }
    const record = getOrCreateRecord(selectedDate);
    record[field] = numeric;
    cleanRecord(selectedDate);
    saveAndRender(field === 'spent' ? 'Daily spending saved.' : 'Daily measure saved.');
  }

  function updateSleepField(field, value) {
    const current = getRecord(selectedDate).sleep || { start: '', wake: '' };
    const next = { start: current.start || '', wake: current.wake || '' };
    if (field === 'sleep-start') next.start = value;
    else next.wake = value;
    const record = getOrCreateRecord(selectedDate);
    record.sleep = next.start || next.wake ? next : null;
    cleanRecord(selectedDate);
    saveAndRender('Sleep record saved.');
  }

  function openHabitDialog(habitId) {
    editingHabitId = habitId || null;
    const habit = habitId ? getCustomHabit(habitId) : null;
    els.habitTitle.textContent = habit ? 'Rename habit' : 'Add a habit';
    els.habitCopy.textContent = habit ? 'The new name will also label its saved history.' : 'Make a little room for another routine.';
    els.habitSubmit.textContent = habit ? 'Save name' : 'Add habit';
    els.habitName.value = habit ? habit.name : '';
    els.habitError.textContent = '';
    els.dialog.showModal();
    els.habitName.focus();
  }

  function deleteCustomHabit(habitId) {
    const habit = getCustomHabit(habitId);
    if (!habit || habit.deletedAt) return;
    const accepted = window.confirm('Delete “' + habit.name + '” from future tracking? Its saved history will remain available.');
    if (!accepted) return;
    habit.deletedAt = todayISO();
    const saved = persistData();
    if (saved) setMessage('Habit deleted. Its recorded history has been kept.', 'success', false);
    renderAll();
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'habitos-habits-' + todayISO() + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('All habit records and settings exported as a JSON backup.', 'success', false);
  }

  function csvCell(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
  }

  function downloadText(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCSV() {
    const custom = data.customHabits;
    const habits = STANDARD_HABITS.map((habit) => ({ id: habit.id, label: habit.name }))
      .concat(custom.map((habit) => ({ id: habit.id, label: 'SPECIAL: ' + habit.name })));
    const headers = ['date'].concat(habits.map((habit) => habit.label), [
      'water_l', 'weight_kg', 'spent_inr', 'sleep_start', 'sleep_wake', 'notes'
    ]);
    const rows = Array.from(new Set(Object.keys(data.records).concat(Array.from(expenseTotalsByDate.keys())))).sort().map((date) => {
      const record = getRecord(date);
      return [date].concat(habits.map((habit) => record.habits[habit.id] || ''), [
        record.water, record.weight, getSpentValue(date),
        record.sleep ? record.sleep.start : '', record.sleep ? record.sleep.wake : '', record.notes
      ]);
    });
    const content = '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    downloadText(content, 'text/csv;charset=utf-8', 'habitos-habits-' + todayISO() + '.csv');
    setMessage(rows.length ? 'All ' + rows.length + ' saved habit dates exported as CSV.' : 'An empty CSV template was exported; no habit dates are recorded yet.', 'success', false);
  }

  async function importBackup(file) {
    if (!file) return;
    let checked;
    try {
      checked = validateData(JSON.parse(await file.text()));
    } catch (error) {
      setMessage('This file is not valid JSON. Your current records were left unchanged.', 'error', false);
      return;
    }
    if (!checked.ok) {
      setMessage(checked.message + ' Your current records were left unchanged.', 'error', false);
      return;
    }
    const accepted = window.confirm('Import this backup and replace the tracker data currently saved in this browser? Export your current data first if you may need it.');
    if (!accepted) return;
    data = checked.data;
    storageLocked = false;
    const saved = persistData();
    setMessage(saved ? 'Backup imported and saved on this device.' : 'Backup loaded for this session, but browser storage is unavailable. Export it before closing.', saved ? 'success' : 'error', !saved);
    renderAll();
  }

  function setHistoryRange() {
    const dates = monthDates(viewMonth);
    document.getElementById('history-from').value = dates[0];
    document.getElementById('history-to').value = dates[dates.length - 1];
    renderHistory();
  }

  function renderHistory() {
    const from = document.getElementById('history-from').value;
    const to = document.getElementById('history-to').value;
    const body = document.getElementById('habit-history-body');
    const empty = document.getElementById('habit-history-empty');
    if (!isValidISODate(from) || !isValidISODate(to) || from > to) {
      body.innerHTML = '';
      empty.hidden = false;
      empty.textContent = 'Choose a valid date range.';
      return;
    }
    const dates = Array.from(new Set(Object.keys(data.records).concat(Array.from(expenseTotalsByDate.keys()))))
      .filter((date) => date >= from && date <= to).sort().reverse();
    body.innerHTML = dates.map((date) => {
      const record = getRecord(date);
      const stats = getDailyStats(date);
      const sleep = record.sleep ? sleepMinutes(record.sleep.start, record.sleep.wake) : null;
      const checklist = stats.recorded ? stats.completed + ' of ' + stats.recorded + ' recorded · ' + stats.percent + '%' : 'No checklist entries';
      const spent = getSpentValue(date);
      return '<tr><td class="history-date">' + escapeHTML(formatShortDate(date)) + '</td><td class="history-status">' + escapeHTML(checklist) + '</td><td>' + (record.water == null ? '—' : escapeHTML(formatNumber(record.water) + ' L')) + '</td><td>' + (record.weight == null ? '—' : escapeHTML(formatNumber(record.weight) + ' kg')) + '</td><td>' + (sleep == null ? '—' : escapeHTML(formatDuration(sleep))) + '</td><td>' + (spent == null ? '—' : '₹' + escapeHTML(formatNumber(spent))) + '</td></tr>';
    }).join('');
    empty.hidden = dates.length > 0;
    empty.textContent = dates.length ? '' : 'No saved tracking records in this date range.';
  }

  function periodMetrics(start, end) {
    const dates = Object.keys(data.records).filter((date) => date >= start && date <= end).sort();
    const checklist = dates.map((date) => getDailyStats(date)).filter((stats) => stats.recorded > 0);
    const waters = dates.map((date) => getRecord(date).water).filter((value) => value != null);
    const weights = dates.map((date) => getRecord(date).weight).filter((value) => value != null);
    const sleeps = dates.map((date) => {
      const sleep = getRecord(date).sleep;
      return sleep ? sleepMinutes(sleep.start, sleep.wake) : null;
    }).filter((value) => value != null);
    const spendingDates = Array.from(new Set(Object.keys(data.records).concat(Array.from(expenseTotalsByDate.keys()))))
      .filter((date) => date >= start && date <= end);
    const spends = spendingDates.map((date) => getSpentValue(date)).filter((value) => value != null);
    const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return {
      recordDays: dates.length,
      checklistDays: checklist.length,
      completion: average(checklist.map((stats) => stats.percent)),
      water: average(waters),
      weight: average(weights),
      sleep: average(sleeps),
      spent: spends.length ? spends.reduce((sum, value) => sum + value, 0) : null
    };
  }

  function comparisonDifference(left, right, digits, suffix, prefix) {
    if (left == null || right == null) return '—';
    const delta = right - left;
    if (Math.abs(delta) < 0.000001) return 'No change';
    const sign = delta > 0 ? '+' : '−';
    return sign + (prefix || '') + formatNumber(Math.abs(delta), digits) + (suffix || '');
  }

  function renderComparison() {
    const startA = document.getElementById('period-a-start').value;
    const endA = document.getElementById('period-a-end').value;
    const startB = document.getElementById('period-b-start').value;
    const endB = document.getElementById('period-b-end').value;
    const error = document.getElementById('comparison-error');
    const results = document.getElementById('habit-comparison-results');
    if (![startA, endA, startB, endB].every(isValidISODate) || startA > endA || startB > endB) {
      error.textContent = 'Choose valid start and end dates for both periods.';
      results.innerHTML = '';
      return;
    }
    error.textContent = '';
    const a = periodMetrics(startA, endA);
    const b = periodMetrics(startB, endB);
    const metrics = [
      ['Dates with saved records', a.recordDays, b.recordDays, 'count', 0, ''],
      ['Days with checklist entries', a.checklistDays, b.checklistDays, 'count', 0, ''],
      ['Average checklist completion', a.completion, b.completion, 'percent', 1, '%'],
      ['Average water', a.water, b.water, 'litres', 2, ' L'],
      ['Average weight', a.weight, b.weight, 'weight', 2, ' kg'],
      ['Average sleep', a.sleep, b.sleep, 'duration', 0, ''],
      ['Recorded spending total', a.spent, b.spent, 'currency', 2, '']
    ];
    const formatMetric = (value, type, digits, suffix) => {
      if (value == null) return 'No records';
      if (type === 'duration') return formatDuration(Math.round(value));
      if (type === 'currency') return '₹' + formatNumber(value, digits);
      return formatNumber(type === 'percent' ? Math.round(value * 10) / 10 : value, digits) + suffix;
    };
    const rows = metrics.map(([label, valueA, valueB, type, digits, suffix]) => {
      const diff = type === 'duration'
        ? (valueA == null || valueB == null ? '—' : comparisonDifference(valueA, valueB, 0, ' min'))
        : type === 'currency'
          ? (valueA == null || valueB == null ? '—' : comparisonDifference(valueA, valueB, digits, '', '₹'))
          : comparisonDifference(valueA, valueB, digits, suffix);
      return '<tr><th scope="row">' + escapeHTML(label) + '</th><td>' + escapeHTML(formatMetric(valueA, type, digits, suffix)) + '</td><td>' + escapeHTML(formatMetric(valueB, type, digits, suffix)) + '</td><td>' + escapeHTML(diff) + '</td></tr>';
    }).join('');
    results.innerHTML = '<div class="history-table-wrap"><table class="comparison-table"><thead><tr><th>Measure</th><th>Period A<br>' + escapeHTML(formatShortDate(startA) + ' – ' + formatShortDate(endA)) + '</th><th>Period B<br>' + escapeHTML(formatShortDate(startB) + ' – ' + formatShortDate(endB)) + '</th><th>B − A</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function setComparisonDefaults() {
    const current = monthDates(viewMonth);
    const [year, month] = viewMonth.split('-').map(Number);
    const previousMonth = new Date(year, month - 2, 1, 12);
    const previousKey = previousMonth.getFullYear() + '-' + pad(previousMonth.getMonth() + 1);
    const previous = monthDates(previousKey);
    document.getElementById('period-a-start').value = previous[0];
    document.getElementById('period-a-end').value = previous[previous.length - 1];
    document.getElementById('period-b-start').value = current[0];
    document.getElementById('period-b-end').value = current[current.length - 1];
    renderComparison();
  }

  function renderReadingView() {
    const reading = data.reading;
    const setup = els.readingSetup;
    const status = els.readingStatus;
    const form = els.readingForm;
    const card = document.getElementById('reading-book-card');
    const message = document.getElementById('reading-status-message');
    const finish = document.getElementById('finish-reading');
    if (reading.preference === 'unknown') {
      setup.hidden = false;
      status.hidden = true;
      form.hidden = true;
      return;
    }
    if (reading.preference === 'yes' && !reading.book) {
      setup.hidden = true;
      status.hidden = true;
      form.hidden = true;
      return;
    }
    setup.hidden = true;
    status.hidden = false;
    form.hidden = true;
    if (reading.book) {
      message.textContent = 'Current book';
      card.hidden = false;
      card.innerHTML = '<h3 class="reading-book-title">' + escapeHTML(reading.book.title) + '</h3>' + (reading.book.author ? '<p class="reading-book-meta">' + escapeHTML(reading.book.author) + '</p>' : '') + '<span class="reading-book-status">' + (reading.book.status === 'finished' ? 'Finished' : 'Reading now') + '</span>';
      finish.hidden = reading.book.status === 'finished';
      document.getElementById('edit-reading').hidden = false;
      document.getElementById('stop-reading').hidden = false;
    } else {
      message.textContent = 'Not currently reading. HabitOS will not ask again unless you reopen this tracker.';
      card.hidden = true;
      finish.hidden = true;
      document.getElementById('edit-reading').hidden = false;
      document.getElementById('stop-reading').hidden = true;
    }
  }

  function openReadingTracker() {
    renderReadingView();
    if (data.reading.preference === 'yes' && !data.reading.book) {
      els.readingForm.hidden = false;
      els.readingTitle.focus();
    } else {
      els.readingSetup.hidden = data.reading.preference !== 'unknown';
      els.readingStatus.hidden = data.reading.preference === 'unknown';
    }
    els.readingDialog.showModal();
  }

  function saveReadingPreference(preference) {
    if (preference === 'no') data.reading = { preference: 'no', book: null };
    else data.reading = { preference: 'yes', book: data.reading.book };
    const saved = persistData();
    setMessage(saved ? 'Reading preference saved on this device.' : 'Preference saved for this session; browser storage is unavailable.', saved ? 'success' : 'error', !saved);
    renderReadingView();
    if (preference === 'yes' && !data.reading.book) {
      els.readingForm.hidden = false;
      els.readingTitle.value = '';
      els.readingAuthor.value = '';
      els.readingTitle.focus();
    }
  }

  function saveReadingBook(event) {
    event.preventDefault();
    const title = els.readingTitle.value.trim();
    const author = els.readingAuthor.value.trim();
    if (!title) { document.getElementById('reading-error').textContent = 'Enter the book title.'; return; }
    const bookStatus = data.reading.book ? data.reading.book.status : 'reading';
    data.reading = { preference: 'yes', book: { title, author, status: bookStatus } };
    const saved = persistData();
    setMessage(saved ? 'Book saved.' : 'Book saved for this session; browser storage is unavailable.', saved ? 'success' : 'error', !saved);
    renderReadingView();
  }

  function markBookFinished() {
    if (!data.reading.book) return;
    data.reading.book.status = 'finished';
    const saved = persistData();
    setMessage(saved ? 'Book marked as finished.' : 'Book marked as finished for this session; browser storage is unavailable.', saved ? 'success' : 'error', !saved);
    renderReadingView();
  }

  function stopReading() {
    data.reading = { preference: 'no', book: null };
    const saved = persistData();
    setMessage(saved ? 'Reading preference updated. You can change it any time.' : 'Preference updated for this session; browser storage is unavailable.', saved ? 'success' : 'error', !saved);
    renderReadingView();
  }

  function onCalendarKeydown(event) {
    const current = event.target.closest('[data-date]');
    if (!current) return;
    let next = null;
    const date = dateFromISO(current.dataset.date);
    if (event.key === 'ArrowLeft') date.setDate(date.getDate() - 1);
    else if (event.key === 'ArrowRight') date.setDate(date.getDate() + 1);
    else if (event.key === 'ArrowUp') date.setDate(date.getDate() - 7);
    else if (event.key === 'ArrowDown') date.setDate(date.getDate() + 7);
    else if (event.key === 'Home') date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    else if (event.key === 'End') date.setDate(date.getDate() + (6 - ((date.getDay() + 6) % 7)));
    else return;
    event.preventDefault();
    next = localISO(date);
    selectDate(next, true);
  }

  els.calendar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (button) selectDate(button.dataset.date, true);
  });
  els.calendar.addEventListener('keydown', onCalendarKeydown);
  els.daily.addEventListener('click', (event) => {
    const toggle = event.target.closest('.habit-toggle');
    if (toggle) { updateHabitStatus(selectedDate, toggle.dataset.habitId); return; }
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'add-custom') openHabitDialog(null);
    else if (action.dataset.action === 'rename') openHabitDialog(action.dataset.habitId);
    else if (action.dataset.action === 'delete') deleteCustomHabit(action.dataset.habitId);
  });
  els.daily.addEventListener('change', (event) => {
    const field = event.target.dataset.field;
    if (field === 'water' || field === 'weight' || field === 'spent') updateNumericField(field, event.target.value);
    else if (field === 'sleep-start' || field === 'sleep-wake') updateSleepField(field, event.target.value);
  });
  els.daily.addEventListener('input', (event) => {
    if (event.target.dataset.field !== 'notes') return;
    const record = getOrCreateRecord(selectedDate);
    record.notes = event.target.value;
    cleanRecord(selectedDate);
    finalizeMissedDays(false);
    persistData();
  });
  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = els.habitName.value.trim();
    if (!name) { els.habitError.textContent = 'Enter a name for this habit.'; return; }
    const duplicate = data.customHabits.some((habit) => habit.id !== editingHabitId && habit.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) { els.habitError.textContent = 'A custom habit with that name already exists.'; return; }
    if (editingHabitId) {
      const habit = getCustomHabit(editingHabitId);
      if (habit) habit.name = name;
    } else {
      data.customHabits.push({ id: makeId(), name, createdAt: selectedDate, deletedAt: null });
      if (selectedDate < data.settings.trackingStartDate) data.settings.trackingStartDate = selectedDate;
    }
    els.dialog.close();
    saveAndRender(editingHabitId ? 'Habit renamed. Its history is still connected.' : 'Custom habit added.');
    editingHabitId = null;
  });
  document.getElementById('cancel-habit-dialog').addEventListener('click', () => els.dialog.close());
  document.getElementById('close-habit-dialog').addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('click', (event) => { if (event.target === els.dialog) els.dialog.close(); });
  document.getElementById('previous-month').addEventListener('click', () => {
    const [year, month] = viewMonth.split('-').map(Number);
    const date = new Date(year, month - 2, 1, 12);
    setMonth(date.getFullYear() + '-' + pad(date.getMonth() + 1));
  });
  document.getElementById('next-month').addEventListener('click', () => {
    const [year, month] = viewMonth.split('-').map(Number);
    const date = new Date(year, month, 1, 12);
    setMonth(date.getFullYear() + '-' + pad(date.getMonth() + 1));
  });
  document.getElementById('current-month').addEventListener('click', () => selectDate(todayISO(), false));
  els.month.addEventListener('change', () => setMonth(els.month.value));
  els.insightMonth.addEventListener('change', () => setMonth(els.insightMonth.value));
  els.waterTarget.addEventListener('change', () => {
    const target = Number(els.waterTarget.value);
    if (!Number.isFinite(target) || target < 0.1 || target > 20) {
      els.waterTarget.value = data.settings.waterTarget;
      setMessage('Set a water target between 0.1 and 20 litres.', 'error', false);
      return;
    }
    data.settings.waterTarget = target;
    saveAndRender('Water target updated.');
  });
  document.getElementById('add-habit').addEventListener('click', () => openHabitDialog(null));
  document.getElementById('export-data').addEventListener('click', exportBackup);
  document.getElementById('export-csv').addEventListener('click', exportCSV);
  document.getElementById('import-data').addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', async () => {
    const file = els.importFile.files && els.importFile.files[0];
    await importBackup(file);
    els.importFile.value = '';
  });

  document.getElementById('view-analytics').addEventListener('click', () => {
    els.analyticsDialog.showModal();
    renderInsights();
  });
  document.getElementById('close-analytics').addEventListener('click', () => els.analyticsDialog.close());
  document.getElementById('compare-periods').addEventListener('click', () => {
    setComparisonDefaults();
    els.comparisonDialog.showModal();
  });
  document.getElementById('close-comparison').addEventListener('click', () => els.comparisonDialog.close());
  ['period-a-start', 'period-a-end', 'period-b-start', 'period-b-end'].forEach((id) => {
    document.getElementById(id).addEventListener('change', renderComparison);
  });
  document.getElementById('view-history').addEventListener('click', () => {
    setHistoryRange();
    els.historyDialog.showModal();
  });
  document.getElementById('close-history').addEventListener('click', () => els.historyDialog.close());
  document.getElementById('history-from').addEventListener('change', renderHistory);
  document.getElementById('history-to').addEventListener('change', renderHistory);
  document.getElementById('reading-tracker').addEventListener('click', openReadingTracker);
  document.getElementById('close-reading').addEventListener('click', () => els.readingDialog.close());
  els.readingDialog.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-reading-choice]');
    if (choice) saveReadingPreference(choice.dataset.readingChoice);
  });
  els.readingForm.addEventListener('submit', saveReadingBook);
  document.getElementById('edit-reading').addEventListener('click', () => {
    if (data.reading.preference === 'no') {
      els.readingStatus.hidden = true;
      els.readingSetup.hidden = false;
      return;
    }
    els.readingForm.hidden = false;
    els.readingTitle.value = data.reading.book ? data.reading.book.title : '';
    els.readingAuthor.value = data.reading.book ? data.reading.book.author : '';
    document.getElementById('reading-error').textContent = '';
    els.readingTitle.focus();
  });
  document.getElementById('cancel-reading-edit').addEventListener('click', () => {
    if (data.reading.book) renderReadingView();
    else els.readingDialog.close();
  });
  document.getElementById('finish-reading').addEventListener('click', markBookFinished);
  document.getElementById('stop-reading').addEventListener('click', stopReading);

  window.addEventListener('storage', (event) => {
    if (event.key !== EXPENSE_STORAGE_KEY && event.key !== null) return;
    refreshExpenseTotals();
    renderAll();
    if (els.historyDialog.open) renderHistory();
    if (els.comparisonDialog.open) renderComparison();
  });

  loadData();
  refreshExpenseTotals();
  finalizeMissedDays();
  renderAll();
  scheduleDayRollover();
})();
