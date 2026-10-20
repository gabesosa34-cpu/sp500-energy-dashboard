// Renders index.html: all numbers and charts are computed from sp500_energy_panel.csv at load time.

const SUB_LABEL = {
  'Oil & Gas Storage & Transportation': 'Midstream / pipelines',
  'Oil & Gas Refining & Marketing': 'Refining & marketing',
  'Oil & Gas Exploration & Production': 'Exploration & production',
  'Integrated Oil & Gas': 'Integrated majors',
  'Oil & Gas Equipment & Services': 'Equipment & services',
};

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animateValue(el, to, formatFn, duration = 600) {
  if (REDUCED_MOTION) {
    el.textContent = formatFn(to);
    return;
  }
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    el.textContent = formatFn(to * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function chartDefaults() {
  const styles = getComputedStyle(document.documentElement);
  return {
    muted: styles.getPropertyValue('--text-dim').trim(),
    grid: styles.getPropertyValue('--border').trim(),
    accent: styles.getPropertyValue('--accent').trim(),
    positive: styles.getPropertyValue('--positive').trim(),
    negative: styles.getPropertyValue('--negative').trim(),
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

async function main() {
  const rows = await loadPanel();
  const c = chartDefaults();
  const { nCompanies, avgReturn, avgVol, top } = summaryNumbers(rows);
  const companies = companySummary(rows).sort((a, b) => b.cum_return_pct - a.cum_return_pct);
  const subs = subIndustrySummary(rows);
  const years = yearSummary(rows);

  // --- Stat tiles (count up on load) ---
  const returnEl = document.getElementById('stat-avgreturn');
  const topEl = document.getElementById('stat-top');
  const trendEl = document.getElementById('trend-avgreturn');

  animateValue(document.getElementById('stat-companies'), nCompanies, (v) => Math.round(v));
  animateValue(returnEl, avgReturn, (v) => fmtPct(v));
  animateValue(topEl, top.cum_return_pct, (v) => fmtPct(v, 0));
  animateValue(document.getElementById('stat-avgvol'), avgVol, (v) => `${v.toFixed(1)}%`);

  returnEl.className = 'value ' + (avgReturn >= 0 ? 'good' : 'critical');
  trendEl.textContent = avgReturn >= 0 ? '▲' : '▼';
  trendEl.className = 'trend ' + (avgReturn >= 0 ? 'good' : 'critical');
  topEl.className = 'value good';
  document.getElementById('stat-top-sub').textContent = `${top.company_name} (${top.ticker})`;

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
        backgroundColor: c.accent,
        borderRadius: 4,
        maxBarThickness: 46,
      }],
    },
    options: {
      ...baseOptions(c, 'Avg. cumulative return, 2019–2025 (%)'),
      plugins: {
        ...baseOptions(c).plugins,
        tooltip: { ...baseOptions(c).plugins.tooltip, callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(0)}% avg. cumulative return` } },
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
        backgroundColor: companies.map((co) => (co.cum_return_pct >= 0 ? c.positive : c.negative)),
        borderRadius: 3,
        maxBarThickness: 18,
      }],
    },
    options: {
      ...baseOptions(c, 'Cumulative return, 2019–2025 (%)'),
      indexAxis: 'x',
      plugins: {
        ...baseOptions(c).plugins,
        tooltip: {
          ...baseOptions(c).plugins.tooltip,
          callbacks: {
            title: (ctx) => companies[ctx[0].dataIndex].company_name,
            label: (ctx) => `${ctx.parsed.y.toFixed(0)}% cumulative return`,
          },
        },
      },
    },
  });

  // --- Finding 3: year by year sector swings — line + gradient area, matching the dashboard's main chart ---
  const worstYear = years.slice().sort((a, b) => a.avg_return - b.avg_return)[0];
  const bestYear = years.slice().sort((a, b) => b.avg_return - a.avg_return)[0];
  document.getElementById('f3-worst-year').textContent = worstYear.year;
  document.getElementById('f3-worst-return').textContent = fmtPct(worstYear.avg_return, 0);
  document.getElementById('f3-best-year').textContent = bestYear.year;
  document.getElementById('f3-best-return').textContent = fmtPct(bestYear.avg_return, 0);
  new Chart(document.getElementById('chart-years'), {
    type: 'line',
    data: {
      labels: years.map((y) => y.year),
      datasets: [{
        data: years.map((y) => y.avg_return),
        borderColor: c.accent,
        borderWidth: 2,
        backgroundColor: accentAreaGradient,
        fill: 'origin',
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: c.accent,
        pointBorderColor: '#111827',
        pointBorderWidth: 1.5,
        pointHoverRadius: 5,
      }],
    },
    options: {
      ...baseOptions(c, 'Sector avg. annual return (%)'),
      plugins: {
        ...baseOptions(c).plugins,
        tooltip: { ...baseOptions(c).plugins.tooltip, callbacks: { label: (ctx) => `${fmtPct(ctx.parsed.y, 1)} sector average` } },
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
        backgroundColor: c.accent,
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
        ...baseOptions(c).plugins,
        tooltip: {
          ...baseOptions(c).plugins.tooltip,
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
