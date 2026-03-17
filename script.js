// ============================================================
// Casio fx-CG50 Digital Calculator + AI Math Tutor
// ============================================================

// --- Math helpers ---
function factorial(n) {
  if (n < 0 || Math.floor(n) !== n) throw new Error('Need non-negative integer');
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}
function nPr(n, r) { return factorial(n) / factorial(n - r); }
function nCr(n, r) { return factorial(n) / (factorial(r) * factorial(n - r)); }
function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
function median(a) { a = [...a].sort((b, c) => b - c); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
function variance(a) { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length; }
function stdev(a) { return Math.sqrt(variance(a)); }
function sampleVariance(a) { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); }
function sampleStdev(a) { return Math.sqrt(sampleVariance(a)); }

// --- Safe math evaluator ---
function safeEval(expr, vars = {}) {
  let s = expr
    .replace(/\^/g, '**')
    .replace(/π/g, 'PI')
    .replace(/pi/gi, 'PI')
    .replace(/÷/g, '/')
    .replace(/×/g, '*')
    .replace(/Ans/gi, String(state.ans || 0));

  // Handle fraction notation: a⌟b = a/b
  s = s.replace(/⌟/g, '/');

  const ctx = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    log: Math.log10, ln: Math.log, exp: Math.exp,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
    ceil: Math.ceil, floor: Math.floor, round: Math.round,
    PI: Math.PI, E: Math.E,
    factorial, nPr, nCr,
    ...vars
  };

  const fn = new Function(...Object.keys(ctx), `"use strict"; return (${s});`);
  return fn(...Object.values(ctx));
}

function evalFn(fnStr, x) {
  return safeEval(fnStr, { X: x, x: x });
}

// --- State ---
const state = {
  currentApp: 'main-menu',
  runInput: '',
  runHistory: [],
  ans: 0,
  shiftActive: false,
  alphaActive: false,
  fractionMode: false,

  // Graph
  graphFunctions: ['sin(X)', '', '', ''],
  graphColors: ['#e74c3c', '#2980b9', '#27ae60', '#9b59b6'],
  graphWindow: { xMin: -6.3, xMax: 6.3, yMin: -3.1, yMax: 3.1 },
  graphShowEditor: true,
  graphActiveFn: 0,
  traceActive: false,
  traceX: 0,
  traceFnIdx: 0,

  // Stats
  statsData: Array.from({ length: 8 }, () => ['', '']),
  statsShowResults: false,

  // Equation
  eqType: null,

  // Table
  tableShowView: false,

  // AI
  apiKey: localStorage.getItem('calc_api_key') || '',
  chatHistory: [],
};

// --- DOM ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const screens = {
  'main-menu': $('#main-menu'),
  'run': $('#run-screen'),
  'graph': $('#graph-screen'),
  'stats': $('#stats-screen'),
  'equation': $('#equation-screen'),
  'table': $('#table-screen'),
  'convert': $('#convert-screen'),
};

const fkeyBar = $('#fkey-bar');
const runLines = $('#run-lines');
const runInputEl = $('#run-input');
const graphCanvas = $('#graph-canvas');
const graphCtx = graphCanvas.getContext('2d');
const graphCoords = $('#graph-coords');

// ============================================================
// APP SWITCHING
// ============================================================
function switchApp(appName) {
  state.currentApp = appName;
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  if (screens[appName]) screens[appName].classList.remove('hidden');

  if (appName === 'graph') {
    state.graphShowEditor = true;
    $('#graph-editor').classList.remove('hidden');
    $('#graph-view').classList.add('hidden');
    state.traceActive = false;
  }
  if (appName === 'stats') {
    state.statsShowResults = false;
    $('#stats-editor').classList.remove('hidden');
    $('#stats-results').classList.add('hidden');
    initStatsTable();
  }
  if (appName === 'equation') {
    state.eqType = null;
    $('#eq-menu').classList.remove('hidden');
    $('#eq-solver').classList.add('hidden');
  }
  if (appName === 'table') {
    state.tableShowView = false;
    $('#table-setup').classList.remove('hidden');
    $('#table-view').classList.add('hidden');
  }
  if (appName === 'convert') initConverter();

  updateFkeys();
}

