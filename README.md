# S&P 500 Energy Sector Dashboard

**Question:** Within the S&P 500 Energy sector, which companies outperformed from 2019 to 2025, and what set them apart?

**Reader:** An equity analyst building an energy sector buy list.

**One row:** One S&P 500 Energy-sector company in one calendar year, 2019–2025.

Live site: published with GitHub Pages (see repository "About" / Pages settings for the URL).

## Files

| File | What it is |
|---|---|
| `index.html` | The report page — title, answer, four summary numbers, four findings with charts, and a closing section on the data. |
| `dashboard.html` | The interactive dashboard — filters by year, sub-industry, and company; the same four summary numbers and three charts recompute live. |
| `styles.css` | Shared styles and color tokens for both pages (light/dark mode aware). |
| `app.js` | Shared data-loading and calculation helpers (CSV parsing, per-company/per-sub-industry/per-year aggregation). |
| `report.js` | Computes and renders the numbers and charts on `index.html`. |
| `dashboard.js` | Computes and renders the numbers, charts, and table on `dashboard.html`, reacting to filter changes. |
| `sp500_energy_panel.csv` | The data file both pages load and compute from in the browser. |

## Where the data came from

- **Prices:** daily stock prices for each ticker, 2019-01-01 through 2025-12-31, pulled from Yahoo Finance via the `yfinance` Python library, then rolled up to one row per company per calendar year (open/close price, annual return, annualized volatility, average daily volume, year high/low).
- **Company list and sub-industry:** the current S&P 500 Energy sector constituents (21 companies) and their GICS sub-industry, from Wikipedia's "List of S&P 500 companies."
- **Rows dropped:** 145 of a possible 147 rows (21 companies × 7 years) are present. EXE (Expand Energy) is missing 2019–2020 because it's the post-bankruptcy successor ticker to Chesapeake Energy, which didn't resume trading until February 2021.
- **Known limitation:** the company list reflects today's S&P 500 Energy lineup, not the lineup in any single past year — a few energy companies removed from the index since 2019 via acquisition (e.g. Hess, Marathon Oil) are not included.

## Columns in `sp500_energy_panel.csv`

| Column | Meaning |
|---|---|
| `ticker` | Stock ticker symbol |
| `company_name` | Full company name |
| `sub_industry` | GICS sub-industry |
| `year` | Calendar year, 2019–2025 |
| `open_price` | Closing price on the first trading day of that year |
| `close_price` | Closing price on the last trading day of that year |
| `annual_return_pct` | % change from open to close that year |
| `annual_volatility_pct` | Annualized standard deviation of daily returns that year |
| `avg_daily_volume` | Average daily shares traded that year |
| `year_high` / `year_low` | Highest / lowest daily close that year |
