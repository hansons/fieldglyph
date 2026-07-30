import { getState, update, isWholeYearRange } from '../state.js';
import { applyFilters } from '../data.js';

// Timeline footer: per-year histogram with a compressed pre-modern zone, a
// dual-handle year brush, and a play control stepping a 1-year window.

const MODERN_START = 1960; // years before this render in the compressed left zone
let root;
let playTimer = null;

export function mountTimeline(container) {
  root = container;
  render();
}

export function renderTimeline() {
  if (root) render();
}

function yearExtent(records) {
  let min = Infinity;
  let max = -Infinity;
  for (const r of records) {
    if (r._year === null) continue;
    if (r._year < min) min = r._year;
    if (r._year > max) max = r._year;
  }
  if (!Number.isFinite(min)) return [1970, new Date().getFullYear()];
  return [min, max];
}

// The brush works in whole years; date-level precision lives in the filter
// panel's date inputs. Both drive the same `dates` state.
function yearsOf(dates) {
  return [Number(dates[0].slice(0, 4)), Number(dates[1].slice(0, 4))];
}

function setYearRange(a, b) {
  update({ dates: [`${Math.min(a, b)}-01-01`, `${Math.max(a, b)}-12-31`] });
}

function render() {
  const state = getState();
  // Histogram reflects all non-date filters, so brushing shows "what's here".
  const relaxed = { ...state, dates: null };
  const records = applyFilters(relaxed);

  const byYear = new Map();
  let undated = 0;
  for (const r of records) {
    if (r._year === null) {
      undated++;
      continue;
    }
    byYear.set(r._year, (byYear.get(r._year) ?? 0) + 1);
  }

  const [minYear, maxYear] = yearExtent(records);
  const histYears = [...byYear.keys()].sort((a, b) => a - b);
  const historic = histYears.filter((y) => y < MODERN_START);
  const modernStart = Math.max(MODERN_START, minYear);
  const modernYears = [];
  for (let y = modernStart; y <= maxYear; y++) modernYears.push(y);

  const width = root.clientWidth - 28 || 900;
  const height = 64;
  const histH = 46;
  const historicZoneW = historic.length > 0 ? Math.min(120, historic.length * 14 + 20) : 0;
  const modernZoneW = width - historicZoneW;
  const barW = Math.max(1, modernZoneW / Math.max(1, modernYears.length) - 1);
  const maxCount = Math.max(1, ...byYear.values());

  const xOfYear = (y) => {
    if (y < MODERN_START) {
      const idx = historic.indexOf(y);
      return idx === -1 ? 0 : 10 + idx * 14;
    }
    return historicZoneW + ((y - modernStart) / Math.max(1, maxYear - modernStart)) * (modernZoneW - barW);
  };

  const range = state.dates ? yearsOf(state.dates) : [minYear, maxYear];
  const inRange = (y) => y >= range[0] && y <= range[1];
  // Precise sub-year ranges (set via the date inputs) show their exact dates.
  const rangeLabel =
    state.dates && !isWholeYearRange(state.dates)
      ? `${state.dates[0]} – ${state.dates[1]}`
      : `${range[0]} – ${range[1]}`;

  let bars = '';
  for (const y of historic) {
    const count = byYear.get(y) ?? 0;
    const h = Math.max(2, (count / maxCount) * histH);
    bars += `<rect class="bar ${inRange(y) ? 'in-range' : ''}" x="${xOfYear(y)}" y="${histH - h}" width="10" height="${h}">
      <title>${y}: ${count}</title></rect>`;
  }
  for (const y of modernYears) {
    const count = byYear.get(y) ?? 0;
    if (count === 0) continue;
    const h = Math.max(2, (count / maxCount) * histH);
    bars += `<rect class="bar ${inRange(y) ? 'in-range' : ''}" x="${xOfYear(y)}" y="${histH - h}" width="${barW}" height="${h}">
      <title>${y}: ${count}</title></rect>`;
  }

  const divider = historicZoneW > 0
    ? `<line class="hist-divider" x1="${historicZoneW - 4}" y1="0" x2="${historicZoneW - 4}" y2="${histH}"/>
       <text class="era-label" x="8" y="${histH + 12}">pre-${MODERN_START}</text>`
    : '';

  const x1 = xOfYear(Math.max(range[0], minYear));
  const x2 = xOfYear(Math.min(range[1], maxYear)) + barW;

  // Re-rendering replaces the focused handle — remember it so keyboard
  // adjustment survives the update it just caused.
  const focusedId = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : null;

  root.innerHTML = `
    <div class="timeline-head">
      <span class="range-label">${rangeLabel}</span>
      <button id="tl-play" title="Step through years">${playTimer ? '⏸' : '▶'}</button>
      <button id="tl-reset" title="Reset to full range">↺ all years</button>
      <span>${records.length} formations${undated ? ` · ${undated} undated (list only)` : ''}</span>
    </div>
    <svg role="application" aria-label="Year histogram and range brush. Left/right arrows adjust handles."
         viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      ${bars}${divider}
      <rect class="brush-region" x="${x1}" y="0" width="${Math.max(0, x2 - x1)}" height="${histH}"/>
      <circle class="brush-handle" id="handle-from" data-handle="0" tabindex="0" cx="${x1}" cy="${histH}" r="7"
        aria-label="Range start ${range[0]}"/>
      <circle class="brush-handle" id="handle-to" data-handle="1" tabindex="0" cx="${x2}" cy="${histH}" r="7"
        aria-label="Range end ${range[1]}"/>
    </svg>
  `;

  const yearAtX = (px) => {
    // Each drag update re-renders this component, detaching the SVG this
    // closure was built with — a detached rect is all zeros and the math
    // would fling the handle to the far end. Always measure the live SVG.
    const rect = root.querySelector('svg').getBoundingClientRect();
    const x = ((px - rect.left) / rect.width) * width;
    if (historicZoneW > 0 && x < historicZoneW) {
      const idx = Math.round((x - 10) / 14);
      return historic[Math.max(0, Math.min(historic.length - 1, idx))] ?? MODERN_START;
    }
    const frac = (x - historicZoneW) / Math.max(1, modernZoneW - barW);
    return Math.round(modernStart + frac * (maxYear - modernStart));
  };

  for (const handle of root.querySelectorAll('.brush-handle')) {
    const which = Number(handle.dataset.handle);
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const y = Math.max(minYear, Math.min(maxYear, yearAtX(ev.clientX)));
        const cur = getState().dates;
        const next = cur ? yearsOf(cur) : [minYear, maxYear];
        if (next[which] === y) return; // same year — skip the re-render churn
        next[which] = y;
        setYearRange(next[0], next[1]);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    handle.addEventListener('keydown', (e) => {
      const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!delta) return;
      e.preventDefault();
      const cur = getState().dates;
      const next = cur ? yearsOf(cur) : [minYear, maxYear];
      next[which] = Math.max(minYear, Math.min(maxYear, next[which] + delta));
      setYearRange(next[0], next[1]);
    });
  }

  root.querySelector('#tl-reset').addEventListener('click', () => {
    stopPlay();
    update({ dates: null });
  });

  root.querySelector('#tl-play').addEventListener('click', () => {
    if (playTimer) {
      stopPlay();
      renderTimeline();
      return;
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stepMs = reduced ? 1600 : 800;
    const cur = getState().dates;
    const [from, to] = cur ? yearsOf(cur) : [Math.max(MODERN_START, minYear), maxYear];
    let year = from;
    setYearRange(year, year);
    playTimer = setInterval(() => {
      year++;
      if (year > to) {
        stopPlay();
        setYearRange(from, to);
        return;
      }
      setYearRange(year, year);
    }, stepMs);
  });

  if (focusedId) root.querySelector(`#${focusedId}`)?.focus();
}

function stopPlay() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}