// ============================================================
// F-KEY LABELS
// ============================================================
function updateFkeys() {
  fkeyBar.innerHTML = '';
  let labels = [];

  switch (state.currentApp) {
    case 'main-menu': labels = ['', '', '', '', '', '']; break;
    case 'run': labels = ['', '', '', '', '', '']; break;
    case 'graph':
      labels = state.graphShowEditor
        ? ['SEL', 'DEL', 'TYPE', '', '', 'DRAW']
        : ['Trace', 'Zoom', 'V-Win', '', 'G-Solv', 'Edit'];
      break;
    case 'stats':
      labels = state.statsShowResults
        ? ['', '', '', '', '', 'EDIT']
        : ['GRPH', 'CALC', '', 'DEL', 'INS', 'STAT'];
      break;
    case 'equation':
      labels = state.eqType
        ? ['', '', '', '', '', 'SOLV']
        : ['Simul', 'Poly2', 'Poly3', '', '', ''];
      break;
    case 'table':
      labels = state.tableShowView
        ? ['', '', '', '', '', 'SET']
        : ['', '', '', '', '', 'TABL'];
      break;
    case 'convert': labels = ['', '', '', '', '', '']; break;
    default: labels = ['', '', '', '', '', ''];
  }

  labels.forEach(lbl => {
    const el = document.createElement('div');
    el.className = 'fkey-label';
    if (lbl && ['DRAW', 'SOLV', 'TABL', 'STAT'].includes(lbl)) el.className += ' highlight';
    el.textContent = lbl;
    fkeyBar.appendChild(el);
  });
}

// --- Menu clicks ---
$$('.menu-item').forEach(item => {
  item.addEventListener('click', () => switchApp(item.dataset.app));
});

// ============================================================
// RUN MODE
// ============================================================
function renderRunScreen() {
  runLines.innerHTML = '';
  state.runHistory.forEach(entry => {
    const exprLine = document.createElement('div');
    exprLine.className = 'run-line expr';
    exprLine.textContent = entry.expr;
    runLines.appendChild(exprLine);

    const resLine = document.createElement('div');
    resLine.className = 'run-line ' + (entry.error ? 'error' : 'result');
    resLine.textContent = entry.error ? 'Syntax ERROR' : entry.result;
    runLines.appendChild(resLine);
  });
  runInputEl.textContent = state.runInput;
  const display = $('#run-display');
  display.scrollTop = display.scrollHeight;
}

function runExecute() {
  if (!state.runInput.trim()) return;
  try {
    const result = safeEval(state.runInput);
    const formatted = typeof result === 'number'
      ? (Number.isInteger(result) ? String(result) : result.toPrecision(10).replace(/\.?0+$/, ''))
      : String(result);
    state.ans = result;
    state.runHistory.push({ expr: state.runInput, result: formatted });
  } catch {
    state.runHistory.push({ expr: state.runInput, error: true });
  }
  state.runInput = '';
  renderRunScreen();
}

// ============================================================
// GRAPH MODE
// ============================================================
function drawGraph() {
  const canvas = graphCanvas;
  const dpr = window.devicePixelRatio || 1;
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  const ctx = graphCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = rect.width;
  const h = rect.height;
  const { xMin, xMax, yMin, yMax } = state.graphWindow;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  const xToPixel = x => (x - xMin) / (xMax - xMin) * w;
  const yToPixel = y => h - (y - yMin) / (yMax - yMin) * h;

  // Grid
  ctx.strokeStyle = '#e8e8e0';
  ctx.lineWidth = 0.5;
  const xStep = niceStep((xMax - xMin) / 6);
  const yStep = niceStep((yMax - yMin) / 4);

  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    const px = xToPixel(x);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
  }
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    const py = yToPixel(y);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  const ox = xToPixel(0), oy = yToPixel(0);
  if (ox >= 0 && ox <= w) { ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, h); ctx.stroke(); }
  if (oy >= 0 && oy <= h) { ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(w, oy); ctx.stroke(); }

  // Tick labels
  ctx.fillStyle = '#999';
  ctx.font = '8px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    if (Math.abs(x) < xStep * 0.01) continue;
    ctx.fillText(fmtNum(x), xToPixel(x), Math.max(10, Math.min(h - 2, oy + 11)));
  }
  ctx.textAlign = 'right';
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    if (Math.abs(y) < yStep * 0.01) continue;
    ctx.fillText(fmtNum(y), Math.max(18, Math.min(w - 2, ox - 3)), yToPixel(y) + 3);
  }

  // Plot functions
  state.graphFunctions.forEach((fnStr, idx) => {
    if (!fnStr.trim()) return;
    ctx.strokeStyle = state.graphColors[idx];
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    let prevPy = null;

    for (let px = 0; px <= w; px += 0.5) {
      const x = xMin + (px / w) * (xMax - xMin);
      try {
        const y = evalFn(fnStr, x);
        const py = yToPixel(y);
        if (!isFinite(y) || Math.abs(py) > h * 10) { started = false; prevPy = null; continue; }
        // Detect discontinuities (like tan)
        if (started && prevPy !== null && Math.abs(py - prevPy) > h * 0.8) {
          started = false;
        }
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
        prevPy = py;
      } catch { started = false; prevPy = null; }
    }
    ctx.stroke();
  });

  // Trace cursor
  if (state.traceActive) {
    const fnStr = state.graphFunctions[state.traceFnIdx];
    if (fnStr) {
      try {
        const y = evalFn(fnStr, state.traceX);
        if (isFinite(y)) {
          const px = xToPixel(state.traceX);
          const py = yToPixel(y);
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = state.graphColors[state.traceFnIdx];
          ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.stroke();
          graphCoords.textContent = `X=${fmtNum(state.traceX)}  Y=${fmtNum(y)}`;
        }
      } catch { graphCoords.textContent = `X=${fmtNum(state.traceX)}  Y=ERROR`; }
    }
  }
}

