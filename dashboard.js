// Renders dashboard.html: multi-select combobox filters (AND across Year/Sub-industry/
// Company, OR within each) drive the KPIs, main chart, ranking chart, an optional
// compare panel, and a sortable/groupable/scrollable table. State is mirrored in the
// URL query string. Calculations come from app.js (unchanged).

const SUB_LABEL = {
  'Oil & Gas Storage & Transportation': 'Midstream / pipelines',
  'Oil & Gas Refining & Marketing': 'Refining & marketing',
  'Oil & Gas Exploration & Production': 'Exploration & production',
  'Integrated Oil & Gas': 'Integrated majors',
  'Oil & Gas Equipment & Services': 'Equipment & services',
};

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_CHART_SERIES = 8;

let ALL_ROWS = [];
let ALL_TICKERS = [];
let TICKER_NAME = {};
let SERIES_COLORS = [];

let charts = { main: null, rank: null };
let mainChartMode = null;

let filterState = { years: [], subs: [], tickers: [] }; // empty array = "All" for that category
let sortState = { col: 'ticker', dir: 1 };
let rankMetric = 'avg_annual_return';
let groupBy = 'ticker';
let prevStat = { companies: 0, avgReturn: 0, top: 0, avgVol: 0 };

let yearCombo, subCombo, tickerCombo;

/* ---------------------------------------------------------------- */
/* Color mapping — stable per ticker regardless of selection/order   */
/* ---------------------------------------------------------------- */
function colorForTicker(ticker) {
  if (!SERIES_COLORS.length) return '#22d3ee';
  const idx = ALL_TICKERS.indexOf(ticker);
  return SERIES_COLORS[idx < 0 ? 0 : idx % SERIES_COLORS.length];
}

/* ---------------------------------------------------------------- */
/* URL state — ?years=2020,2022&subs=...&companies=XOM,CVX            */
/* ---------------------------------------------------------------- */
function readStateFromURL() {
  const p = new URLSearchParams(location.search);
  const years = (p.get('years') || '').split(',').filter(Boolean).map(Number);
  const subs = (p.get('subs') || '').split(',').filter(Boolean).map((s) => decodeURIComponent(s));
  const tickers = (p.get('companies') || '').split(',').filter(Boolean);
  return { years, subs, tickers };
}

function writeStateToURL() {
  // Built manually (not via URLSearchParams.toString()) so commas stay literal,
  // e.g. ?years=2020,2022&companies=XOM,CVX instead of a %2C-encoded string.
  const parts = [];
  if (filterState.years.length) parts.push(`years=${filterState.years.join(',')}`);
  if (filterState.subs.length) parts.push(`subs=${filterState.subs.map((s) => encodeURIComponent(s)).join(',')}`);
  if (filterState.tickers.length) parts.push(`companies=${filterState.tickers.join(',')}`);
  const qs = parts.join('&');
  history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}

function afterFilterChange() {
  writeStateToURL();
  render();
}

