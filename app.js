// Shared data loading + calculation helpers for the S&P 500 Energy dashboard.
// One row = one S&P 500 Energy-sector company in one calendar year (2019-2025).

const DATA_FILE = 'sp500_energy_panel.csv';

const SUB_INDUSTRY_ORDER = [
  'Oil & Gas Storage & Transportation',
  'Oil & Gas Refining & Marketing',
  'Oil & Gas Exploration & Production',
  'Integrated Oil & Gas',
  'Oil & Gas Equipment & Services',
];

function loadPanel() {
  return new Promise((resolve, reject) => {
    Papa.parse(DATA_FILE, {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data),
      error: reject,
    });
  });
}

function fmtPct(n, digits = 1) {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

function fmtNum(n) {
  return Math.round(n).toLocaleString('en-US');
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr) {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

// Per-company cumulative return 2019-2025 (or however many years are present).
function companySummary(rows) {
  const byTicker = {};
  rows.forEach((r) => {
    if (!byTicker[r.ticker]) byTicker[r.ticker] = [];
    byTicker[r.ticker].push(r);
  });
  return Object.values(byTicker).map((rs) => {
    rs.sort((a, b) => a.year - b.year);
    const first = rs[0];
    const last = rs[rs.length - 1];
    const cumReturn = (last.close_price / first.open_price - 1) * 100;
    const bestRow = rs.reduce((a, b) => (b.annual_return_pct > a.annual_return_pct ? b : a));
    const worstRow = rs.reduce((a, b) => (b.annual_return_pct < a.annual_return_pct ? b : a));
    return {
      ticker: first.ticker,
      company_name: first.company_name,
      sub_industry: first.sub_industry,
      years_covered: rs.length,
      cum_return_pct: cumReturn,
      avg_annual_return: mean(rs.map((r) => r.annual_return_pct)),
      avg_annual_vol: mean(rs.map((r) => r.annual_volatility_pct)),
      avg_daily_volume: mean(rs.map((r) => r.avg_daily_volume)),
      best_year: bestRow.year,
      best_year_return: bestRow.annual_return_pct,
      worst_year: worstRow.year,
      worst_year_return: worstRow.annual_return_pct,
    };
  });
}

function subIndustrySummary(rows) {
  const companies = companySummary(rows);
  const byIndustry = {};
  companies.forEach((c) => {
    if (!byIndustry[c.sub_industry]) byIndustry[c.sub_industry] = [];
    byIndustry[c.sub_industry].push(c);
  });
  return SUB_INDUSTRY_ORDER.filter((s) => byIndustry[s]).map((s) => {
    const cs = byIndustry[s];
    return {
      sub_industry: s,
      n: cs.length,
      avg_cum_return: mean(cs.map((c) => c.cum_return_pct)),
      avg_vol: mean(cs.map((c) => c.avg_annual_vol)),
    };
  });
}

function yearSummary(rows) {
  const byYear = {};
  rows.forEach((r) => {
    if (!byYear[r.year]) byYear[r.year] = [];
    byYear[r.year].push(r);
  });
  return Object.keys(byYear)
    .map(Number)
    .sort((a, b) => a - b)
    .map((y) => ({
      year: y,
      avg_return: mean(byYear[y].map((r) => r.annual_return_pct)),
    }));
}

function summaryNumbers(rows) {
  const companies = companySummary(rows);
  const nCompanies = companies.length;
  const avgReturn = mean(rows.map((r) => r.annual_return_pct));
  const avgVol = mean(rows.map((r) => r.annual_volatility_pct));
  const top = companies.slice().sort((a, b) => b.cum_return_pct - a.cum_return_pct)[0];
  return { nCompanies, avgReturn, avgVol, top };
}