function niceStep(rough) {
  const p = Math.pow(10, Math.floor(Math.log10(rough)));
  const r = rough / p;
  if (r <= 1) return p;
  if (r <= 2) return 2 * p;
  if (r <= 5) return 5 * p;
  return 10 * p;
}

function fmtNum(n) {
  if (Math.abs(n) < 1e-10) return '0';
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(2);
  return parseFloat(n.toPrecision(6)).toString();
}

function showGraphView() {
  state.graphFunctions[0] = $('#fn-y1').value;
  state.graphFunctions[1] = $('#fn-y2').value;
  state.graphFunctions[2] = $('#fn-y3').value;
  state.graphFunctions[3] = $('#fn-y4').value;
  state.graphShowEditor = false;
  $('#graph-editor').classList.add('hidden');
  $('#graph-view').classList.remove('hidden');
  graphCoords.textContent = '';
  state.traceActive = false;
  updateFkeys();
  requestAnimationFrame(() => drawGraph());
}

function showGraphEditor() {
  state.graphShowEditor = true;
  state.traceActive = false;
  $('#graph-editor').classList.remove('hidden');
  $('#graph-view').classList.add('hidden');
  updateFkeys();
}

// Graph mouse interaction
graphCanvas.addEventListener('mousemove', e => {
  if (!state.traceActive) return;
  const rect = graphCanvas.getBoundingClientRect();
  state.traceX = state.graphWindow.xMin + ((e.clientX - rect.left) / rect.width) * (state.graphWindow.xMax - state.graphWindow.xMin);
  drawGraph();
});

graphCanvas.addEventListener('click', e => {
  if (state.currentApp !== 'graph' || state.graphShowEditor) return;
  if (!state.traceActive) {
    state.traceActive = true;
    state.traceFnIdx = state.graphFunctions.findIndex(f => f.trim());
    if (state.traceFnIdx < 0) state.traceFnIdx = 0;
    const rect = graphCanvas.getBoundingClientRect();
    state.traceX = state.graphWindow.xMin + ((e.clientX - rect.left) / rect.width) * (state.graphWindow.xMax - state.graphWindow.xMin);
    updateFkeys();
    drawGraph();
  }
});

graphCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
  const gw = state.graphWindow;
  const cx = (gw.xMin + gw.xMax) / 2, cy = (gw.yMin + gw.yMax) / 2;
  const hw = (gw.xMax - gw.xMin) / 2 * factor, hh = (gw.yMax - gw.yMin) / 2 * factor;
  gw.xMin = cx - hw; gw.xMax = cx + hw;
  gw.yMin = cy - hh; gw.yMax = cy + hh;
  drawGraph();
}, { passive: false });

// ============================================================
// STATISTICS
// ============================================================
function initStatsTable() {
  const tbody = $('#stats-body');
  tbody.innerHTML = '';
  state.statsData.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="font-size:9px;color:#888;width:20px">${i + 1}</td>
      <td><input data-stats="${i}-0" value="${row[0]}" type="number"></td>
      <td><input data-stats="${i}-1" value="${row[1]}" type="number"></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      const [r, c] = inp.dataset.stats.split('-').map(Number);
      state.statsData[r][c] = inp.value;
    });
  });
}

