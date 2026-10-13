// Renders dashboard.html: searchable combobox filters recompute the four summary numbers,
// three charts, and a sortable/scrollable table live. Calculations come from app.js (unchanged).

const SUB_LABEL = {
  'Oil & Gas Storage & Transportation': 'Midstream / pipelines',
  'Oil & Gas Refining & Marketing': 'Refining & marketing',
  'Oil & Gas Exploration & Production': 'Exploration & production',
  'Integrated Oil & Gas': 'Integrated majors',
  'Oil & Gas Equipment & Services': 'Equipment & services',
};

let ALL_ROWS = [];
let charts = {};
let filterState = { year: null, sub: null, ticker: null };
let sortState = { col: 'ticker', dir: 1 };
let prevStat = { companies: 0, avgReturn: 0, top: 0, avgVol: 0 };

/* ---------------------------------------------------------------- */
/* Reusable accessible combobox (type-to-search, single-select)      */
/* ---------------------------------------------------------------- */
function createCombobox({ prefix, items, allLabel, onChange }) {
  const input = document.getElementById(`${prefix}-input`);
  const listbox = document.getElementById(`${prefix}-listbox`);
  const wrap = input.closest('.combo');
  const clearBtn = wrap.querySelector('.combo-clear');

  const allItem = { value: null, label: allLabel, sub: '', searchText: 'all' };
  const full = [allItem, ...items];
  let selected = null;
  let filtered = full;
  let activeIndex = -1;

  function labelFor(value) {
    const it = full.find((x) => x.value === value);
    return it ? it.label : '';
  }

  function renderOptions(query) {
    const q = query.trim().toLowerCase();
    filtered = !q ? full : full.filter((it) => it.searchText.includes(q));
    listbox.innerHTML = '';
    if (filtered.length === 0) {
      const li = document.createElement('li');
      li.className = 'combo-empty';
      li.textContent = 'No matches';
      listbox.appendChild(li);
      return;
    }
    filtered.forEach((it, i) => {
      const li = document.createElement('li');
      li.className = 'combo-option' + (it.value === selected ? ' selected' : '');
      li.id = `${prefix}-opt-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', it.value === selected ? 'true' : 'false');
      const labelSpan = document.createElement('span');
      labelSpan.textContent = it.label;
      li.appendChild(labelSpan);
      if (it.sub) {
        const subSpan = document.createElement('span');
        subSpan.className = 'tkr';
        subSpan.textContent = it.sub;
        li.appendChild(subSpan);
      }
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        select(it);
      });
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

  function select(it) {
    selected = it.value;
    input.value = it.value === null ? '' : it.label;
    wrap.classList.toggle('has-value', it.value !== null);
    close();
    onChange(selected);
  }

  function revert() {
    input.value = selected === null ? '' : labelFor(selected);
  }

  input.addEventListener('focus', () => {
    input.select();
    open('');
  });
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (listbox.hidden) open('');
      setActive(activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (listbox.hidden) open('');
      setActive(activeIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!listbox.hidden && activeIndex >= 0 && filtered[activeIndex]) {
        select(filtered[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      revert();
      close();
    }
  });
  input.addEventListener('blur', () => {
    // Defer so a mousedown-selection on an option can land first.
    setTimeout(() => {
      if (listbox.hidden) return;
      revert();
      close();
    }, 120);
  });
  clearBtn.addEventListener('click', () => select(allItem));

  return {
    reset: () => select(allItem),
  };
}

/* ---------------------------------------------------------------- */
/* KPI count-up                                                      */
/* ---------------------------------------------------------------- */
function animateValue(el, from, to, formatFn, duration = 450) {
  const start = performance.now();
  const d = to - from;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
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
    muted: s.getPropertyValue('--text-muted').trim(),
    grid: s.getPropertyValue('--grid').trim(),
    accent: s.getPropertyValue('--accent').trim(),
    good: s.getPropertyValue('--good').trim(),
    critical: s.getPropertyValue('--critical').trim(),
  };
}

function baseOptions(c, yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f1430',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleColor: '#e9edf8',
        bodyColor: '#9aa4c2',
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

function initCharts() {
  const c = chartColors();

  charts.companies = new Chart(document.getElementById('chart-companies'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: c.accent, borderRadius: 3, maxBarThickness: 18 }] },
    options: {
      ...baseOptions(c, 'Cumulative return (%)'),
      plugins: {
        ...baseOptions(c).plugins,
        tooltip: {
          ...baseOptions(c).plugins.tooltip,
          callbacks: {
            title: (ctx) => (charts.companies._meta ? charts.companies._meta[ctx[0].dataIndex].company_name : ''),
            label: (ctx) => `${ctx.parsed.y.toFixed(0)}% cumulative return`,
          },
        },
      },
    },
  });

  charts.years = new Chart(document.getElementById('chart-years'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: c.accent, borderRadius: 4, maxBarThickness: 46 }] },
    options: baseOptions(c, 'Avg. annual return (%)'),
  });

  charts.subs = new Chart(document.getElementById('chart-subs'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: c.accent, borderRadius: 4, maxBarThickness: 46 }] },
    options: baseOptions(c, 'Avg. cumulative return (%)'),
  });
}

/* ---------------------------------------------------------------- */
/* Filtering + render                                                */
/* ---------------------------------------------------------------- */
function applyFilters() {
  return ALL_ROWS.filter((r) => {
    if (filterState.year !== null && r.year !== filterState.year) return false;
    if (filterState.sub !== null && r.sub_industry !== filterState.sub) return false;
    if (filterState.ticker !== null && r.ticker !== filterState.ticker) return false;
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

function renderTable(rows) {
  const tbody = document.querySelector('#data-table tbody');
  tbody.innerHTML = '';
  sortRows(rows).forEach((r) => {
    const tr = document.createElement('tr');
    const retClass = r.annual_return_pct >= 0 ? 'ret-pos' : 'ret-neg';
    tr.innerHTML = `
      <td>${r.ticker}</td>
      <td>${r.company_name}</td>
      <td>${r.year}</td>
      <td class="${retClass}">${fmtPct(r.annual_return_pct, 1)}</td>
      <td>${r.annual_volatility_pct.toFixed(1)}%</td>
      <td>${fmtNum(r.avg_daily_volume)}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('row-count').textContent = `Showing ${rows.length} of ${ALL_ROWS.length} rows`;

  document.querySelectorAll('#data-table thead th').forEach((th) => {
    th.innerHTML = th.textContent.replace(/\s*[▲▼]$/, '');
    if (th.dataset.sort === sortState.col) {
      th.innerHTML += `<span class="arrow">${sortState.dir === 1 ? '▲' : '▼'}</span>`;
    }
  });
}

function render() {
  const rows = applyFilters();
  const c = chartColors();
  const empty = rows.length === 0;

  // --- KPI tiles (animated) ---
  const companiesEl = document.getElementById('stat-companies');
  const returnEl = document.getElementById('stat-avgreturn');
  const topEl = document.getElementById('stat-top');
  const volEl = document.getElementById('stat-avgvol');
  const topSubEl = document.getElementById('stat-top-sub');

  if (empty) {
    [companiesEl, returnEl, topEl, volEl].forEach((el) => (el.textContent = '–'));
    topSubEl.textContent = '';
    returnEl.className = 'value';
    prevStat = { companies: 0, avgReturn: 0, top: 0, avgVol: 0 };
  } else {
    const { nCompanies, avgReturn, avgVol, top } = summaryNumbers(rows);
    returnEl.className = 'value ' + (avgReturn >= 0 ? 'good' : 'critical');
    topSubEl.textContent = `(${top.ticker})`;

    animateValue(companiesEl, prevStat.companies, nCompanies, (v) => Math.round(v));
    animateValue(returnEl, prevStat.avgReturn, avgReturn, (v) => fmtPct(v));
    animateValue(topEl, prevStat.top, top.cum_return_pct, (v) => fmtPct(v, 0));
    animateValue(volEl, prevStat.avgVol, avgVol, (v) => `${v.toFixed(1)}%`);

    prevStat = { companies: nCompanies, avgReturn, top: top.cum_return_pct, avgVol };
  }

  // --- Chart: companies ---
  const companies = companySummary(rows).sort((a, b) => b.cum_return_pct - a.cum_return_pct);
  charts.companies.data.labels = companies.map((co) => co.ticker);
  charts.companies.data.datasets[0].data = companies.map((co) => co.cum_return_pct);
  charts.companies.data.datasets[0].backgroundColor = companies.map((co) => (co.cum_return_pct >= 0 ? c.accent : c.critical));
  charts.companies._meta = companies;
  charts.companies.update();

  // --- Chart: year trend ---
  const years = yearSummary(rows);
  charts.years.data.labels = years.map((y) => y.year);
  charts.years.data.datasets[0].data = years.map((y) => y.avg_return);
  charts.years.data.datasets[0].backgroundColor = years.map((y) => (y.avg_return >= 0 ? c.accent : c.critical));
  charts.years.update();

  // --- Chart: sub-industry ---
  const subs = subIndustrySummary(rows);
  charts.subs.data.labels = subs.map((s) => SUB_LABEL[s.sub_industry] || s.sub_industry);
  charts.subs.data.datasets[0].data = subs.map((s) => s.avg_cum_return);
  charts.subs.data.datasets[0].backgroundColor = c.accent;
  charts.subs.update();

  renderTable(rows);
}

/* ---------------------------------------------------------------- */
/* Init                                                               */
/* ---------------------------------------------------------------- */
async function main() {
  ALL_ROWS = await loadPanel();
  initCharts();

  const years = [...new Set(ALL_ROWS.map((r) => r.year))].sort((a, b) => a - b);
  const subs = SUB_INDUSTRY_ORDER.filter((s) => ALL_ROWS.some((r) => r.sub_industry === s));
  const tickers = [...new Set(ALL_ROWS.map((r) => r.ticker))].sort();

  const yearCombo = createCombobox({
    prefix: 'f-year',
    allLabel: 'All years',
    items: years.map((y) => ({ value: y, label: String(y), sub: '', searchText: String(y) })),
    onChange: (v) => { filterState.year = v; render(); },
  });
  const subCombo = createCombobox({
    prefix: 'f-sub',
    allLabel: 'All sub-industries',
    items: subs.map((s) => ({ value: s, label: SUB_LABEL[s] || s, sub: '', searchText: (SUB_LABEL[s] || s).toLowerCase() })),
    onChange: (v) => { filterState.sub = v; render(); },
  });
  const tickerCombo = createCombobox({
    prefix: 'f-ticker',
    allLabel: 'All companies',
    items: tickers.map((t) => {
      const name = ALL_ROWS.find((r) => r.ticker === t).company_name;
      return { value: t, label: name, sub: t, searchText: `${t} ${name}`.toLowerCase() };
    }),
    onChange: (v) => { filterState.ticker = v; render(); },
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    yearCombo.reset();
    subCombo.reset();
    tickerCombo.reset();
    filterState = { year: null, sub: null, ticker: null };
    render();
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