/* ---------------------------------------------------------------- */
/* Reusable accessible MULTI-select combobox                         */
/* ---------------------------------------------------------------- */
function createMultiCombobox({ prefix, items, allLabel, onChange }) {
  const input = document.getElementById(`${prefix}-input`);
  const listbox = document.getElementById(`${prefix}-listbox`);
  const wrap = document.getElementById(`${prefix}-wrap`);
  const combo = input.closest('.combo');
  const clearBtn = wrap.querySelector('.combo-clear');

  let selected = [];
  let filtered = items;
  let activeIndex = -1;

  const labelOf = (v) => {
    const it = items.find((x) => x.value === v);
    return it ? it.label : String(v);
  };

  function renderChips() {
    wrap.querySelectorAll('.chip').forEach((c) => c.remove());
    const shown = selected.slice(0, 2);
    const rest = selected.slice(2);
    shown.forEach((v) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const label = document.createElement('span');
      label.className = 'chip-label';
      label.textContent = labelOf(v);
      chip.appendChild(label);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-remove';
      btn.setAttribute('aria-label', `Remove ${labelOf(v)}`);
      btn.textContent = '×';
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); toggle(v); });
      chip.appendChild(btn);
      wrap.insertBefore(chip, input);
    });
    if (rest.length) {
      const more = document.createElement('span');
      more.className = 'chip chip-more';
      more.textContent = `+${rest.length} more`;
      more.title = rest.map(labelOf).join(', ');
      wrap.insertBefore(more, input);
    }
    combo.classList.toggle('has-value', selected.length > 0);
    input.placeholder = selected.length ? '' : allLabel;
  }

  function renderOptions(query) {
    const q = query.trim().toLowerCase();
    filtered = !q ? items : items.filter((it) => it.searchText.includes(q));
    listbox.innerHTML = '';

    const actions = document.createElement('li');
    actions.className = 'combo-actions';
    actions.setAttribute('role', 'presentation');
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'combo-action-btn';
    allBtn.textContent = 'Select all';
    allBtn.addEventListener('mousedown', (e) => { e.preventDefault(); selectAll(); });
    const clearAllBtn = document.createElement('button');
    clearAllBtn.type = 'button';
    clearAllBtn.className = 'combo-action-btn';
    clearAllBtn.textContent = 'Clear';
    clearAllBtn.addEventListener('mousedown', (e) => { e.preventDefault(); clearAll(); });
    actions.appendChild(allBtn);
    actions.appendChild(clearAllBtn);
    listbox.appendChild(actions);

    if (filtered.length === 0) {
      const li = document.createElement('li');
      li.className = 'combo-empty';
      li.textContent = 'No matches';
      listbox.appendChild(li);
      return;
    }
    filtered.forEach((it, i) => {
      const isSel = selected.includes(it.value);
      const li = document.createElement('li');
      li.className = 'combo-option' + (isSel ? ' selected' : '');
      li.id = `${prefix}-opt-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', isSel ? 'true' : 'false');
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = '✓';
      li.appendChild(check);
      const labelSpan = document.createElement('span');
      labelSpan.className = 'opt-label';
      labelSpan.textContent = it.label;
      li.appendChild(labelSpan);
      if (it.sub) {
        const subSpan = document.createElement('span');
        subSpan.className = 'tkr';
        subSpan.textContent = it.sub;
        li.appendChild(subSpan);
      }
      li.addEventListener('mousedown', (e) => { e.preventDefault(); toggle(it.value); });
      listbox.appendChild(li);
    });
  }

  function setActive(i) {
    const opts = listbox.querySelectorAll('.combo-option');
    opts.forEach((o) => o.classList.remove('active'));
    activeIndex = Math.max(-1, Math.min(i, opts.length - 1));
    if (activeIndex >= 0) {
      opts[activeIndex].classList.add('active');
      input.setAttribute('aria-activedescendant', opts[activeIndex].id);
      opts[activeIndex].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function open(query) {
    renderOptions(query);
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    activeIndex = -1;
    if (filtered.length > 0) setActive(0);
  }

  function close() {
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function toggle(v) {
    selected = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    input.value = '';
    renderChips();
    if (!listbox.hidden) { renderOptions(''); setActive(0); } else { renderOptions(''); }
    onChange(selected.slice());
  }

  function selectAll() {
    selected = filtered.map((it) => it.value);
    input.value = '';
    renderChips();
    renderOptions('');
    onChange(selected.slice());
  }

  function clearAll() {
    selected = [];
    input.value = '';
    renderChips();
    renderOptions('');
    onChange(selected.slice());
  }

  input.addEventListener('focus', () => open(''));
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (listbox.hidden) open(input.value);
      setActive(activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (listbox.hidden) open(input.value);
      setActive(activeIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!listbox.hidden && activeIndex >= 0 && filtered[activeIndex]) toggle(filtered[activeIndex].value);
    } else if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Backspace' && input.value === '' && selected.length) {
      toggle(selected[selected.length - 1]);
    }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => { if (!listbox.hidden) close(); }, 120);
  });
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) input.focus(); });
  clearBtn.addEventListener('click', () => clearAll());

  renderChips();

  return {
    setSelected(values) { selected = values.slice(); renderChips(); if (!listbox.hidden) renderOptions(input.value); },
    getSelected: () => selected.slice(),
    reset: () => clearAll(),
  };
}

/* ---------------------------------------------------------------- */
/* KPI count-up                                                      */
/* ---------------------------------------------------------------- */
function animateValue(el, from, to, formatFn, duration = 600) {
  if (REDUCED_MOTION) { el.textContent = formatFn(to); return; }
  const start = performance.now();
  const d = to - from;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatFn(from + d * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ---------------------------------------------------------------- */
/* Charts                                                             */
/* ---------------------------------------------------------------- */
function chartColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    muted: s.getPropertyValue('--text-dim').trim(),
    grid: s.getPropertyValue('--border').trim(),
    accent: s.getPropertyValue('--accent').trim(),
    positive: s.getPropertyValue('--positive').trim(),
    negative: s.getPropertyValue('--negative').trim(),
  };
}

function baseOptions(c, yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: REDUCED_MOTION ? false : { duration: 700, easing: 'easeOutCubic' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0d1320',
        borderColor: 'rgba(255,255,255,0.14)',
        borderWidth: 1,
        titleColor: '#e6edf7',
        bodyColor: '#8b98ad',
        padding: 10,
        cornerRadius: 8,
        titleFont: { family: "'Inter', sans-serif", weight: '600' },
        bodyFont: { family: "'JetBrains Mono', monospace" },
      },
    },
    scales: {
      x: { ticks: { color: c.muted, font: { size: 11 } }, grid: { display: false }, border: { color: c.grid } },
      y: {
        ticks: { color: c.muted, font: { size: 11, family: "'JetBrains Mono', monospace" } },
        grid: { color: c.grid },
        border: { display: false },
        title: yLabel ? { display: true, text: yLabel, color: c.muted, font: { size: 11 } } : undefined,
      },
    },
  };
}

function accentAreaGradient(context) {
  const { ctx, chartArea } = context.chart;
  if (!chartArea) return null;
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, 'rgba(34, 211, 238, 0.32)');
  g.addColorStop(1, 'rgba(34, 211, 238, 0)');
  return g;
}

function buildMainChart(mode, c) {
  const type = mode === 'years-grouped' ? 'bar' : 'line';
  const base = baseOptions(c, mode === 'years-grouped' ? 'Avg. annual return (%)' : 'Annual return (%)');
  return new Chart(document.getElementById('chart-main'), {
    type,
    data: { labels: [], datasets: [] },
    options: {
      ...base,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        ...base.plugins,
        legend: {
          display: false,
          position: 'bottom',
          labels: { color: c.muted, boxWidth: 10, boxHeight: 10, font: { size: 11 }, usePointStyle: true, padding: 14 },
        },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const name = ctx.dataset.label ? `${ctx.dataset.label}: ` : '';
              const v = type === 'bar' ? ctx.parsed.y : ctx.parsed.y;
              return v === null ? `${name}no data` : `${name}${fmtPct(v, 1)}`;
            },
          },
        },
      },
    },
  });
}

function initRankChart(c) {
  charts.rank = new Chart(document.getElementById('chart-rank'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: c.accent, borderRadius: 3, maxBarThickness: 14 }] },
    options: {
      ...baseOptions(c, null),
      indexAxis: 'y',
      scales: {
        x: {
          ticks: {
            color: c.muted,
            font: { size: 10 },
            callback: (v) => (rankMetric === 'avg_daily_volume' ? fmtNum(v) : `${v}%`),
          },
          grid: { color: c.grid },
          border: { display: false },
        },
        y: { ticks: { color: c.muted, font: { size: 10, family: "'JetBrains Mono', monospace" } }, grid: { display: false }, border: { color: c.grid } },
      },
      plugins: {
        ...baseOptions(c).plugins,
        tooltip: {
          ...baseOptions(c).plugins.tooltip,
          callbacks: {
            title: (ctx) => (charts.rank._meta ? charts.rank._meta[ctx[0].dataIndex].company_name : ''),
            label: (ctx) => {
              const v = ctx.parsed.x;
              if (rankMetric === 'avg_daily_volume') return `${fmtNum(v)} avg. daily volume`;
              if (rankMetric === 'avg_annual_vol') return `${v.toFixed(1)}% avg. volatility`;
              return `${fmtPct(v, 1)} avg. annual return`;
            },
          },
        },
      },
    },
  });
}

/* ---------------------------------------------------------------- */
/* Filtering + sorting + grouping                                    */
/* ---------------------------------------------------------------- */
function applyFilters() {
  return ALL_ROWS.filter((r) => {
    if (filterState.years.length && !filterState.years.includes(r.year)) return false;
    if (filterState.subs.length && !filterState.subs.includes(r.sub_industry)) return false;
    if (filterState.tickers.length && !filterState.tickers.includes(r.ticker)) return false;
    return true;
  });
}

function sortRows(rows) {
  const { col, dir } = sortState;
  return rows.slice().sort((a, b) => {
    const av = a[col], bv = b[col];
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });
}

function buildRow(r) {
  const tr = document.createElement('tr');
  const retClass = r.annual_return_pct >= 0 ? 'ret-pos' : 'ret-neg';
  tr.innerHTML = `
    <td><span class="color-dot" style="background:${colorForTicker(r.ticker)}"></span>${r.ticker}</td>
    <td>${r.company_name}</td>
    <td><span class="badge">${SUB_LABEL[r.sub_industry] || r.sub_industry}</span></td>
    <td>${r.year}</td>
    <td class="${retClass}">${fmtPct(r.annual_return_pct, 1)}</td>
    <td>${r.annual_volatility_pct.toFixed(1)}%</td>
    <td>${fmtNum(r.avg_daily_volume)}</td>
  `;
  return tr;
}

function renderTable(rows) {
  const tbody = document.querySelector('#data-table tbody');
  tbody.innerHTML = '';
  const sorted = sortRows(rows);

  if (groupBy === 'ticker') {
    sorted.forEach((r) => tbody.appendChild(buildRow(r)));
  } else {
    const order = groupBy === 'sub_industry'
      ? SUB_INDUSTRY_ORDER
      : [...new Set(sorted.map((r) => r.year))].sort((a, b) => a - b);
    const groups = {};
    sorted.forEach((r) => {
      const key = r[groupBy];
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    order.filter((k) => groups[k]).forEach((key) => {
      const grs = groups[key];
      const headerTr = document.createElement('tr');
      headerTr.className = 'group-header';
      const td = document.createElement('td');
      td.colSpan = 7;
      td.textContent = `${groupBy === 'sub_industry' ? (SUB_LABEL[key] || key) : key} — ${grs.length} row${grs.length === 1 ? '' : 's'}`;
      headerTr.appendChild(td);
      tbody.appendChild(headerTr);
      grs.forEach((r) => tbody.appendChild(buildRow(r)));
    });
  }

  document.getElementById('row-count').textContent = `Showing ${rows.length} of ${ALL_ROWS.length} rows`;
  document.querySelectorAll('#data-table thead th').forEach((th) => {
    th.innerHTML = th.textContent.replace(/\s*[▲▼]$/, '');
    if (th.dataset.sort === sortState.col) {
      th.innerHTML += `<span class="arrow">${sortState.dir === 1 ? '▲' : '▼'}</span>`;
    }
  });
}

/* ---------------------------------------------------------------- */
/* Scope label + KPIs                                                */
/* ---------------------------------------------------------------- */
function updateScopeLabel(rows) {
  const el = document.getElementById('scope-label');
  const nCompanies = new Set(rows.map((r) => r.ticker)).size;
  const nYears = new Set(rows.map((r) => r.year)).size;
  el.innerHTML = `Showing <strong>${nCompanies} compan${nCompanies === 1 ? 'y' : 'ies'}</strong> · <strong>${nYears} year${nYears === 1 ? '' : 's'}</strong>`;
}

function resetKPIsToEmpty() {
  const ids = ['stat-companies', 'stat-avgreturn', 'stat-top', 'stat-avgvol'];
  ids.forEach((id) => (document.getElementById(id).textContent = '–'));
  document.getElementById('stat-top-sub').textContent = '';
  document.getElementById('stat-avgreturn').className = 'value';
  document.getElementById('trend-avgreturn').textContent = '';
  prevStat = { companies: 0, avgReturn: 0, top: 0, avgVol: 0 };
}

function renderKPIs(rows) {
  const companiesEl = document.getElementById('stat-companies');
  const returnEl = document.getElementById('stat-avgreturn');
  const topEl = document.getElementById('stat-top');
  const volEl = document.getElementById('stat-avgvol');
  const topSubEl = document.getElementById('stat-top-sub');
  const trendEl = document.getElementById('trend-avgreturn');

  const { nCompanies, avgReturn, avgVol, top } = summaryNumbers(rows);
  returnEl.className = 'value ' + (avgReturn >= 0 ? 'good' : 'critical');
  trendEl.textContent = avgReturn >= 0 ? '▲' : '▼';
  trendEl.className = 'trend ' + (avgReturn >= 0 ? 'good' : 'critical');
  topSubEl.textContent = `(${top.ticker})`;

  animateValue(companiesEl, prevStat.companies, nCompanies, (v) => Math.round(v));
  animateValue(returnEl, prevStat.avgReturn, avgReturn, (v) => fmtPct(v));
  animateValue(topEl, prevStat.top, top.cum_return_pct, (v) => fmtPct(v, 0));
  animateValue(volEl, prevStat.avgVol, avgVol, (v) => `${v.toFixed(1)}%`);

  prevStat = { companies: nCompanies, avgReturn, top: top.cum_return_pct, avgVol };
}

/* ---------------------------------------------------------------- */
/* Main chart: single trend / multi-company lines / grouped bars     */
/* ---------------------------------------------------------------- */
function renderMainChart(rows) {
  const c = chartColors();
  const nSelCompanies = filterState.tickers.length;
  const nSelYears = filterState.years.length;
  const mode = nSelCompanies >= 2 ? 'companies' : (nSelYears >= 2 ? 'years-grouped' : 'single');

  const titleEl = document.getElementById('main-chart-title');
  const noteEl = document.getElementById('main-chart-note');
  noteEl.hidden = true;

  if (mode !== mainChartMode) {
    if (charts.main) charts.main.destroy();
    charts.main = buildMainChart(mode, c);
    mainChartMode = mode;
  }

  if (mode === 'companies') {
    let tickers = filterState.tickers.slice();
    const totalSelected = tickers.length;
    if (tickers.length > MAX_CHART_SERIES) tickers = tickers.slice(0, MAX_CHART_SERIES);
    const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);

    titleEl.textContent = 'Annual return by company, 2019–2025';
    charts.main.data.labels = years.map(String);
    charts.main.data.datasets = tickers.map((t) => {
      const byYear = {};
      rows.filter((r) => r.ticker === t).forEach((r) => { byYear[r.year] = r.annual_return_pct; });
      return {
        label: t,
        data: years.map((y) => (y in byYear ? byYear[y] : null)),
        borderColor: colorForTicker(t),
        backgroundColor: colorForTicker(t),
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        pointRadius: 3,
        pointHoverRadius: 5,
      };
    });
    charts.main.options.plugins.legend.display = true;
    charts.main.update();

    if (totalSelected > MAX_CHART_SERIES) {
      noteEl.hidden = false;
      noteEl.textContent = `Showing ${MAX_CHART_SERIES} of ${totalSelected} selected companies. Narrow the Company filter to compare a different set.`;
    }
  } else if (mode === 'years-grouped') {
    const years = filterState.years.slice().sort((a, b) => a - b);
    const subsSel = filterState.subs.length >= 2 ? filterState.subs : null;

    charts.main.data.labels = years.map(String);
    if (subsSel) {
      titleEl.textContent = 'Average annual return by year and sub-industry';
      const palette = SERIES_COLORS.length ? SERIES_COLORS : [c.accent];
      charts.main.data.datasets = subsSel.map((s, i) => ({
        label: SUB_LABEL[s] || s,
        data: years.map((y) => {
          const subset = rows.filter((r) => r.year === y && r.sub_industry === s);
          return subset.length ? mean(subset.map((r) => r.annual_return_pct)) : null;
        }),
        backgroundColor: palette[i % palette.length],
        borderRadius: 4,
      }));
      charts.main.options.plugins.legend.display = true;
    } else {
      titleEl.textContent = 'Average annual return, selected years';
      const yearly = years.map((y) => {
        const subset = rows.filter((r) => r.year === y);
        return subset.length ? mean(subset.map((r) => r.annual_return_pct)) : 0;
      });
      charts.main.data.datasets = [{
        label: 'Selected years',
        data: yearly,
        backgroundColor: yearly.map((v) => (v >= 0 ? c.positive : c.negative)),
        borderRadius: 4,
      }];
      charts.main.options.plugins.legend.display = false;
    }
    charts.main.update();
  } else {
    const years = yearSummary(rows);
    const single = filterState.tickers.length === 1 ? filterState.tickers[0] : null;
    titleEl.textContent = single
      ? `${TICKER_NAME[single]} annual return, 2019–2025`
      : 'Sector average annual return, 2019–2025';
    charts.main.data.labels = years.map((y) => String(y.year));
    charts.main.data.datasets = [{
      data: years.map((y) => y.avg_return),
      borderColor: c.accent,
      backgroundColor: accentAreaGradient,
      fill: 'origin',
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 3,
      pointBackgroundColor: c.accent,
      pointBorderColor: '#111827',
      pointBorderWidth: 1.5,
      pointHoverRadius: 5,
    }];
    charts.main.options.plugins.legend.display = false;
    charts.main.update();
  }
}

/* ---------------------------------------------------------------- */
/* Ranking chart                                                     */
/* ---------------------------------------------------------------- */
const RANK_METRIC_LABEL = {
  avg_annual_return: 'annual return',
  avg_annual_vol: 'volatility',
  avg_daily_volume: 'avg. daily volume',
};

function renderRankChart(rows) {
  const c = chartColors();
  const companies = companySummary(rows).sort((a, b) => b[rankMetric] - a[rankMetric]);

  document.getElementById('rank-chart-title').textContent = `Companies ranked by ${RANK_METRIC_LABEL[rankMetric]}`;

  charts.rank.data.labels = companies.map((co) => co.ticker);
  charts.rank.data.datasets[0].data = companies.map((co) => co[rankMetric]);
  charts.rank.data.datasets[0].backgroundColor = companies.map((co) => {
    if (rankMetric === 'avg_annual_return') return co[rankMetric] >= 0 ? c.positive : c.negative;
    return c.accent;
  });
  charts.rank._meta = companies;
  charts.rank.update();
}

/* ---------------------------------------------------------------- */
/* Compare panel (2+ companies selected)                             */
/* ---------------------------------------------------------------- */
function renderCompare(rows) {
  const panel = document.getElementById('compare-panel');
  const tickers = filterState.tickers;
  if (tickers.length < 2) { panel.hidden = true; return; }
  panel.hidden = false;

  const companies = companySummary(rows)
    .filter((co) => tickers.includes(co.ticker))
    .sort((a, b) => b.cum_return_pct - a.cum_return_pct);
  const leader = companies[0] ? companies[0].ticker : null;

  const tbody = document.querySelector('#compare-table tbody');
  tbody.innerHTML = '';
  companies.forEach((co) => {
    const tr = document.createElement('tr');
    if (co.ticker === leader) tr.className = 'leader';
    tr.innerHTML = `
      <td><span class="color-dot" style="background:${colorForTicker(co.ticker)}"></span>${co.company_name} (${co.ticker})${co.ticker === leader ? '<span class="leader-tag">Leader</span>' : ''}</td>
      <td>${fmtPct(co.cum_return_pct, 0)}</td>
      <td>${fmtPct(co.avg_annual_return, 1)}</td>
      <td>${co.avg_annual_vol.toFixed(1)}%</td>
      <td>${co.best_year} (${fmtPct(co.best_year_return, 0)})</td>
      <td>${co.worst_year} (${fmtPct(co.worst_year_return, 0)})</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ---------------------------------------------------------------- */
/* Orchestrator                                                      */
/* ---------------------------------------------------------------- */
function render() {
  const rows = applyFilters();
  updateScopeLabel(rows);

  const emptyEl = document.getElementById('empty-state');
  const resultsEl = document.getElementById('results');

  if (rows.length === 0) {
    emptyEl.hidden = false;
    resultsEl.hidden = true;
    resetKPIsToEmpty();
    return;
  }
  emptyEl.hidden = true;
  resultsEl.hidden = false;

  renderKPIs(rows);
  renderMainChart(rows);
  renderRankChart(rows);
  renderCompare(rows);
  renderTable(rows);
}

/* ---------------------------------------------------------------- */
/* Init                                                               */
/* ---------------------------------------------------------------- */
async function main() {
  ALL_ROWS = await loadPanel();
  ALL_TICKERS = [...new Set(ALL_ROWS.map((r) => r.ticker))].sort();
  ALL_ROWS.forEach((r) => { TICKER_NAME[r.ticker] = r.company_name; });
  SERIES_COLORS = Array.from({ length: MAX_CHART_SERIES }, (_, i) =>
    getComputedStyle(document.documentElement).getPropertyValue(`--series-${i + 1}`).trim()
  );

  const years = [...new Set(ALL_ROWS.map((r) => r.year))].sort((a, b) => a - b);
  const subs = SUB_INDUSTRY_ORDER.filter((s) => ALL_ROWS.some((r) => r.sub_industry === s));

  const yearItems = years.map((y) => ({ value: y, label: String(y), sub: '', searchText: String(y) }));
  const subItems = subs.map((s) => ({ value: s, label: SUB_LABEL[s] || s, sub: '', searchText: (SUB_LABEL[s] || s).toLowerCase() }));
  const tickerItems = ALL_TICKERS.map((t) => ({ value: t, label: TICKER_NAME[t], sub: t, searchText: `${t} ${TICKER_NAME[t]}`.toLowerCase() }));

  // Seed filter state from the URL, validated against known values.
  const urlState = readStateFromURL();
  filterState.years = urlState.years.filter((y) => years.includes(y));
  filterState.subs = urlState.subs.filter((s) => subs.includes(s));
  filterState.tickers = urlState.tickers.filter((t) => ALL_TICKERS.includes(t));

  yearCombo = createMultiCombobox({ prefix: 'f-year', items: yearItems, allLabel: 'All years', onChange: (v) => { filterState.years = v; afterFilterChange(); } });
  subCombo = createMultiCombobox({ prefix: 'f-sub', items: subItems, allLabel: 'All sub-industries', onChange: (v) => { filterState.subs = v; afterFilterChange(); } });
  tickerCombo = createMultiCombobox({ prefix: 'f-ticker', items: tickerItems, allLabel: 'All companies', onChange: (v) => { filterState.tickers = v; afterFilterChange(); } });

  yearCombo.setSelected(filterState.years);
  subCombo.setSelected(filterState.subs);
  tickerCombo.setSelected(filterState.tickers);

  initRankChart(chartColors());

  function resetAll() {
    yearCombo.setSelected([]);
    subCombo.setSelected([]);
    tickerCombo.setSelected([]);
    filterState = { years: [], subs: [], tickers: [] };
    afterFilterChange();
  }
  document.getElementById('reset-btn').addEventListener('click', resetAll);
  document.getElementById('empty-reset-btn').addEventListener('click', resetAll);

  document.querySelectorAll('#rank-metric-toggle button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#rank-metric-toggle button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      rankMetric = btn.dataset.metric;
      renderRankChart(applyFilters());
    });
  });
  document.querySelectorAll('#group-by-toggle button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#group-by-toggle button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      groupBy = btn.dataset.group;
      renderTable(applyFilters());
    });
  });

  document.querySelectorAll('#data-table thead th').forEach((th) => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      sortState = sortState.col === col ? { col, dir: -sortState.dir } : { col, dir: 1 };
      renderTable(applyFilters());
    });
  });

  document.addEventListener('click', (e) => {
    document.querySelectorAll('.combo').forEach((combo) => {
      if (!combo.contains(e.target)) combo.querySelector('.combo-listbox').hidden = true;
    });
  });

  render();
}

main();