function computeStats() {
  const list1 = [], list2 = [];
  state.statsData.forEach(row => {
    if (row[0] !== '') list1.push(Number(row[0]));
    if (row[1] !== '') list2.push(Number(row[1]));
  });

  const out = $('#stats-output');
  if (list1.length === 0) { out.innerHTML = '<span class="stat-label">No data entered</span>'; return; }

  let html = '<span class="stat-label">1-Variable Stats (List 1)</span><br>';
  html += `  x̄ = ${fmtNum(mean(list1))}<br>`;
  html += `  Σx = ${fmtNum(list1.reduce((a, b) => a + b, 0))}<br>`;
  html += `  Σx² = ${fmtNum(list1.reduce((a, b) => a + b * b, 0))}<br>`;
  html += `  σx = ${fmtNum(stdev(list1))}<br>`;
  if (list1.length > 1) html += `  sx = ${fmtNum(sampleStdev(list1))}<br>`;
  html += `  n = ${list1.length}<br>`;
  html += `  min = ${fmtNum(Math.min(...list1))}<br>`;
  html += `  med = ${fmtNum(median(list1))}<br>`;
  html += `  max = ${fmtNum(Math.max(...list1))}<br>`;

  if (list2.length > 0 && list1.length === list2.length) {
    const n = list1.length;
    const sx = list1.reduce((a, b) => a + b, 0);
    const sy = list2.reduce((a, b) => a + b, 0);
    const sxx = list1.reduce((a, b) => a + b * b, 0);
    const sxy = list1.reduce((a, b, i) => a + b * list2[i], 0);
    const syy = list2.reduce((a, b) => a + b * b, 0);
    const b1 = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const b0 = (sy - b1 * sx) / n;
    const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    html += '<br><span class="stat-label">Linear Regression</span><br>';
    html += `  a = ${fmtNum(b0)}<br>  b = ${fmtNum(b1)}<br>`;
    html += `  r = ${fmtNum(r)}<br>  r² = ${fmtNum(r * r)}<br>`;
  }
  out.innerHTML = html;
}

function showStatsResults() {
  $$('[data-stats]').forEach(inp => {
    const [r, c] = inp.dataset.stats.split('-').map(Number);
    state.statsData[r][c] = inp.value;
  });
  state.statsShowResults = true;
  $('#stats-editor').classList.add('hidden');
  $('#stats-results').classList.remove('hidden');
  computeStats();
  updateFkeys();
}

function showStatsEditor() {
  state.statsShowResults = false;
  $('#stats-editor').classList.remove('hidden');
  $('#stats-results').classList.add('hidden');
  updateFkeys();
}

// ============================================================
// EQUATION SOLVER
// ============================================================
function showEqSolver(type) {
  state.eqType = type;
  $('#eq-menu').classList.add('hidden');
  $('#eq-solver').classList.remove('hidden');
  const title = $('#eq-title'), fields = $('#eq-fields'), result = $('#eq-result');
  fields.innerHTML = ''; result.innerHTML = '';

  const makeField = name => `<div class="eq-field"><label>${name}=</label><input id="eq-${name}" type="number" value="0"></div>`;
  if (type === 'linear') {
    title.textContent = 'aX + bY = c  /  dX + eY = f';
    fields.innerHTML = ['a','b','c','d','e','f'].map(makeField).join('');
  } else if (type === 'quad') {
    title.textContent = 'ax² + bx + c = 0';
    fields.innerHTML = ['a','b','c'].map(makeField).join('');
  } else if (type === 'cubic') {
    title.textContent = 'ax³ + bx² + cx + d = 0';
    fields.innerHTML = ['a','b','c','d'].map(makeField).join('');
  }
  updateFkeys();
}

function solveEquation() {
  const result = $('#eq-result');
  const val = id => Number($(`#eq-${id}`).value || 0);

  if (state.eqType === 'linear') {
    const a = val('a'), b = val('b'), c = val('c'), d = val('d'), e = val('e'), f = val('f');
    const det = a * e - b * d;
    if (Math.abs(det) < 1e-12) { result.textContent = 'No unique solution (det=0)'; return; }
    result.textContent = `X = ${fmtNum((c * e - b * f) / det)}\nY = ${fmtNum((a * f - c * d) / det)}`;
  } else if (state.eqType === 'quad') {
    const a = val('a'), b = val('b'), c = val('c');
    if (a === 0) { result.textContent = 'a cannot be 0'; return; }
    const disc = b * b - 4 * a * c;
    if (disc > 0) {
      result.textContent = `x₁ = ${fmtNum((-b + Math.sqrt(disc)) / (2 * a))}\nx₂ = ${fmtNum((-b - Math.sqrt(disc)) / (2 * a))}`;
    } else if (Math.abs(disc) < 1e-12) {
      result.textContent = `x = ${fmtNum(-b / (2 * a))} (double root)`;
    } else {
      const re = -b / (2 * a), im = Math.sqrt(-disc) / (2 * a);
      result.textContent = `x₁ = ${fmtNum(re)} + ${fmtNum(im)}i\nx₂ = ${fmtNum(re)} - ${fmtNum(im)}i`;
    }
  } else if (state.eqType === 'cubic') {
    const a = val('a'), b = val('b'), c = val('c'), d = val('d');
    if (a === 0) { result.textContent = 'a cannot be 0'; return; }
    const roots = solveCubic(a, b, c, d);
    result.textContent = roots.map((r, i) => `x${i + 1} = ${r}`).join('\n');
  }
}

