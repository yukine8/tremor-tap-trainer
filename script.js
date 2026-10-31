'use strict';

const MEASURE_MS = 10000;
const REST_MS = 60000;
const RECORDS_KEY = 'tremor-tap-records';
const REST_END_KEY = 'tremor-tap-rest-end';

const tapArea = document.getElementById('tap-area');
const statusEl = document.getElementById('status');
const timeEl = document.getElementById('time');
const countEl = document.getElementById('count');
const resultEl = document.getElementById('result');
const resultTpsEl = document.getElementById('result-tps');
const bestEl = document.getElementById('best-tps');
const listEl = document.getElementById('record-list');
const noRecordsEl = document.getElementById('no-records');
const clearBtn = document.getElementById('clear-btn');

let state = 'ready';
let count = 0;
let startPerf = 0;
let startDate = null;
let restEndPerf = 0;

function loadRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(RECORDS_KEY));
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {}
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function renderRecords() {
  const records = loadRecords();
  listEl.textContent = '';
  noRecordsEl.hidden = records.length > 0;
  const best = records.reduce((max, r) => Math.max(max, r.tps), -Infinity);
  bestEl.textContent = records.length ? best.toFixed(2) : '-';
  let bestMarked = false;
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    const tr = document.createElement('tr');
    if (!bestMarked && r.tps === best) {
      tr.className = 'best-row';
      bestMarked = true;
    }
    for (const text of [formatDate(r.startedAt), String(r.taps), r.tps.toFixed(2)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    listEl.appendChild(tr);
  }
}

function setState(next) {
  state = next;
  tapArea.dataset.state = next;
}

function enterReady() {
  setState('ready');
  statusEl.textContent = '準備完了';
  tapArea.textContent = 'タップで計測開始';
  timeEl.textContent = (MEASURE_MS / 1000).toFixed(1);
  count = 0;
  countEl.textContent = '0';
  resultEl.hidden = true;
  try { localStorage.removeItem(REST_END_KEY); } catch {}
}

function startMeasuring() {
  setState('measuring');
  statusEl.textContent = '計測中';
  tapArea.textContent = 'タップ！';
  resultEl.hidden = true;
  count = 0;
  startPerf = performance.now();
  startDate = Date.now();
  requestAnimationFrame(tick);
}

function finishMeasuring() {
  const tps = count / (MEASURE_MS / 1000);
  const records = loadRecords();
  records.push({ startedAt: startDate, taps: count, tps });
  saveRecords(records);
  renderRecords();
  resultTpsEl.textContent = tps.toFixed(2);
  resultEl.hidden = false;
  timeEl.textContent = '0.0';
  const restEnd = Date.now() + REST_MS;
  try { localStorage.setItem(REST_END_KEY, String(restEnd)); } catch {}
  enterResting(REST_MS);
}

function enterResting(remainingMs) {
  setState('resting');
  statusEl.textContent = '休憩中';
  tapArea.textContent = '休憩中…';
  restEndPerf = performance.now() + remainingMs;
  requestAnimationFrame(tick);
}

function tick(now) {
  if (state === 'measuring') {
    const remaining = MEASURE_MS - (now - startPerf);
    if (remaining <= 0) {
      finishMeasuring();
      return;
    }
    timeEl.textContent = (remaining / 1000).toFixed(1);
  } else if (state === 'resting') {
    const remaining = restEndPerf - now;
    if (remaining <= 0) {
      enterReady();
      return;
    }
    timeEl.textContent = Math.ceil(remaining / 1000);
    tapArea.textContent = `休憩中… ${Math.ceil(remaining / 1000)}`;
  } else {
    return;
  }
  requestAnimationFrame(tick);
}

tapArea.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  tapArea.classList.add('active');
  if (state === 'ready') startMeasuring();
  if (state === 'measuring') {
    // 10秒経過後の最終フレーム前に入った入力は数えない
    if (performance.now() - startPerf >= MEASURE_MS) return;
    count++;
    countEl.textContent = count;
  }
});

for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  tapArea.addEventListener(type, () => tapArea.classList.remove('active'));
}

tapArea.addEventListener('contextmenu', (e) => e.preventDefault());

clearBtn.addEventListener('click', () => {
  if (confirm('記録をすべて削除しますか？')) {
    saveRecords([]);
    renderRecords();
  }
});

// 初期化: 休憩中にリロードされた場合は休憩を再開する
renderRecords();
enterReady();
try {
  const remaining = Number(localStorage.getItem(REST_END_KEY)) - Date.now();
  if (remaining > 0 && remaining <= REST_MS) {
    const records = loadRecords();
    const last = records[records.length - 1];
    if (last) {
      resultTpsEl.textContent = last.tps.toFixed(2);
      resultEl.hidden = false;
    }
    enterResting(remaining);
  }
} catch {}
