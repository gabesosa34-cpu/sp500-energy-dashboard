// Renders index.html: all numbers and charts are computed from sp500_energy_panel.csv at load time.

const SUB_LABEL = {
  'Oil & Gas Storage & Transportation': 'Midstream / pipelines',
  'Oil & Gas Refining & Marketing': 'Refining & marketing',
  'Oil & Gas Exploration & Production': 'Exploration & production',
  'Integrated Oil & Gas': 'Integrated majors',
  'Oil & Gas Equipment & Services': 'Equipment & services',
};

function chartDefaults() {
  const styles = getComputedStyle(document.body);
  return {
    text: styles.getPropertyValue('--text-secondary').trim(),
    muted: styles.getPropertyValue('--text-muted').trim(),
    grid: styles.getPropertyValue('--gridline').trim(),
    blue: styles.getPropertyValue('--series-1').trim(),
    orange: styles.getPropertyValue('--series-2').trim(),
    good: styles.getPropertyValue('--good').trim(),
    critical: styles.getPropertyValue('--critical').trim(),
  };
}

function baseOptions(c, yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
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

async function main() {
  const rows = await loadPanel();
  const c = chartDefaults();
  const { nCompanies, avgReturn, avgVol, top } = summaryNumbers(rows);
  const companies = companySummary(rows).sort((a, b) => b.cum_return_pct - a.cum_return_pct);
  const subs = subIndustrySummary(rows);
  const years = yearSummary(rows);

  // --- Stat tiles ---
  document.getElementById('stat-companies').textContent = nCompanies;
  document.getElementById('stat-avgreturn').textContent = fmtPct(avgReturn);
  document.getElementById('stat-avgreturn').classList.add(avgReturn >= 0 ? 'good' : 'critical');
  document.getElementById('stat-top').textContent = fmtPct(top.cum_return_pct, 0);
  document.getElementById('stat-top').classList.add('good');
  document.getElementById('stat-top-sub').textContent = `${top.company_name} (${top.ticker})`;
  document.getElementById('stat-avgvol').textContent = `${avgVol.toFixed(1)}%`;

  // --- Opening paragraph fill-ins ---
  const best = subs.slice().sort((a, b) => b.avg_cum_return - a.avg_cum_return)[0];
  const worst = subs.slice().sort((a, b) => a.avg_cum_return - b.avg_cum_return)[0];
  const loser = companies[companies.length - 1];
  document.getElementById('lede-best-sub').textContent = SUB_LABEL[best.sub_industry].toLowerCase();
  document.getElementById('lede-top-ticker').textContent = `${top.company_name} (${top.ticker})`;
  document.getElementById('lede-top-return').textContent = fmtPct(top.cum_return_pct, 0);
  document.getElementById('lede-loser-ticker').textContent = `${loser.company_name} (${loser.ticker})`;

  // --- Finding 1: sub-industry avg cumulative return ---
  document.getElementById('f1-best-sub').textContent = SUB_LABEL[best.sub_industry];
  document.getElementById('f1-best-return').textContent = fmtPct(best.avg_cum_return, 0);
  document.getElementById('f1-best-vol').textContent = `${best.avg_vol.toFixed(0)}%`;
  document.getElementById('f1-worst-sub').textContent = SUB_LABEL[worst.sub_industry];
  document.getElementById('f1-worst-return').textContent = fmtPct(worst.avg_cum_return, 0);
  document.getElementById('f1-worst-vol').textContent = `${worst.avg_vol.toFixed(0)}%`;
  new Chart(document.getElementById('chart-subindustry'), {
    type: 'bar',
    data: {
      labels: subs.map((s) => SUB_LABEL[s.sub_industry]),
      datasets: [{
        data: subs.map((s) => s.avg_cum_return),
        backgroundColor: c.blue,
        borderRadius: 4,
        maxBarThickness: 46,
      }],
    },
    options: {
      ...baseOptions(c, 'Avg. cumulative return, 2019–2025 (%)'),
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(0)}% avg. cumulative return` } },
      },
    },
  });

  // --- Finding 2: winners and losers ---
  document.getElementById('f2-winner').textContent = `${top.company_name} (${top.ticker})`;
  document.getElementById('f2-winner-return').textContent = fmtPct(top.cum_return_pct, 0);
  document.getElementById('f2-loser').textContent = `${loser.company_name} (${loser.ticker})`;
  document.getElementById('f2-loser-return').textContent = fmtPct(loser.cum_return_pct, 0);
  new Chart(document.getElementById('chart-companies'), {
    type: 'bar',
    data: {
      labels: companies.map((co) => co.ticker),
      datasets: [{
        data: companies.map((co) => co.cum_return_pct),
        backgroundColor: companies.map((co) => (co.cum_return_pct >= 0 ? c.blue : c.critical)),
        borderRadius: 3,
        maxBarThickness: 18,
      }],
    },
    options: {
      ...baseOptions(c, 'Cumulative return, 2019–2025 (%)'),
      indexAxis: 'x',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (ctx) => companies[ctx[0].dataIndex].company_name,
            label: (ctx) => `${ctx.parsed.y.toFixed(0)}% cumulative return`,
          },
        },
      },
    },
  });

  // --- Finding 3: year by year sector swings ---
  const worstYear = years.slice().sort((a, b) => a.avg_return - b.avg_return)[0];
  const bestYear = years.slice().sort((a, b) => b.avg_return - a.avg_return)[0];
  document.getElementById('f3-worst-year').textContent = worstYear.year;
  document.getElementById('f3-worst-return').textContent = fmtPct(worstYear.avg_return, 0);
  document.getElementById('f3-best-year').textContent = bestYear.year;
  document.getElementById('f3-best-return').textContent = fmtPct(bestYear.avg_return, 0);
  new Chart(document.getElementById('chart-years'), {
    type: 'bar',
    data: {
      labels: years.map((y) => y.year),
      datasets: [{
        data: years.map((y) => y.avg_return),
        backgroundColor: years.map((y) => (y.avg_return >= 0 ? c.blue : c.critical)),
        borderRadius: 4,
        maxBarThickness: 46,
      }],
    },
    options: {
      ...baseOptions(c, 'Sector avg. annual return (%)'),
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${fmtPct(ctx.parsed.y, 1)} sector average` } },
      },
    },
  });

  // --- Finding 4: volatility vs return ---
  const xs = rows.map((r) => r.annual_volatility_pct);
  const ys = rows.map((r) => r.annual_return_pct);
  const mx = mean(xs), my = mean(ys);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
  const corr = num / den;
  document.getElementById('f4-corr').textContent = corr.toFixed(2);
  new Chart(document.getElementById('chart-scatter'), {
    type: 'scatter',
    data: {
      datasets: [{
        data: rows.map((r) => ({ x: r.annual_volatility_pct, y: r.annual_return_pct, ticker: r.ticker, year: r.year })),
        backgroundColor: c.blue,
        pointRadius: 4,
        pointHoverRadius: 6,
      }],
    },
    options: {
      ...baseOptions(c, 'Annual return (%)'),
      scales: {
        ...baseOptions(c).scales,
        x: { ...baseOptions(c).scales.x, title: { display: true, text: 'Annual volatility (%)', color: c.muted, font: { size: 11 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = ctx.raw;
              return `${d.ticker} ${d.year}: ${fmtPct(d.y, 1)} return, ${d.x.toFixed(0)}% volatility`;
            },
          },
        },
      },
    },
  });
}

main();