function solveCubic(a, b, c, d) {
  const p = (3 * a * c - b * b) / (3 * a * a);
  const q = (2 * b ** 3 - 9 * a * b * c + 27 * a * a * d) / (27 * a ** 3);
  const disc = q * q / 4 + p ** 3 / 27;
  const off = -b / (3 * a);
  const results = [];

  if (disc > 1e-12) {
    const u = Math.cbrt(-q / 2 + Math.sqrt(disc));
    const v = Math.cbrt(-q / 2 - Math.sqrt(disc));
    results.push(fmtNum(u + v + off));
    const re = -(u + v) / 2 + off, im = Math.sqrt(3) / 2 * (u - v);
    results.push(`${fmtNum(re)} + ${fmtNum(Math.abs(im))}i`);
    results.push(`${fmtNum(re)} - ${fmtNum(Math.abs(im))}i`);
  } else if (Math.abs(disc) < 1e-12) {
    if (Math.abs(q) < 1e-12) { results.push(fmtNum(off)); }
    else { const u = Math.cbrt(-q / 2); results.push(fmtNum(2 * u + off)); results.push(fmtNum(-u + off)); }
  } else {
    const r = Math.sqrt((-p) ** 3 / 27);
    const theta = Math.acos(-q / (2 * r));
    const m = 2 * Math.cbrt(r);
    for (let k = 0; k < 3; k++) results.push(fmtNum(m * Math.cos((theta + 2 * Math.PI * k) / 3) + off));
  }
  return results;
}

// ============================================================
// TABLE
// ============================================================
function generateTable() {
  const fnStr = $('#table-fn').value;
  const start = Number($('#table-start').value);
  const end = Number($('#table-end').value);
  const step = Number($('#table-step').value);
  if (!fnStr || step <= 0 || start >= end) return;

  const tbody = $('#table-body');
  tbody.innerHTML = '';
  for (let x = start; x <= end + step * 0.001; x += step) {
    const tr = document.createElement('tr');
    let y; try { y = fmtNum(evalFn(fnStr, x)); } catch { y = 'ERR'; }
    tr.innerHTML = `<td>${fmtNum(x)}</td><td>${y}</td>`;
    tbody.appendChild(tr);
  }
  state.tableShowView = true;
  $('#table-setup').classList.add('hidden');
  $('#table-view').classList.remove('hidden');
  updateFkeys();
}

// ============================================================
// CONVERTER
// ============================================================
const convUnits = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, ft: 0.3048, in: 0.0254, yd: 0.9144 },
  weight: { kg: 1, g: 0.001, mg: 1e-6, lb: 0.453592, oz: 0.0283495, ton: 1000 },
  temp: { '°C': 'C', '°F': 'F', 'K': 'K' }
};

function initConverter() {
  const cat = $('#conv-category').value;
  const fromSel = $('#conv-from-unit'), toSel = $('#conv-to-unit');
  fromSel.innerHTML = ''; toSel.innerHTML = '';
  Object.keys(convUnits[cat]).forEach(u => {
    fromSel.innerHTML += `<option value="${u}">${u}</option>`;
    toSel.innerHTML += `<option value="${u}">${u}</option>`;
  });
  if (toSel.options.length > 1) toSel.selectedIndex = 1;
  doConvert();
}

function doConvert() {
  const cat = $('#conv-category').value;
  const fromVal = Number($('#conv-from-val').value);
  const fromUnit = $('#conv-from-unit').value, toUnit = $('#conv-to-unit').value;
  let result;
  if (cat === 'temp') {
    let c;
    if (fromUnit === '°C') c = fromVal;
    else if (fromUnit === '°F') c = (fromVal - 32) * 5 / 9;
    else c = fromVal - 273.15;
    if (toUnit === '°C') result = c;
    else if (toUnit === '°F') result = c * 9 / 5 + 32;
    else result = c + 273.15;
  } else {
    result = fromVal * convUnits[cat][fromUnit] / convUnits[cat][toUnit];
  }
  $('#conv-to-val').value = fmtNum(result);
}

$('#conv-category').addEventListener('change', initConverter);
$('#conv-from-val').addEventListener('input', doConvert);
$('#conv-from-unit').addEventListener('change', doConvert);
$('#conv-to-unit').addEventListener('change', doConvert);

// ============================================================
// F-KEY HANDLING
// ============================================================
$$('.fkey').forEach(btn => {
  btn.addEventListener('click', () => handleFkey(Number(btn.dataset.fkey)));
});

