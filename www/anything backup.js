import { supabase } from './supabase-client.js';

(async () => {
  'use strict';

  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    console.error('HabitOS: No active login session.', error);
    return;
  }

  console.log('HabitOS: Supabase session confirmed.');

  const STORAGE_KEY = 'habitos.expenses.v1';
  const DEFAULT_CATEGORIES = [
    'Food & Drinks', 'Transport', 'Groceries', 'Education', 'Health',
    'Shopping', 'Bills & Utilities', 'Entertainment', 'Personal Care', 'Miscellaneous'
  ];
  const PAYMENT_METHODS = ['', 'Cash', 'UPI', 'Card', 'Bank transfer', 'Other'];
  const CHART_COLORS = ['#83c8b7', '#c3e77b', '#82a9d8', '#d7a0c6', '#e4b777', '#82c5d1', '#d8887e', '#a89ad6', '#9fc77f', '#ccaa83'];
  const els = {
    calendar: document.getElementById('calendar-grid'),
    daily: document.getElementById('daily-detail'),
    summaries: document.getElementById('summary-grid'),
    month: document.getElementById('month-picker'),
    message: document.getElementById('storage-message'),
    dialog: document.getElementById('expense-dialog'),
    form: document.getElementById('expense-form'),
    expenseId: document.getElementById('expense-id'),
    description: document.getElementById('expense-description'),
    amount: document.getElementById('expense-amount'),
    date: document.getElementById('expense-date'),
    category: document.getElementById('expense-category'),
    payment: document.getElementById('expense-payment'),
    notes: document.getElementById('expense-notes'),
    formError: document.getElementById('expense-form-error'),
    dialogTitle: document.getElementById('expense-dialog-title'),
    saveExpense: document.getElementById('save-expense'),
    dailyBudgetForm: document.getElementById('daily-budget-form'),
    dailyBudgetInput: document.getElementById('daily-budget-input'),
    dailyBudgetStatus: document.getElementById('daily-budget-status'),
    monthlyBudgetForm: document.getElementById('monthly-budget-form'),
    monthlyBudgetInput: document.getElementById('monthly-budget-input'),
    monthlyBudgetStatus: document.getElementById('monthly-budget-status'),
    historySearch: document.getElementById('history-search'),
    historyCategory: document.getElementById('history-category'),
    historySort: document.getElementById('history-sort'),
    historyBody: document.getElementById('history-body'),
    historyEmpty: document.getElementById('history-empty'),
    categoryInput: document.getElementById('category-input'),
    categoryError: document.getElementById('category-error'),
    importFile: document.getElementById('import-file')
  };

  function pad(value) { return String(value).padStart(2, '0'); }
  function localISO(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function todayISO() { return localISO(new Date()); }
  function monthOf(dateString) { return dateString.slice(0, 7); }
  function dateFromISO(dateString) { return new Date(dateString + 'T12:00:00'); }
  function monthDate(monthString) {
    const parts = monthString.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, 1, 12);
  }
  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function isValidISODate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split('-').map(Number);
    if (parts[0] < 1000 || parts[0] > 9999) return false;
    const date = dateFromISO(value);
    return !Number.isNaN(date.getTime()) && localISO(date) === value;
  }
  function isValidMonth(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return false;
    const parts = value.split('-').map(Number);
    return parts[0] >= 1000 && parts[0] <= 9999 && parts[1] >= 1 && parts[1] <= 12;
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }
  function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
  function hasTwoDecimalPlaces(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && Math.abs(numeric * 100 - Math.round(numeric * 100)) < 0.000001;
  }
  function formatCurrency(value) {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(safe);
  }
  function formatNumber(value, digits) {
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits == null ? 2 : digits }).format(value);
  }
  function formatLongDate(dateString) {
    return new Intl.DateTimeFormat('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(dateFromISO(dateString));
  }
  function formatShortDate(dateString) {
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(dateFromISO(dateString));
  }
  function formatMonth(monthString) {
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(monthDate(monthString));
  }
  function daysInMonth(monthString) {
    const parts = monthString.split('-').map(Number);
    return new Date(parts[0], parts[1], 0).getDate();
  }
  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return 'expense-' + window.crypto.randomUUID();
    return 'expense-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function emptyData() {
    return { version: 1, transactions: [], monthlyBudgets: {}, dailyBudgets: [], categories: [] };
  }
  function validAmount(value, allowZero) {
    return typeof value === 'number' && Number.isFinite(value) && value >= (allowZero ? 0 : 0.01) && value <= 1000000000000;
  }
  function normalizeData(source) {
    if (!isObject(source) || source.version !== 1 || !Array.isArray(source.transactions) ||
        !isObject(source.monthlyBudgets) || !Array.isArray(source.dailyBudgets) || !Array.isArray(source.categories)) {
      throw new Error('This file does not match the HabitOS Expense Tracker backup format.');
    }
    if (source.transactions.length > 20000 || source.dailyBudgets.length > 10000 || source.categories.length > 100) {
      throw new Error('This backup contains more records than HabitOS can safely import.');
    }
    const categories = [];
    const seenCategory = new Set();
    source.categories.forEach((item) => {
      const name = typeof item === 'string' ? item.trim() : '';
      if (!name || name.length > 32) throw new Error('A custom category in this backup is missing or too long.');
      const folded = name.toLocaleLowerCase();
      if (seenCategory.has(folded)) throw new Error('This backup contains duplicate categories.');
      seenCategory.add(folded);
      categories.push(name);
    });
    const transactions = [];
    const seenIds = new Set();
    for (const input of source.transactions) {
      if (!isObject(input) || typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{3,140}$/.test(input.id) || seenIds.has(input.id)) {
        throw new Error('A transaction in this backup has a missing, invalid, or duplicate ID.');
      }
      const description = typeof input.description === 'string' ? input.description.trim() : '';
      const category = typeof input.category === 'string' ? input.category.trim() : '';
      const amount = input.amount;
      if (!description || description.length > 80) throw new Error('A transaction description in this backup is missing or too long.');
      if (!validAmount(amount, false) || !hasTwoDecimalPlaces(amount)) throw new Error('A transaction amount in this backup must be greater than ₹0, use at most two decimal places, and fit the supported range.');
      if (!isValidISODate(input.date)) throw new Error('A transaction date in this backup is invalid.');
      if (!category || category.length > 32) throw new Error('A transaction category in this backup is missing or too long.');
      if (input.paymentMethod != null && !PAYMENT_METHODS.includes(input.paymentMethod)) throw new Error('A payment method in this backup is invalid.');
      if (input.notes != null && (typeof input.notes !== 'string' || input.notes.length > 240)) throw new Error('A transaction note in this backup is invalid or too long.');
      seenIds.add(input.id);
      if (!DEFAULT_CATEGORIES.some((item) => item.toLocaleLowerCase() === category.toLocaleLowerCase()) &&
          !categories.some((item) => item.toLocaleLowerCase() === category.toLocaleLowerCase())) categories.push(category);
      transactions.push({
        id: input.id, description, amount: roundMoney(amount), date: input.date, category,
        paymentMethod: input.paymentMethod || '', notes: input.notes || ''
      });
    }
    const monthlyBudgets = {};
    const budgetMonths = Object.keys(source.monthlyBudgets);
    if (budgetMonths.length > 1200) throw new Error('This backup contains too many monthly budget settings.');
    for (const month of budgetMonths) {
      const amount = source.monthlyBudgets[month];
      if (!isValidMonth(month) || !validAmount(amount, true) || !hasTwoDecimalPlaces(amount)) throw new Error('A monthly budget in this backup is invalid.');
      monthlyBudgets[month] = roundMoney(amount);
    }
    const dailyBudgets = [];
    const seenBudgetDates = new Set();
    for (const item of source.dailyBudgets) {
      if (!isObject(item) || !isValidISODate(item.effectiveDate) || seenBudgetDates.has(item.effectiveDate) ||
          (item.amount !== null && (!validAmount(item.amount, true) || !hasTwoDecimalPlaces(item.amount)))) {
        throw new Error('A daily budget history entry in this backup is invalid.');
      }
      seenBudgetDates.add(item.effectiveDate);
      dailyBudgets.push({ effectiveDate: item.effectiveDate, amount: item.amount === null ? null : roundMoney(item.amount) });
    }
    dailyBudgets.sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate));
    return { version: 1, transactions, monthlyBudgets, dailyBudgets, categories };
  }

  let data = emptyData();
  let storageLocked = false;
  let selectedDate = todayISO();
  let viewMonth = monthOf(selectedDate);
  let messageTimer = 0;

  function announce(message, type) {
    if (!els.message) return;
    els.message.textContent = message;
    els.message.className = 'storage-message is-visible' + (type === 'error' ? ' is-error' : '');
    if (messageTimer) window.clearTimeout(messageTimer);
    if (type !== 'error') messageTimer = window.setTimeout(() => { els.message.className = 'storage-message'; }, 4500);
  }
  function loadData() {
    let raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      storageLocked = true;
      announce('Local browser storage could not be read. This session can be used, but changes cannot be saved until storage is available.', 'error');
      return emptyData();
    }
    if (raw == null) return emptyData();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      storageLocked = true;
      announce('Saved expense data could not be read because it is malformed. Existing browser data was left untouched; import a valid backup before saving new changes.', 'error');
      return emptyData();
    }
    try {
      return normalizeData(parsed);
    } catch (error) {
      storageLocked = true;
      announce('Saved expense data is invalid: ' + (error && error.message ? error.message : 'unknown data error') + ' Existing browser data was left untouched.', 'error');
      return emptyData();
    }
  }
  function saveData() {
    if (storageLocked) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      storageLocked = true;
      announce('This browser could not save to local storage. Your current session remains on screen; export a backup before closing.', 'error');
      return false;
    }
  }
  function persist(message) {
    const saved = saveData();
    if (saved && message) announce(message, 'success');
    renderAll();
    return saved;
  }
  function getAllCategories() {
    const all = DEFAULT_CATEGORIES.slice();
    data.categories.forEach((category) => {
      if (!all.some((item) => item.toLocaleLowerCase() === category.toLocaleLowerCase())) all.push(category);
    });
    return all;
  }
  function monthTransactions(month) {
    return data.transactions.filter((transaction) => monthOf(transaction.date) === month);
  }
  function dateTransactions(date) {
    return data.transactions.filter((transaction) => transaction.date === date);
  }
  function sumTransactions(transactions) {
    return transactions.reduce((sum, transaction) => sum + Math.round(transaction.amount * 100), 0) / 100;
  }
  function dayTotal(date) { return sumTransactions(dateTransactions(date)); }
  function monthTotal(month) { return sumTransactions(monthTransactions(month)); }
  function dailyBudgetAt(date) {
    let amount = null;
    for (const budget of data.dailyBudgets) {
      if (budget.effectiveDate > date) break;
      amount = budget.amount;
    }
    return amount;
  }
  function setDailyBudget(date, amount) {
    const existing = data.dailyBudgets.find((budget) => budget.effectiveDate === date);
    if (existing) existing.amount = amount;
    else data.dailyBudgets.push({ effectiveDate: date, amount });
    data.dailyBudgets.sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate));
  }
  function currentMonthBudget(month) {
    return Object.prototype.hasOwnProperty.call(data.monthlyBudgets, month) ? data.monthlyBudgets[month] : null;
  }
  function renderSummary() {
    const transactions = monthTransactions(viewMonth);
    const selectedDayTransactions = dateTransactions(selectedDate);
    const daySpent = sumTransactions(selectedDayTransactions);
    const dailyBudget = dailyBudgetAt(selectedDate);
    const monthSpent = sumTransactions(transactions);
    const monthlyBudget = currentMonthBudget(viewMonth);
    const amountLine = (budget, spent, label, hasRecordedSpend) => {
      if (budget == null) return '<div class="finance-status is-unset">No ' + label.toLocaleLowerCase() + ' set</div>';
      if (!hasRecordedSpend) return '<div class="finance-status is-unset">Budget balance is unknown until expenses are recorded</div>';
      const difference = roundMoney(budget - spent);
      if (difference < 0) return '<div class="finance-status is-over">' + escapeHTML(formatCurrency(Math.abs(difference))) + ' over the ' + label.toLocaleLowerCase() + ' from recorded expenses</div>';
      if (difference === 0) return '<div class="finance-status is-at">At the ' + label.toLocaleLowerCase() + ' from recorded expenses</div>';
      return '<div class="finance-status is-under">' + escapeHTML(formatCurrency(difference)) + ' remaining against recorded expenses</div>';
    };
    const dayNote = selectedDayTransactions.length ? selectedDayTransactions.length + ' recorded transaction(s)' : 'No transactions recorded · actual spending is unknown';
    const monthNote = transactions.length ? transactions.length + ' recorded transaction(s)' : 'No transactions recorded · actual spending is unknown';
    els.summaries.innerHTML =
      '<section class="finance-block" aria-label="Selected day spending"><div class="finance-heading"><span>Selected day</span><strong>' + escapeHTML(formatLongDate(selectedDate)) + '</strong></div>' +
      '<div class="finance-row"><span>Recorded spending</span><strong class="finance-value">' + escapeHTML(selectedDayTransactions.length ? formatCurrency(daySpent) : '—') + '</strong></div>' +
      '<div class="finance-row"><span>Daily budget</span><strong>' + escapeHTML(dailyBudget == null ? 'Not set' : formatCurrency(dailyBudget)) + '</strong></div>' +
      amountLine(dailyBudget, daySpent, 'daily budget', selectedDayTransactions.length > 0) + '<p class="finance-note">' + escapeHTML(dayNote) + '</p></section>' +
      '<section class="finance-block" aria-label="Monthly spending"><div class="finance-heading"><span>Selected month</span><strong id="summary-month">' + escapeHTML(formatMonth(viewMonth)) + '</strong></div>' +
      '<div class="finance-row"><span>Recorded spending</span><strong class="finance-value">' + escapeHTML(transactions.length ? formatCurrency(monthSpent) : '—') + '</strong></div>' +
      '<div class="finance-row"><span>Monthly budget</span><strong>' + escapeHTML(monthlyBudget == null ? 'Not set' : formatCurrency(monthlyBudget)) + '</strong></div>' +
      amountLine(monthlyBudget, monthSpent, 'monthly budget', transactions.length > 0) + '<p class="finance-note">' + escapeHTML(monthNote) + '</p></section>';
  }
  function dayAriaLabel(date, total, budget, transactions) {
    let text = formatLongDate(date) + '. ';
    text += transactions.length ? 'Recorded spending ' + formatCurrency(total) + '. ' : 'No logged transactions. ';
    if (budget != null && !transactions.length) {
      text += 'Daily budget ' + formatCurrency(budget) + '. No expense entry is recorded; real spending is unknown.';
    } else if (budget != null) {
      const difference = roundMoney(budget - total);
      text += 'Daily budget ' + formatCurrency(budget) + '. ';
      text += difference < 0 ? formatCurrency(Math.abs(difference)) + ' over budget.' : difference === 0 ? 'At budget.' : formatCurrency(difference) + ' under budget.';
    } else text += 'No daily budget set.';
    return text;
  }
  function renderCalendar() {
    const first = monthDate(viewMonth);
    const firstWeekday = (first.getDay() + 6) % 7;
    const numberOfDays = daysInMonth(viewMonth);
    const trailing = (7 - ((firstWeekday + numberOfDays) % 7)) % 7;
    const cells = [];
    for (let index = 0; index < firstWeekday; index += 1) cells.push('<span class="calendar-empty-cell" aria-hidden="true"></span>');
    const today = todayISO();
    for (let day = 1; day <= numberOfDays; day += 1) {
      const date = viewMonth + '-' + pad(day);
      const transactions = dateTransactions(date);
      const total = sumTransactions(transactions);
      const budget = dailyBudgetAt(date);
      const hasLoggedSpend = transactions.length > 0;
      const isOver = hasLoggedSpend && budget != null && total > budget;
      const isUnder = hasLoggedSpend && budget != null && total < budget;
      const isAt = hasLoggedSpend && budget != null && total === budget;
      const classes = ['expense-day'];
      if (date === selectedDate) classes.push('is-selected');
      if (date === today) classes.push('is-today');
      if (isOver) classes.push('is-over');
      if (isUnder) classes.push('is-under');
      if (isAt) classes.push('is-at');
      const title = dayAriaLabel(date, total, budget, transactions);
      cells.push('<button type="button" role="gridcell" class="' + classes.join(' ') + '" data-date="' + date +
        '" aria-label="' + escapeHTML(title) + '" aria-selected="' + String(date === selectedDate) + '" title="' + escapeHTML(title) + '">' +
        '<span class="day-topline"><span class="day-number">' + day + '</span>' + (hasLoggedSpend ? '<i class="day-indicator" aria-hidden="true"></i>' : '') + '</span></button>');
    }
    for (let index = 0; index < trailing; index += 1) cells.push('<span class="calendar-empty-cell" aria-hidden="true"></span>');
    els.calendar.innerHTML = cells.join('');
    els.month.value = viewMonth;
  }
  function expenseActions(transaction) {
    return '<div class="row-actions"><button type="button" class="row-action" data-expense-action="edit" data-id="' + escapeHTML(transaction.id) + '">Edit</button>' +
      '<button type="button" class="row-action delete" data-expense-action="delete" data-id="' + escapeHTML(transaction.id) + '">Delete</button></div>';
  }
  function renderDailyDetail() {
    const transactions = dateTransactions(selectedDate).slice().sort((left, right) => right.id.localeCompare(left.id));
    const rows = transactions.map((transaction) =>
      '<article class="daily-expense-row"><div class="expense-row-main"><div class="expense-row-title">' + escapeHTML(transaction.description) + '</div>' +
      '<div class="expense-row-meta">' + escapeHTML(transaction.category) + (transaction.paymentMethod ? ' · ' + escapeHTML(transaction.paymentMethod) : '') + '</div>' +
      (transaction.notes ? '<p class="expense-row-note">' + escapeHTML(transaction.notes) + '</p>' : '') +
      '</div><div class="expense-row-side"><span class="expense-row-amount">' + escapeHTML(formatCurrency(transaction.amount)) + '</span>' + expenseActions(transaction) + '</div></article>'
    ).join('');
    els.daily.innerHTML =
      '<div class="daily-panel-top"><div><p class="eyebrow"><span class="eyebrow-rule" aria-hidden="true"></span> Transactions</p><h2 id="daily-title">' + escapeHTML(formatLongDate(selectedDate)) + '</h2></div></div>' +
      '<div class="daily-list-heading"><span>Purchases</span><span>' + transactions.length + '</span></div>' +
      (transactions.length ? '<div class="daily-list">' + rows + '</div>' : '<div class="daily-empty"><div><strong>No expenses recorded for this day.</strong>Add one when you are ready. Unlogged spending is not assumed to be zero.</div></div>');
  }
  function budgetDifferenceStatus(budget, spent, label) {
    if (budget == null) return '<span>' + escapeHTML(label) + '</span> · <strong>Set a budget to track progress.</strong>';
    const difference = roundMoney(budget - spent);
    if (difference < 0) return '<span>' + escapeHTML(label) + '</span> · <strong class="is-over">' + escapeHTML(formatCurrency(Math.abs(difference))) + ' over budget.</strong>';
    if (difference === 0) return '<span>' + escapeHTML(label) + '</span> · <strong>Exactly on budget.</strong>';
    return '<span>' + escapeHTML(label) + '</span> · <strong class="is-under">' + escapeHTML(formatCurrency(difference)) + ' remaining.</strong>';
  }
  function renderBudgets() {
    const dailyBudget = dailyBudgetAt(selectedDate);
    const dailySpent = dayTotal(selectedDate);
    const monthlyBudget = currentMonthBudget(viewMonth);
    const monthlySpent = monthTotal(viewMonth);
    document.getElementById('daily-budget-date').textContent = formatShortDate(selectedDate).toUpperCase();
    document.getElementById('monthly-budget-date').textContent = formatMonth(viewMonth).toUpperCase();
    els.dailyBudgetInput.value = dailyBudget == null ? '' : String(dailyBudget);
    els.monthlyBudgetInput.value = monthlyBudget == null ? '' : String(monthlyBudget);
    els.dailyBudgetStatus.innerHTML = dateTransactions(selectedDate).length
      ? '<strong>Recorded spending: ' + escapeHTML(formatCurrency(dailySpent)) + '</strong><br>' + budgetDifferenceStatus(dailyBudget, dailySpent, 'Daily difference')
      : '<strong>No expenses recorded for this date.</strong><br><span>Unlogged spending is unknown; the daily budget balance appears after entries are recorded.</span>';
    let monthlyContent = monthTransactions(viewMonth).length
      ? '<strong>Total recorded this month: ' + escapeHTML(formatCurrency(monthlySpent)) + '</strong><br>' + budgetDifferenceStatus(monthlyBudget, monthlySpent, 'Monthly difference') +
        '<p class="budget-help">Budget balance is based on recorded transactions; unlogged spending is unknown.</p>'
      : '<strong>No expenses recorded for this month.</strong><br><span>Actual budget balance is unknown until expenses are recorded.</span>';
    if (monthlyBudget != null) {
      const isOver = monthlySpent > monthlyBudget;
      const percent = monthlyBudget === 0 ? (monthlySpent > 0 ? 100 : 0) : monthlySpent / monthlyBudget * 100;
      const width = monthlyBudget === 0 ? (monthlySpent > 0 ? 100 : 0) : Math.min(100, percent);
      monthlyContent += '<div class="budget-progress' + (isOver ? ' is-over' : '') + '" role="img" aria-label="' +
        escapeHTML(formatNumber(percent, 1) + '% of monthly budget used' + (isOver ? ', over budget' : '')) + '"><span style="width:' + width.toFixed(1) + '%"></span></div>' +
        '<p class="budget-help">' + escapeHTML(monthlyBudget === 0 && monthlySpent === 0 ? '₹0 budget configured · no recorded expenses.' : formatNumber(percent, 1) + '% of budget used by recorded expenses' + (isOver ? ' · progress is capped and marked over budget.' : '')) + '</p>';
    }
    els.monthlyBudgetStatus.innerHTML = monthlyContent;
  }
  function renderCategoryControls() {
    const categories = getAllCategories();
    const selectedFilter = els.historyCategory.value;
    const selectedCategory = els.category.value;
    els.historyCategory.innerHTML = '<option value="">All categories</option>' + categories.map((category) =>
      '<option value="' + escapeHTML(category) + '">' + escapeHTML(category) + '</option>').join('');
    if (categories.includes(selectedFilter)) els.historyCategory.value = selectedFilter;
    els.category.innerHTML = categories.map((category) =>
      '<option value="' + escapeHTML(category) + '">' + escapeHTML(category) + '</option>').join('');
    if (categories.includes(selectedCategory)) els.category.value = selectedCategory;
    const categoryList = document.getElementById('category-list');
    if (categoryList) categoryList.textContent = 'Available categories: ' + categories.join(', ');
  }
  function categoryTotals(transactions) {
    const map = new Map();
    transactions.forEach((transaction) => {
      const entry = map.get(transaction.category) || { category: transaction.category, cents: 0, count: 0 };
      entry.cents += Math.round(transaction.amount * 100);
      entry.count += 1;
      map.set(transaction.category, entry);
    });
    return Array.from(map.values()).map((entry) => ({
      category: entry.category, total: entry.cents / 100, count: entry.count
    })).sort((left, right) => right.total - left.total || left.category.localeCompare(right.category));
  }
  function renderCategoryChart() {
    const transactions = monthTransactions(viewMonth);
    const totals = categoryTotals(transactions);
    const total = sumTransactions(transactions);
    const chart = document.getElementById('category-chart');
    const legend = document.getElementById('category-legend');
    if (!totals.length) {
      chart.innerHTML = '<div class="chart-empty"><div><strong>No category spending recorded.</strong>Categories appear here after you add expenses for this month.</div></div>';
      legend.innerHTML = '';
      return;
    }
    const circumference = 2 * Math.PI * 72;
    let offset = 0;
    const segments = totals.map((entry, index) => {
      const fraction = total > 0 ? entry.total / total : 0;
      const portion = circumference * fraction;
      const color = CHART_COLORS[index % CHART_COLORS.length];
      const label = entry.category + ': ' + formatCurrency(entry.total) + ', ' + formatNumber(fraction * 100, 1) + '%, ' + entry.count + ' transaction(s)';
      const segment = '<circle class="donut-segment" cx="110" cy="110" r="72" stroke="' + color + '" stroke-dasharray="' +
        portion.toFixed(2) + ' ' + (circumference - portion).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) +
        '" tabindex="0" aria-label="' + escapeHTML(label) + '"><title>' + escapeHTML(label) + '</title></circle>';
      offset += portion;
      return segment;
    }).join('');
    chart.innerHTML = '<svg class="donut-svg" viewBox="0 0 220 220" role="img" aria-label="Recorded spending by category for ' + escapeHTML(formatMonth(viewMonth)) + '">' +
      '<circle class="donut-track" cx="110" cy="110" r="72"></circle>' + segments +
      '<text class="donut-center-total" x="110" y="106">' + escapeHTML(formatCurrency(total)) + '</text><text class="donut-center-label" x="110" y="122">RECORDED TOTAL</text></svg>';
    legend.innerHTML = totals.map((entry, index) => {
      const percent = total > 0 ? entry.total / total * 100 : 0;
      return '<div class="category-legend-row"><i class="category-color" style="background:' + CHART_COLORS[index % CHART_COLORS.length] + '" aria-hidden="true"></i>' +
        '<span class="category-legend-name">' + escapeHTML(entry.category) + '</span><span class="category-legend-value">' + escapeHTML(formatCurrency(entry.total)) + '</span>' +
        '<span class="category-legend-sub">' + escapeHTML(formatNumber(percent, 1) + '% · ' + entry.count + ' transaction(s)') + '</span></div>';
    }).join('');
  }
  function chartEmpty(message, title) {
    return '<div class="chart-empty"><div><strong>' + escapeHTML(title) + '</strong>' + escapeHTML(message) + '</div></div>';
  }
  function renderDailyChart() {
    const transactions = monthTransactions(viewMonth);
    const slot = document.getElementById('daily-chart');
    if (!transactions.length) {
      slot.innerHTML = chartEmpty('Daily trend values will appear after expenses are recorded.', 'No recorded spending for this month.');
      return;
    }
    const days = daysInMonth(viewMonth);
    const values = [];
    const budgets = [];
    for (let day = 1; day <= days; day += 1) {
      const date = viewMonth + '-' + pad(day);
      values.push(dayTotal(date));
      budgets.push(dailyBudgetAt(date));
    }
    const maxValue = Math.max(1, ...values, ...budgets.filter((value) => value != null));
    const width = 760; const height = 240; const left = 59; const right = 12; const top = 13; const bottom = 36;
    const plotWidth = width - left - right; const plotHeight = height - top - bottom;
    const x = (index) => left + (index + 0.5) * plotWidth / days;
    const y = (value) => top + plotHeight - value / maxValue * plotHeight;
    let svg = '<svg class="expense-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Daily recorded expense totals and configured daily budgets for ' + escapeHTML(formatMonth(viewMonth)) + '">';
    for (let tick = 0; tick <= 3; tick += 1) {
      const value = maxValue * tick / 3;
      const yPos = y(value);
      svg += '<line class="expense-grid-line" x1="' + left + '" y1="' + yPos.toFixed(1) + '" x2="' + (width - right) + '" y2="' + yPos.toFixed(1) + '"></line>' +
        '<text class="expense-axis-label" x="' + (left - 7) + '" y="' + (yPos + 3).toFixed(1) + '" text-anchor="end">' + escapeHTML(formatCurrency(value)) + '</text>';
    }
    const barWidth = Math.max(2, Math.min(14, plotWidth / days * .58));
    for (let index = 0; index < days; index += 1) {
      const value = values[index];
      const barHeight = value > 0 ? Math.max(1, plotHeight * value / maxValue) : 2;
      const xPos = x(index) - barWidth / 2;
      const yPos = y(value > 0 ? value : 0) - (value > 0 ? 0 : 1);
      const date = viewMonth + '-' + pad(index + 1);
      const budget = budgets[index];
      const tip = formatLongDate(date) + ': ' + formatCurrency(value) + ' recorded' + (budget == null ? '; daily budget not set' :
        '; daily budget ' + formatCurrency(budget) + '; ' + (value > budget ? formatCurrency(value - budget) + ' over' : value === budget ? 'at budget' : formatCurrency(budget - value) + ' under'));
      svg += '<rect class="expense-bar' + (value === 0 ? ' is-zero' : '') + '" x="' + xPos.toFixed(1) + '" y="' + yPos.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" rx="1" tabindex="0" aria-label="' +
        escapeHTML(tip) + '"><title>' + escapeHTML(tip) + '</title></rect>';
    }
    let budgetPath = '';
    let penDown = false;
    for (let index = 0; index < days; index += 1) {
      if (budgets[index] == null) { penDown = false; continue; }
      budgetPath += (penDown ? ' L ' : ' M ') + x(index).toFixed(1) + ' ' + y(budgets[index]).toFixed(1);
      penDown = true;
    }
    if (budgetPath) {
      svg += '<path class="expense-budget-line" d="' + budgetPath + '"></path>';
      for (let index = 0; index < days; index += 1) {
        if (budgets[index] == null) continue;
        const tip = formatLongDate(viewMonth + '-' + pad(index + 1)) + ': daily budget ' + formatCurrency(budgets[index]);
        svg += '<circle class="expense-budget-dot" cx="' + x(index).toFixed(1) + '" cy="' + y(budgets[index]).toFixed(1) + '" r="2" tabindex="0" aria-label="' + escapeHTML(tip) + '"><title>' + escapeHTML(tip) + '</title></circle>';
      }
    }
    const labelStep = Math.ceil(days / 12);
    for (let index = 0; index < days; index += 1) {
      if (index % labelStep === 0 || index === days - 1) svg += '<text class="expense-axis-label" x="' + x(index).toFixed(1) + '" y="' + (height - 13) + '" text-anchor="middle">' + (index + 1) + '</text>';
    }
    svg += '</svg><div class="chart-key"><span><i aria-hidden="true"></i> Recorded daily total</span>' +
      (budgets.some((value) => value != null) ? '<span><i class="budget-key" aria-hidden="true"></i> Daily budget by effective date</span>' : '') + '</div>';
    slot.innerHTML = svg;
  }
  function budgetComparisonRow(label, spent, budget, period) {
    const maxValue = Math.max(spent, budget == null ? 0 : budget, 1);
    const spentWidth = Math.min(100, spent / maxValue * 100);
    const tick = budget == null ? null : Math.min(100, budget / maxValue * 100);
    const isOver = budget != null && spent > budget;
    let budgetCopy = budget == null ? 'Budget not set' : 'Budget ' + formatCurrency(budget);
    if (budget != null) {
      const difference = roundMoney(budget - spent);
      budgetCopy += difference < 0 ? ' · ' + formatCurrency(Math.abs(difference)) + ' over' : difference === 0 ? ' · at limit' : ' · ' + formatCurrency(difference) + ' left';
    }
    return '<div class="budget-compare-row"><div class="budget-compare-top"><span>' + escapeHTML(label) + '</span><strong>' +
      escapeHTML(formatCurrency(spent) + ' actual') + '</strong></div><div class="budget-compare-track' + (isOver ? ' is-over' : '') + '" role="img" aria-label="' +
      escapeHTML(label + ': ' + formatCurrency(spent) + ' actual; ' + budgetCopy) + '"><span class="actual-fill" style="width:' + spentWidth.toFixed(1) + '%"></span>' +
      (tick == null ? '' : '<i class="budget-tick" style="left:' + tick.toFixed(1) + '%"></i>') + '</div><p class="budget-compare-note">' +
      escapeHTML(period + ' · ' + budgetCopy) + '</p></div>';
  }
  function renderBudgetChart() {
    const daily = dayTotal(selectedDate);
    const dailyBudget = dailyBudgetAt(selectedDate);
    const monthly = monthTotal(viewMonth);
    const monthlyBudget = currentMonthBudget(viewMonth);
    document.getElementById('budget-chart').innerHTML =
      budgetComparisonRow('Selected day · ' + formatShortDate(selectedDate), daily, dailyBudget, 'Daily amounts') +
      budgetComparisonRow('Selected month · ' + formatMonth(viewMonth), monthly, monthlyBudget, 'Monthly amounts') +
      '<p class="budget-compare-note">Actual bars sum recorded transactions; unlogged spending is unknown.</p>';
  }
  function renderComparisonChart() {
    const totals = new Map();
    data.transactions.forEach((transaction) => {
      const month = monthOf(transaction.date);
      totals.set(month, (totals.get(month) || 0) + Math.round(transaction.amount * 100));
    });
    const available = Array.from(totals.entries()).sort((left, right) => left[0].localeCompare(right[0]));
    const slot = document.getElementById('comparison-chart');
    if (!available.length) {
      slot.innerHTML = chartEmpty('A comparison will be available after you record expenses.', 'No historical spending data yet.');
      return;
    }
    const recent = available.slice(-12);
    const maxValue = Math.max(...recent.map((entry) => entry[1]), 1);
    const omitted = available.length > recent.length ? '<p class="budget-compare-note">Showing the latest 12 of ' + available.length + ' recorded months.</p>' : '';
    slot.innerHTML = '<div class="comparison-bar-list">' + recent.map((entry) => {
      const month = entry[0];
      const total = entry[1] / 100;
      const width = Math.max(total > 0 ? 1.5 : 0, total / maxValue * 100);
      return '<div class="comparison-row"><span class="comparison-month">' + escapeHTML(new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(monthDate(month))) +
        '</span><div class="comparison-track" role="img" aria-label="' + escapeHTML(formatMonth(month) + ': ' + formatCurrency(total) + ' recorded') + '"><span style="width:' + width.toFixed(1) + '%"></span></div>' +
        '<span class="comparison-amount">' + escapeHTML(formatCurrency(total)) + '</span></div>';
    }).join('') + '</div>' + (recent.length === 1 ? '<p class="budget-compare-note">One month of actual records is available so far.</p>' : '') + omitted;
  }
  function renderHistory() {
    const from = document.getElementById('history-from').value;
    const to = document.getElementById('history-to').value;
    const rangeValid = (!from || isValidISODate(from)) && (!to || isValidISODate(to)) && (!from || !to || from <= to);
    const matchingDates = data.transactions.filter((transaction) => rangeValid && (!from || transaction.date >= from) && (!to || transaction.date <= to));
    const query = els.historySearch.value.trim().toLocaleLowerCase();
    const category = els.historyCategory.value;
    const sort = els.historySort.value;
    const filtered = matchingDates.filter((transaction) =>
      (!query || transaction.description.toLocaleLowerCase().includes(query)) &&
      (!category || transaction.category === category)
    );
    filtered.sort((left, right) => {
      if (sort === 'date-asc') return left.date.localeCompare(right.date) || left.description.localeCompare(right.description);
      if (sort === 'amount-desc') return right.amount - left.amount || right.date.localeCompare(left.date);
      if (sort === 'amount-asc') return left.amount - right.amount || right.date.localeCompare(left.date);
      return right.date.localeCompare(left.date) || right.id.localeCompare(left.id);
    });
    document.getElementById('history-count').textContent = rangeValid
      ? filtered.length + ' shown · ' + matchingDates.length + ' in range'
      : 'Choose a valid date range';
    els.historyBody.innerHTML = filtered.map((transaction) =>
      '<tr><td class="history-date">' + escapeHTML(formatShortDate(transaction.date)) + '</td>' +
      '<td class="history-description" data-label="Description">' + escapeHTML(transaction.description) + (transaction.notes ? '<span class="history-notes">' + escapeHTML(transaction.notes) + '</span>' : '') + '</td>' +
      '<td data-label="Category"><span class="history-category">' + escapeHTML(transaction.category) + '</span></td>' +
      '<td class="history-payment" data-label="Payment">' + escapeHTML(transaction.paymentMethod || '—') + '</td>' +
      '<td class="history-amount" data-label="Amount">' + escapeHTML(formatCurrency(transaction.amount)) + '</td>' +
      '<td class="history-actions" data-label="Actions">' + expenseActions(transaction) + '</td></tr>'
    ).join('');
    if (!filtered.length) {
      els.historyEmpty.hidden = false;
      if (!rangeValid) els.historyEmpty.textContent = 'Choose valid start and end dates.';
      else if (!matchingDates.length) els.historyEmpty.textContent = 'No expenses are recorded in this date range.';
      else els.historyEmpty.textContent = 'No transactions match this search or category filter.';
    } else {
      els.historyEmpty.hidden = true;
      els.historyEmpty.textContent = '';
    }
  }
  function renderAnalytics() {
    document.getElementById('insights-month').textContent = formatMonth(viewMonth);
    renderCategoryChart();
    renderDailyChart();
    renderBudgetChart();
    renderComparisonChart();
    const transactions = monthTransactions(viewMonth);
    const recordedDates = new Set(transactions.map((transaction) => transaction.date));
    const monthsWithRecords = new Set(data.transactions.map((transaction) => monthOf(transaction.date)));
    const hasBudget = dailyBudgetAt(selectedDate) != null || currentMonthBudget(viewMonth) != null;
    const visible = {
      'category-chart-card': transactions.length > 0,
      'daily-chart-card': recordedDates.size >= 2,
      'budget-chart-card': hasBudget && transactions.length > 0,
      'comparison-chart-card': monthsWithRecords.size >= 2
    };
    Object.entries(visible).forEach(([id, show]) => { document.getElementById(id).hidden = !show; });
    document.getElementById('analytics-empty').hidden = Object.values(visible).some(Boolean);
  }

  function periodExpenseMetrics(start, end) {
    const transactions = data.transactions.filter((transaction) => transaction.date >= start && transaction.date <= end);
    const days = new Set(transactions.map((transaction) => transaction.date));
    return {
      total: sumTransactions(transactions),
      transactions: transactions.length,
      days: days.size,
      averageDay: days.size ? sumTransactions(transactions) / days.size : null,
      averageTransaction: transactions.length ? sumTransactions(transactions) / transactions.length : null
    };
  }

  function setExpenseComparisonDefaults() {
    const current = monthDate(viewMonth);
    const previous = new Date(current.getFullYear(), current.getMonth() - 1, 1, 12);
    const previousMonth = previous.getFullYear() + '-' + pad(previous.getMonth() + 1);
    const previousDays = daysInMonth(previousMonth);
    document.getElementById('period-a-start').value = previousMonth + '-01';
    document.getElementById('period-a-end').value = previousMonth + '-' + pad(previousDays);
    document.getElementById('period-b-start').value = viewMonth + '-01';
    document.getElementById('period-b-end').value = viewMonth + '-' + pad(daysInMonth(viewMonth));
    renderPeriodComparison();
  }

  function renderPeriodComparison() {
    const startA = document.getElementById('period-a-start').value;
    const endA = document.getElementById('period-a-end').value;
    const startB = document.getElementById('period-b-start').value;
    const endB = document.getElementById('period-b-end').value;
    const error = document.getElementById('comparison-error');
    const results = document.getElementById('expense-comparison-results');
    if (![startA, endA, startB, endB].every(isValidISODate) || startA > endA || startB > endB) {
      error.textContent = 'Choose valid start and end dates for both periods.';
      results.innerHTML = '';
      return;
    }
    error.textContent = '';
    const a = periodExpenseMetrics(startA, endA);
    const b = periodExpenseMetrics(startB, endB);
    const rows = [
      ['Recorded spending', formatCurrency(a.total), formatCurrency(b.total), formatCurrency(roundMoney(b.total - a.total))],
      ['Transactions', formatNumber(a.transactions, 0), formatNumber(b.transactions, 0), formatNumber(b.transactions - a.transactions, 0)],
      ['Days with transactions', formatNumber(a.days, 0), formatNumber(b.days, 0), formatNumber(b.days - a.days, 0)],
      ['Average per recorded day', a.averageDay == null ? 'No entries' : formatCurrency(a.averageDay), b.averageDay == null ? 'No entries' : formatCurrency(b.averageDay), a.averageDay == null || b.averageDay == null ? '—' : formatCurrency(roundMoney(b.averageDay - a.averageDay))],
      ['Average transaction', a.averageTransaction == null ? 'No entries' : formatCurrency(a.averageTransaction), b.averageTransaction == null ? 'No entries' : formatCurrency(b.averageTransaction), a.averageTransaction == null || b.averageTransaction == null ? '—' : formatCurrency(roundMoney(b.averageTransaction - a.averageTransaction))]
    ].map(([label, valueA, valueB, delta]) => '<tr><th scope="row">' + escapeHTML(label) + '</th><td>' + escapeHTML(valueA) + '</td><td>' + escapeHTML(valueB) + '</td><td>' + escapeHTML(delta) + '</td></tr>').join('');
    results.innerHTML = '<div class="history-table-wrap"><table class="comparison-table"><thead><tr><th>Measure</th><th>Period A<br>' + escapeHTML(formatShortDate(startA) + ' – ' + formatShortDate(endA)) + '</th><th>Period B<br>' + escapeHTML(formatShortDate(startB) + ' – ' + formatShortDate(endB)) + '</th><th>B − A</th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="budget-compare-note">A positive spending difference means more was recorded in Period B.</p>';
  }

  function renderAll() {
    document.getElementById('insights-month').textContent = formatMonth(viewMonth);
    renderCategoryControls();
    renderSummary();
    renderCalendar();
    renderDailyDetail();
    renderBudgets();
    if (document.getElementById('analytics-dialog').open) renderAnalytics();
    if (document.getElementById('history-dialog').open) renderHistory();
    if (document.getElementById('comparison-dialog').open) renderPeriodComparison();
  }
  function setMonth(month) {
    if (!isValidMonth(month)) return;
    const day = Math.min(Number(selectedDate.slice(-2)), daysInMonth(month));
    viewMonth = month;
    selectedDate = month + '-' + pad(day);
    renderAll();
  }
  function shiftMonth(amount) {
    const date = monthDate(viewMonth);
    date.setMonth(date.getMonth() + amount);
    setMonth(date.getFullYear() + '-' + pad(date.getMonth() + 1));
  }
  function openExpenseDialog(transaction) {
    els.form.reset();
    els.formError.textContent = '';
    renderCategoryControls();
    if (transaction) {
      els.expenseId.value = transaction.id;
      els.description.value = transaction.description;
      els.amount.value = String(transaction.amount);
      els.date.value = transaction.date;
      els.category.value = transaction.category;
      els.payment.value = transaction.paymentMethod || '';
      els.notes.value = transaction.notes || '';
      els.dialogTitle.textContent = 'Edit expense';
      els.saveExpense.textContent = 'Save changes';
    } else {
      els.expenseId.value = '';
      els.date.value = selectedDate;
      els.category.value = DEFAULT_CATEGORIES[0];
      els.dialogTitle.textContent = 'Add an expense';
      els.saveExpense.textContent = 'Save expense';
    }
    if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
    else els.dialog.setAttribute('open', '');
    window.setTimeout(() => els.description.focus(), 0);
  }
  function closeExpenseDialog() {
    if (typeof els.dialog.close === 'function') els.dialog.close();
    else els.dialog.removeAttribute('open');
  }
  function findTransaction(id) { return data.transactions.find((transaction) => transaction.id === id) || null; }
  function saveExpense(event) {
    event.preventDefault();
    const description = els.description.value.trim();
    const amountText = els.amount.value.trim();
    const amount = roundMoney(Number(amountText));
    const date = els.date.value;
    const category = els.category.value.trim();
    const paymentMethod = els.payment.value;
    const notes = els.notes.value.trim();
    if (!description) { els.formError.textContent = 'Enter a description for this expense.'; els.description.focus(); return; }
    if (!amountText || !Number.isFinite(amount) || amount <= 0 || amount > 1000000000000 || !hasTwoDecimalPlaces(amountText)) {
      els.formError.textContent = 'Enter an amount greater than ₹0, using up to two decimal places.';
      els.amount.focus(); return;
    }
    if (!isValidISODate(date)) { els.formError.textContent = 'Choose a valid expense date.'; els.date.focus(); return; }
    if (!category || !getAllCategories().includes(category)) { els.formError.textContent = 'Choose a valid category.'; els.category.focus(); return; }
    if (!PAYMENT_METHODS.includes(paymentMethod)) { els.formError.textContent = 'Choose a valid payment method.'; els.payment.focus(); return; }
    const id = els.expenseId.value;
    const updated = { id: id || makeId(), description, amount, date, category, paymentMethod, notes };
    if (id) {
      const index = data.transactions.findIndex((transaction) => transaction.id === id);
      if (index < 0) { els.formError.textContent = 'This expense could not be found. Close and reopen the form.'; return; }
      data.transactions[index] = updated;
    } else data.transactions.push(updated);
    selectedDate = date;
    viewMonth = monthOf(date);
    closeExpenseDialog();
    persist(id ? 'Expense updated.' : 'Expense saved.');
  }
  function deleteExpense(id) {
    const transaction = findTransaction(id);
    if (!transaction) return;
    const confirmed = window.confirm('Delete "' + transaction.description + '" for ' + formatCurrency(transaction.amount) + '? This cannot be undone.');
    if (!confirmed) return;
    data.transactions = data.transactions.filter((item) => item.id !== id);
    persist('Expense deleted.');
  }
  function handleExpenseAction(event) {
    const button = event.target.closest('[data-expense-action]');
    if (!button) return;
    const transaction = findTransaction(button.dataset.id);
    if (!transaction) return;
    if (button.dataset.expenseAction === 'edit') openExpenseDialog(transaction);
    if (button.dataset.expenseAction === 'delete') deleteExpense(transaction.id);
  }
  function saveDailyBudget(event) {
    event.preventDefault();
    const text = els.dailyBudgetInput.value.trim();
    if (text === '') {
      setDailyBudget(selectedDate, null);
      persist('Daily budget cleared from ' + formatShortDate(selectedDate) + '; earlier budget history is preserved.');
      return;
    }
    const amount = roundMoney(Number(text));
    if (!Number.isFinite(amount) || !validAmount(amount, true) || !hasTwoDecimalPlaces(text)) {
      announce('Enter a valid daily budget of ₹0 or more.', 'error');
      els.dailyBudgetInput.focus();
      return;
    }
    setDailyBudget(selectedDate, amount);
    persist('Daily budget saved from ' + formatShortDate(selectedDate) + '.');
  }
  function saveMonthlyBudget(event) {
    event.preventDefault();
    const text = els.monthlyBudgetInput.value.trim();
    if (text === '') {
      delete data.monthlyBudgets[viewMonth];
      persist('Monthly budget removed for ' + formatMonth(viewMonth) + '.');
      return;
    }
    const amount = roundMoney(Number(text));
    if (!Number.isFinite(amount) || !validAmount(amount, true) || !hasTwoDecimalPlaces(text)) {
      announce('Enter a valid monthly budget of ₹0 or more.', 'error');
      els.monthlyBudgetInput.focus();
      return;
    }
    data.monthlyBudgets[viewMonth] = amount;
    persist('Monthly budget saved for ' + formatMonth(viewMonth) + '.');
  }
  function addCategory(event) {
    event.preventDefault();
    const name = els.categoryInput.value.trim();
    els.categoryError.textContent = '';
    if (!name) { els.categoryError.textContent = 'Enter a category name.'; return; }
    if (name.length > 32) { els.categoryError.textContent = 'Use 32 characters or fewer.'; return; }
    if (getAllCategories().some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      els.categoryError.textContent = 'That category already exists.';
      return;
    }
    data.categories.push(name);
    els.categoryInput.value = '';
    persist('Custom category added.');
  }
  function exportData() {
    try {
      const content = JSON.stringify(data, null, 2);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'habitos-expenses-' + todayISO() + '.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      announce('All transactions, budgets, and custom categories exported as a JSON backup.', 'success');
    } catch (error) {
      announce('The expense backup could not be exported in this browser.', 'error');
    }
  }
  function csvCell(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
  }
  function exportCSV() {
    const rows = [[
      'record_type', 'date', 'transaction_id', 'amount_inr', 'description', 'category', 'payment_method', 'notes',
      'budget_type', 'budget_period', 'budget_amount_inr'
    ]];
    data.transactions.slice().sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id)).forEach((transaction) => {
      rows.push(['expense', transaction.date, transaction.id, transaction.amount, transaction.description, transaction.category,
        transaction.paymentMethod, transaction.notes, '', '', '']);
    });
    data.dailyBudgets.forEach((budget) => rows.push(['daily_budget', '', '', '', '', '', '', '', 'daily', budget.effectiveDate, budget.amount]));
    Object.keys(data.monthlyBudgets).sort().forEach((month) => rows.push(['monthly_budget', '', '', '', '', '', '', '', 'monthly', month, data.monthlyBudgets[month]]));
    data.categories.forEach((category) => rows.push(['custom_category', '', '', '', '', category, '', '', '', '', '']));
    const content = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    try {
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'habitos-expenses-' + todayISO() + '.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const recordCount = data.transactions.length + data.dailyBudgets.length + Object.keys(data.monthlyBudgets).length + data.categories.length;
      announce(recordCount ? 'All saved transactions, budgets, and custom categories exported as CSV.' : 'An empty CSV template was exported; there are no saved expenses or budgets yet.', 'success');
    } catch (error) {
      announce('The expense CSV could not be exported in this browser.', 'error');
    }
  }
  function importDataFile(file) {
    if (!file) return;
    if (file.size > 5000000) { announce('This JSON file is larger than the 5 MB import limit.', 'error'); return; }
    const reader = new FileReader();
    reader.onerror = () => announce('The selected backup could not be read.', 'error');
    reader.onload = () => {
      let candidate;
      try {
        const parsed = JSON.parse(String(reader.result));
        const payload = isObject(parsed) && parsed.data ? parsed.data : parsed;
        candidate = normalizeData(payload);
      } catch (error) {
        announce(error && error.message ? error.message : 'The selected JSON file is invalid.', 'error');
        return;
      }
      const confirmed = window.confirm('Importing this backup will replace the current Expense Tracker records, budgets, and custom categories. Habit Tracker data is separate. Continue?');
      if (!confirmed) return;
      data = candidate;
      storageLocked = false;
      persist('Expense backup imported.');
    };
    reader.readAsText(file);
  }

  data = loadData();
  renderAll();

  document.getElementById('previous-month').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => shiftMonth(1));
  document.getElementById('current-month').addEventListener('click', () => {
    selectedDate = todayISO();
    viewMonth = monthOf(selectedDate);
    renderAll();
  });
  els.month.addEventListener('change', () => setMonth(els.month.value));
  els.calendar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (!button) return;
    selectedDate = button.dataset.date;
    renderAll();
  });
  els.calendar.addEventListener('keydown', (event) => {
    const button = event.target.closest('[data-date]');
    if (!button) return;
    let offset = 0;
    if (event.key === 'ArrowLeft') offset = -1;
    else if (event.key === 'ArrowRight') offset = 1;
    else if (event.key === 'ArrowUp') offset = -7;
    else if (event.key === 'ArrowDown') offset = 7;
    else if (event.key === 'Home') offset = -((dateFromISO(button.dataset.date).getDay() + 6) % 7);
    else if (event.key === 'End') offset = 6 - ((dateFromISO(button.dataset.date).getDay() + 6) % 7);
    else return;
    event.preventDefault();
    const nextDate = dateFromISO(button.dataset.date);
    nextDate.setDate(nextDate.getDate() + offset);
    selectedDate = localISO(nextDate);
    viewMonth = monthOf(selectedDate);
    renderAll();
    const nextButton = Array.from(els.calendar.querySelectorAll('[data-date]')).find((item) => item.dataset.date === selectedDate);
    if (nextButton) nextButton.focus();
  });
  document.getElementById('add-expense').addEventListener('click', () => openExpenseDialog(null));
  document.getElementById('manage-budgets').addEventListener('click', () => {
    renderBudgets();
    document.getElementById('budget-dialog').showModal();
  });
  document.getElementById('close-budget-dialog').addEventListener('click', () => document.getElementById('budget-dialog').close());
  document.getElementById('manage-categories').addEventListener('click', () => {
    renderCategoryControls();
    document.getElementById('category-dialog').showModal();
  });
  document.getElementById('close-category-dialog').addEventListener('click', () => document.getElementById('category-dialog').close());
  document.getElementById('view-analytics').addEventListener('click', () => {
    document.getElementById('analytics-dialog').showModal();
    renderAnalytics();
  });
  document.getElementById('close-analytics').addEventListener('click', () => document.getElementById('analytics-dialog').close());
  document.getElementById('compare-periods').addEventListener('click', () => {
    setExpenseComparisonDefaults();
    document.getElementById('comparison-dialog').showModal();
  });
  document.getElementById('close-comparison').addEventListener('click', () => document.getElementById('comparison-dialog').close());
  ['period-a-start', 'period-a-end', 'period-b-start', 'period-b-end'].forEach((id) => {
    document.getElementById(id).addEventListener('change', renderPeriodComparison);
  });
  document.getElementById('view-history').addEventListener('click', () => {
    renderHistory();
    document.getElementById('history-dialog').showModal();
  });
  document.getElementById('close-history').addEventListener('click', () => document.getElementById('history-dialog').close());
  els.daily.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add-date]');
    if (addButton) { selectedDate = addButton.dataset.addDate; renderAll(); openExpenseDialog(null); return; }
    handleExpenseAction(event);
  });
  els.historyBody.addEventListener('click', handleExpenseAction);
  els.form.addEventListener('submit', saveExpense);
  document.getElementById('close-expense-dialog').addEventListener('click', closeExpenseDialog);
  document.getElementById('cancel-expense-dialog').addEventListener('click', closeExpenseDialog);
  document.getElementById('daily-budget-form').addEventListener('submit', saveDailyBudget);
  document.getElementById('monthly-budget-form').addEventListener('submit', saveMonthlyBudget);
  document.getElementById('category-form').addEventListener('submit', addCategory);
  els.historySearch.addEventListener('input', renderHistory);
  els.historyCategory.addEventListener('change', renderHistory);
  els.historySort.addEventListener('change', renderHistory);
  document.getElementById('history-from').addEventListener('change', renderHistory);
  document.getElementById('history-to').addEventListener('change', renderHistory);
  document.getElementById('export-data').addEventListener('click', exportData);
  document.getElementById('export-csv').addEventListener('click', exportCSV);
  document.getElementById('import-data').addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', () => {
    if (els.importFile.files && els.importFile.files[0]) importDataFile(els.importFile.files[0]);
    els.importFile.value = '';
  });
})();
