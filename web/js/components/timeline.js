import { getState, update } from '../state.js';
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

function render() {
  const state = getState();
  // Histogram reflects all non-year filters, so brushing shows "what's here".
  const relaxed = { ...state, years: null };
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

  const range = state.years ?? [minYear, maxYear];
  const inRange = (y) => y >= range[0] && y <= range[1];

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

  root.innerHTML = `
    <div class="timeline-head">
      <span class="range-label">${range[0]} – ${range[1]}</span>
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

  const svg = root.querySelector('svg');
  const yearAtX = (px) => {
    const rect = svg.getBoundingClientRect();
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
        const next = [...(getState().years ?? [minYear, maxYear])];
        next[which] = y;
        update({ years: [Math.min(...next), Math.max(...next)] });
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
      const next = [...(getState().years ?? [minYear, maxYear])];
      next[which] = Math.max(minYear, Math.min(maxYear, next[which] + delta));
      update({ years: [Math.min(...next), Math.max(...next)] });
    });
  }

  root.querySelector('#tl-reset').addEventListener('click', () => {
    stopPlay();
    update({ years: null });
  });

  root.querySelector('#tl-play').addEventListener('click', () => {
    if (playTimer) {
      stopPlay();
      renderTimeline();
      return;
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stepMs = reduced ? 1600 : 800;
    const [from, to] = getState().years ?? [Math.max(MODERN_START, minYear), maxYear];
    let year = from;
    update({ years: [year, year] });
    playTimer = setInterval(() => {
      year++;
      if (year > to) {
        stopPlay();
        update({ years: [from, to] });
        return;
      }
      update({ years: [year, year] });
    }, stepMs);
  });
}

function stopPlay() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}