function handleFkey(n) {
  const app = state.currentApp;
  if (app === 'graph') {
    if (state.graphShowEditor) {
      if (n === 6) showGraphView();
    } else {
      if (n === 1) {
        state.traceActive = !state.traceActive;
        if (state.traceActive) {
          state.traceX = (state.graphWindow.xMin + state.graphWindow.xMax) / 2;
          state.traceFnIdx = state.graphFunctions.findIndex(f => f.trim());
          if (state.traceFnIdx < 0) state.traceFnIdx = 0;
        }
        drawGraph(); updateFkeys();
      } else if (n === 2) zoomToFit();
      else if (n === 3) { state.graphWindow = { xMin: -6.3, xMax: 6.3, yMin: -3.1, yMax: 3.1 }; drawGraph(); }
      else if (n === 5) graphSolveZeros();
      else if (n === 6) showGraphEditor();
    }
  } else if (app === 'stats') {
    if (state.statsShowResults) { if (n === 6) showStatsEditor(); }
    else { if (n === 6 || n === 2) showStatsResults(); }
  } else if (app === 'equation') {
    if (!state.eqType) { if (n === 1) showEqSolver('linear'); if (n === 2) showEqSolver('quad'); if (n === 3) showEqSolver('cubic'); }
    else { if (n === 6) solveEquation(); }
  } else if (app === 'table') {
    if (state.tableShowView) { if (n === 6) { state.tableShowView = false; $('#table-setup').classList.remove('hidden'); $('#table-view').classList.add('hidden'); updateFkeys(); } }
    else { if (n === 6) generateTable(); }
  }
}

function zoomToFit() {
  let ymin = Infinity, ymax = -Infinity;
  const { xMin, xMax } = state.graphWindow;
  state.graphFunctions.forEach(fnStr => {
    if (!fnStr.trim()) return;
    for (let i = 0; i <= 200; i++) {
      const x = xMin + (i / 200) * (xMax - xMin);
      try { const y = evalFn(fnStr, x); if (isFinite(y)) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); } } catch {}
    }
  });
  if (ymin !== Infinity) {
    const margin = (ymax - ymin) * 0.1 || 1;
    state.graphWindow.yMin = ymin - margin;
    state.graphWindow.yMax = ymax + margin;
    drawGraph();
  }
}

function graphSolveZeros() {
  const fnStr = state.graphFunctions[state.traceFnIdx] || state.graphFunctions.find(f => f.trim());
  if (!fnStr) return;
  const { xMin, xMax } = state.graphWindow;
  const step = (xMax - xMin) / 1000;
  const zeros = [];
  let prevY;

  for (let x = xMin; x <= xMax; x += step) {
    try {
      const y = evalFn(fnStr, x);
      if (prevY !== undefined && isFinite(y) && isFinite(prevY) && prevY * y <= 0) {
        let lo = x - step, hi = x;
        for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (evalFn(fnStr, lo) * evalFn(fnStr, mid) <= 0) hi = mid; else lo = mid; }
        const zx = (lo + hi) / 2;
        if (!zeros.some(z => Math.abs(z - zx) < step * 2)) zeros.push(zx);
      }
      prevY = y;
    } catch { prevY = undefined; }
  }

  if (zeros.length > 0) {
    state.traceActive = true;
    state.traceX = zeros[0];
    graphCoords.textContent = `Zeros: ${zeros.map(z => fmtNum(z)).join(', ')}`;
    drawGraph();
  } else {
    graphCoords.textContent = 'No zeros found in window';
  }
}

