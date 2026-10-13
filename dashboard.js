// Renders dashboard.html: interactive filters recompute the four summary numbers and charts live.

const SUB_LABEL = {
  'Oil & Gas Storage & Transportation': 'Midstream / pipelines',
  'Oil & Gas Refining & Marketing': 'Refining & marketing',
  'Oil & Gas Exploration & Production': 'Exploration & production',
  'Integrated Oil & Gas': 'Integrated majors',
  'Oil & Gas Equipment & Services': 'Equipment & services',
};

let ALL_ROWS = [];
let charts = {};

function chartDefaults() {
  const styles = getComputedStyle(document.body);
  return {
    muted: styles.getPropertyValue('--text-muted').trim(),
    grid: styles.getPropertyValue('--gridline').trim(),
    blue: styles.getPropertyValue('--series-1').trim(),
    critical: styles.getPropertyValue('--critical').trim(),
  };
}

function baseOptions(c, yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: c.muted, font: { size: 11 } }, grid: { display: false } },
      y: {
        ticks: { color: c.muted, font: { size: 11 } },
        grid: { color: c.grid },
        title: yLabel ? { display: true, text: yLabel, color: c.muted, font: { size: 11 } } : undefined,
      },
    },
  };
}

function populateFilters(rows) {
  const years = [...new Set(rows.map((r) => r.year))].sort();
  const subs = SUB_INDUSTRY_ORDER.filter((s) => rows.some((r) => r.sub_industry === s));
  const tickers = [...new Set(rows.map((r) => r.ticker))].sort();

  const yearSel = document.getElementById('f-year');
  years.forEach((y) => {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    yearSel.appendChild(o);
  });

  const subSel = document.getElementById('f-sub');
  subs.forEach((s) => {
    const o = document.createElement('option');
    o.value = s; o.textContent = SUB_LABEL[s] || s;
    subSel.appendChild(o);
  });

  const tickerSel = document.getElementById('f-ticker');
  tickers.forEach((t) => {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    tickerSel.appendChild(o);
  });
}

function selectedValues(sel) {
  return Array.from(sel.selectedOptions).map((o) => o.value);
}

function applyFilters() {
  const years = selectedValues(document.getElementById('f-year')).map(Number);
  const subs = selectedValues(document.getElementById('f-sub'));
  const tickers = selectedValues(document.getElementById('f-ticker'));

  return ALL_ROWS.filter((r) => {
    if (years.length && !years.includes(r.year)) return false;
    if (subs.length && !subs.includes(r.sub_industry)) return false;
    if (tickers.length && !tickers.includes(r.ticker)) return false;
    return true;
  });
}

function render() {
  const rows = applyFilters();
  const c = chartDefaults();
  const empty = rows.length === 0;

  // --- Summary tiles ---
  if (empty) {
    ['stat-companies', 'stat-avgreturn', 'stat-top', 'stat-avgvol'].forEach((id) => {
      document.getElementById(id).textContent = '–';
    });
    document.getElementById('stat-top-sub').textContent = '';
  } else {
    const { nCompanies, avgReturn, avgVol, top } = summaryNumbers(rows);
    document.getElementById('stat-companies').textContent = nCompanies;
    const retEl = document.getElementById('stat-avgreturn');
    retEl.textContent = fmtPct(avgReturn);
    retEl.className = 'value ' + (avgReturn >= 0 ? 'good' : 'critical');
    document.getElementById('stat-top').textContent = fmtPct(top.cum_return_pct, 0);
    document.getElementById('stat-top-sub').textContent = `${top.ticker}`;
    document.getElementById('stat-avgvol').textContent = `${avgVol.toFixed(1)}%`;
  }

  // --- Chart: companies, cumulative return, sorted ---
  const companies = companySummary(rows).sort((a, b) => b.cum_return_pct - a.cum_return_pct);
  charts.companies.data.labels = companies.map((co) => co.ticker);
  charts.companies.data.datasets[0].data = companies.map((co) => co.cum_return_pct);
  charts.companies.data.datasets[0].backgroundColor = companies.map((co) => (co.cum_return_pct >= 0 ? c.blue : c.critical));
  charts.companies._meta = companies;
  charts.companies.update();

  // --- Chart: year trend ---
  const years = yearSummary(rows);
  charts.years.data.labels = years.map((y) => y.year);
  charts.years.data.datasets[0].data = years.map((y) => y.avg_return);
  charts.years.data.datasets[0].backgroundColor = years.map((y) => (y.avg_return >= 0 ? c.blue : c.critical));
  charts.years.update();

  // --- Chart: sub-industry ---
  const subs = subIndustrySummary(rows);
  charts.subs.data.labels = subs.map((s) => SUB_LABEL[s.sub_industry] || s.sub_industry);
  charts.subs.data.datasets[0].data = subs.map((s) => s.avg_cum_return);
  charts.subs.update();

  // --- Table ---
  const tbody = document.querySelector('#data-table tbody');
  tbody.innerHTML = '';
  rows
    .slice()
    .sort((a, b) => a.ticker.localeCompare(b.ticker) || a.year - b.year)
    .forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.ticker}</td>
        <td>${r.company_name}</td>
        <td>${r.year}</td>
        <td>${fmtPct(r.annual_return_pct, 1)}</td>
        <td>${r.annual_volatility_pct.toFixed(1)}%</td>
        <td>${fmtNum(r.avg_daily_volume)}</td>
      `;
      tbody.appendChild(tr);
    });
  document.getElementById('row-count').textContent = `${rows.length} row${rows.length === 1 ? '' : 's'}`;
}

function initCharts() {
  const c = chartDefaults();

  charts.companies = new Chart(document.getElementById('chart-companies'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: c.blue, borderRadius: 3, maxBarThickness: 18 }] },
    options: {
      ...baseOptions(c, 'Cumulative return (%)'),
      plugins: {
        legend: { display: false },
        tooltip: {
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
    data: { labels: [], datasets: [{ data: [], backgroundColor: c.blue, borderRadius: 4, maxBarThickness: 46 }] },
    options: baseOptions(c, 'Avg. annual return (%)'),
  });

  charts.subs = new Chart(document.getElementById('chart-subs'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: c.blue, borderRadius: 4, maxBarThickness: 46 }] },
    options: baseOptions(c, 'Avg. cumulative return (%)'),
  });
}

async function main() {
  ALL_ROWS = await loadPanel();
  populateFilters(ALL_ROWS);
  initCharts();
  render();

  ['f-year', 'f-sub', 'f-ticker'].forEach((id) => {
    document.getElementById(id).addEventListener('change', render);
  });
  document.getElementById('reset-btn').addEventListener('click', () => {
    ['f-year', 'f-sub', 'f-ticker'].forEach((id) => {
      Array.from(document.getElementById(id).options).forEach((o) => (o.selected = false));
    });
    render();
  });
}

main();