// ============================================================
// BUTTON HANDLING
// ============================================================
function handleButtonPress(val, action) {
  const app = state.currentApp;

  if (action === 'menu') { switchApp('main-menu'); return; }

  if (action === 'exit') {
    if (app === 'graph' && !state.graphShowEditor) { showGraphEditor(); return; }
    if (app === 'stats' && state.statsShowResults) { showStatsEditor(); return; }
    if (app === 'equation' && state.eqType) { state.eqType = null; $('#eq-menu').classList.remove('hidden'); $('#eq-solver').classList.add('hidden'); updateFkeys(); return; }
    if (app === 'table' && state.tableShowView) { state.tableShowView = false; $('#table-setup').classList.remove('hidden'); $('#table-view').classList.add('hidden'); updateFkeys(); return; }
    switchApp('main-menu');
    return;
  }

  if (action === 'ac') {
    if (app === 'run') {
      if (state.runInput === '') {
        // Double AC clears history
        state.runHistory = [];
      }
      state.runInput = '';
      renderRunScreen();
    }
    return;
  }

  if (action === 'del') {
    if (app === 'run') {
      const fnMatch = state.runInput.match(/(sin\(|cos\(|tan\(|log\(|ln\(|sqrt\(|abs\(|asin\(|acos\(|atan\(|exp\()$/);
      state.runInput = fnMatch ? state.runInput.slice(0, -fnMatch[0].length) : state.runInput.slice(0, -1);
      renderRunScreen();
    }
    return;
  }

  if (action === 'exe') {
    if (app === 'run') runExecute();
    else if (app === 'graph' && state.graphShowEditor) showGraphView();
    else if (app === 'equation' && state.eqType) solveEquation();
    else if (app === 'table' && !state.tableShowView) generateTable();
    else if (app === 'stats' && !state.statsShowResults) showStatsResults();
    return;
  }

  if (action === 'frac') {
    if (app === 'run') {
      state.runInput += '⌟';
      renderRunScreen();
    }
    return;
  }

  if (action === 'sd') {
    // S⟷D: Try to convert last result decimal ↔ fraction display (simplified)
    if (app === 'run' && state.ans !== 0) {
      const frac = toFraction(state.ans);
      if (frac) {
        const last = state.runHistory[state.runHistory.length - 1];
        if (last && !last.error) {
          last.result = last.result.includes('/') ? fmtNum(state.ans) : frac;
          renderRunScreen();
        }
      }
    }
    return;
  }

  // Value input
  if (val !== undefined && val !== null) {
    if (app === 'run') {
      let v = val;
      // Shift modifications
      if (state.shiftActive) {
        if (v === 'sin(') v = 'asin(';
        else if (v === 'cos(') v = 'acos(';
        else if (v === 'tan(') v = 'atan(';
        else if (v === 'log(') v = '10**(';
        else if (v === 'ln(') v = 'exp(';
        else if (v === '^2') v = 'sqrt(';
        else if (v === '^') v = 'cbrt(';
      }
      // Handle (-) as negative sign
      if (v === '(-)') v = '(-';
      // Handle E
      if (v === 'E') v = '*10**(';

      state.runInput += v;
      renderRunScreen();
    }
    // Reset shift/alpha
    state.shiftActive = false;
    state.alphaActive = false;
    $('#key-shift').classList.remove('active');
    $('#key-alpha').classList.remove('active');
  }
}

// Simple decimal to fraction converter
function toFraction(dec, maxDenom = 10000) {
  if (!isFinite(dec) || Number.isInteger(dec)) return null;
  const sign = dec < 0 ? '-' : '';
  dec = Math.abs(dec);
  let bestNum = 1, bestDen = 1, bestErr = Math.abs(dec - 1);
  for (let d = 1; d <= maxDenom; d++) {
    const n = Math.round(dec * d);
    const err = Math.abs(dec - n / d);
    if (err < bestErr) { bestErr = err; bestNum = n; bestDen = d; }
    if (err < 1e-10) break;
  }
  if (bestDen === 1) return null;
  if (bestErr > 1e-8) return null;
  return `${sign}${bestNum}/${bestDen}`;
}

// Wire up buttons
$$('.key[data-val]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.tagName === 'INPUT') return;
    // Don't double-handle frac button
    if (btn.dataset.action === 'frac') return;
    handleButtonPress(btn.dataset.val, null);
  });
});

$$('.key[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action === 'shift' || action === 'alpha') return; // handled separately
    handleButtonPress(btn.dataset.val || null, action);
  });
});

// SHIFT / ALPHA
$('#key-shift').addEventListener('click', () => {
  state.shiftActive = !state.shiftActive;
  state.alphaActive = false;
  $('#key-shift').classList.toggle('active', state.shiftActive);
  $('#key-alpha').classList.remove('active');
});
$('#key-alpha').addEventListener('click', () => {
  state.alphaActive = !state.alphaActive;
  state.shiftActive = false;
  $('#key-alpha').classList.toggle('active', state.alphaActive);
  $('#key-shift').classList.remove('active');
});

// D-pad
$$('.dpad-btn[data-dir]').forEach(btn => {
  btn.addEventListener('click', () => {
    const dir = btn.dataset.dir;
    const app = state.currentApp;

    if (app === 'graph' && !state.graphShowEditor) {
      if (state.traceActive) {
        const range = state.graphWindow.xMax - state.graphWindow.xMin;
        if (dir === 'left') state.traceX -= range / 100;
        if (dir === 'right') state.traceX += range / 100;
        if (dir === 'up' || dir === 'down') {
          const fns = state.graphFunctions.map((f, i) => f.trim() ? i : -1).filter(i => i >= 0);
          if (fns.length > 1) {
            const ci = fns.indexOf(state.traceFnIdx);
            state.traceFnIdx = fns[(ci + (dir === 'up' ? -1 : 1) + fns.length) % fns.length];
          }
        }
      } else {
        const dx = (state.graphWindow.xMax - state.graphWindow.xMin) * 0.1;
        const dy = (state.graphWindow.yMax - state.graphWindow.yMin) * 0.1;
        if (dir === 'left') { state.graphWindow.xMin -= dx; state.graphWindow.xMax -= dx; }
        if (dir === 'right') { state.graphWindow.xMin += dx; state.graphWindow.xMax += dx; }
        if (dir === 'up') { state.graphWindow.yMin += dy; state.graphWindow.yMax += dy; }
        if (dir === 'down') { state.graphWindow.yMin -= dy; state.graphWindow.yMax -= dy; }
      }
      drawGraph();
    } else if (app === 'run' && dir === 'up' && state.runHistory.length > 0) {
      state.runInput = state.runHistory[state.runHistory.length - 1].expr;
      renderRunScreen();
    }
  });
});

// Equation option clicks
$$('.eq-option').forEach(opt => {
  opt.addEventListener('click', () => showEqSolver(opt.dataset.type));
});

// Graph fn row clicks
$$('.graph-fn-row').forEach(row => {
  row.addEventListener('click', () => {
    $$('.graph-fn-row').forEach(r => r.classList.remove('active'));
    row.classList.add('active');
    state.graphActiveFn = Number(row.dataset.idx);
  });
});

// ============================================================
// KEYBOARD
// ============================================================
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  if (/^[0-9.+\-*/^()]$/.test(e.key)) { e.preventDefault(); handleButtonPress(e.key, null); }
  else if (e.key === 'Enter') { e.preventDefault(); handleButtonPress(null, 'exe'); }
  else if (e.key === 'Escape') { e.preventDefault(); handleButtonPress(null, 'exit'); }
  else if (e.key === 'Backspace') { e.preventDefault(); handleButtonPress(null, 'del'); }
  else if (e.key === 'Delete') { e.preventDefault(); handleButtonPress(null, 'ac'); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); document.querySelector('.dpad-btn[data-dir="left"]').click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); document.querySelector('.dpad-btn[data-dir="right"]').click(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); document.querySelector('.dpad-btn[data-dir="up"]').click(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); document.querySelector('.dpad-btn[data-dir="down"]').click(); }
});

// ============================================================
// AI MATH TUTOR (Claude API)
// ============================================================
const chatMessages = $('#chat-messages');
const chatInput = $('#chat-input');
const chatSendBtn = $('#chat-send');
const apiSetup = $('#api-setup');
const chatContainer = $('#chat-container');
const apiKeyInput = $('#api-key-input');
const sidebar = $('#sidebar');
const sidebarToggle = $('#sidebar-toggle');
const sidebarTab = $('#sidebar-tab');

// Restore API key
if (state.apiKey) {
  apiKeyInput.value = state.apiKey;
  apiSetup.classList.add('hidden');
  chatContainer.classList.remove('hidden');
}

$('#api-key-save').addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  state.apiKey = key;
  localStorage.setItem('calc_api_key', key);
  apiSetup.classList.add('hidden');
  chatContainer.classList.remove('hidden');
});

// Sidebar toggle
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.add('collapsed');
  sidebarTab.classList.remove('hidden');
});
sidebarTab.addEventListener('click', () => {
  sidebar.classList.remove('collapsed');
  sidebarTab.classList.add('hidden');
});

// Send message
chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

async function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg || !state.apiKey) return;

  // Add user message
  appendChatBubble('user', msg);
  chatInput.value = '';
  chatSendBtn.disabled = true;

  // Build context about current calculator state
  let calcContext = `Current mode: ${state.currentApp}`;
  if (state.currentApp === 'run' && state.runHistory.length > 0) {
    const recent = state.runHistory.slice(-3).map(h => `${h.expr} = ${h.error ? 'ERROR' : h.result}`).join('\n');
    calcContext += `\nRecent calculations:\n${recent}`;
  }
  if (state.currentApp === 'graph') {
    const fns = state.graphFunctions.filter(f => f.trim());
    if (fns.length) calcContext += `\nGraphed functions: ${fns.join(', ')}`;
  }

  state.chatHistory.push({ role: 'user', content: msg });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `You are a friendly, patient math tutor helping a student using a Casio fx-CG50 graphing calculator.
Keep responses concise but clear. Use simple language.
When explaining math concepts, use step-by-step reasoning.
You can reference calculator features (graphing, tables, statistics, equations).
Format math expressions clearly. Use Unicode math symbols when helpful (×, ÷, √, π, ², ³, etc).
${calcContext}`,
        messages: state.chatHistory,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const reply = data.content[0].text;
    state.chatHistory.push({ role: 'assistant', content: reply });
    appendChatBubble('assistant', reply);
  } catch (err) {
    appendChatBubble('assistant', `Error: ${err.message}\n\nCheck your API key and try again.`);
    // Remove failed user message from history
    state.chatHistory.pop();
  }

  chatSendBtn.disabled = false;
}

function appendChatBubble(role, text) {
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  div.appendChild(bubble);
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============================================================
// INIT
// ============================================================
switchApp('main-menu');
renderRunScreen();
initConverter();
