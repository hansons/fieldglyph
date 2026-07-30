import { loadData, applyFilters } from './data.js';
import { getState, subscribe, readHash, update } from './state.js';
import { mountFilters, renderFilters } from './components/filters.js';
import { mountTimeline, renderTimeline } from './components/timeline.js';
import { renderList } from './views/list.js';
import { renderMap, teardownMap } from './views/map.js';
import { renderEvolution } from './views/evolution.js';
import { renderAbout } from './views/about.js';
import { renderReview, reviewKeydown } from './views/review.js';
import { initDrawer, openDrawer } from './views/detail.js';

const viewRoot = document.getElementById('view-root');
let lastView = null;

function applyTheme() {
  const saved = localStorage.getItem('cca-theme');
  const preferred = saved ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = preferred;
}

function renderView() {
  const state = getState();
  if (state.view !== lastView) {
    if (lastView === 'map') teardownMap();
    viewRoot.innerHTML = '';
    lastView = state.view;
  }
  document.querySelectorAll('.views a').forEach((a) => {
    a.classList.toggle('active', a.dataset.view === state.view);
  });

  switch (state.view) {
    case 'list':
      renderList(viewRoot);
      break;
    case 'evolution':
      renderEvolution(viewRoot);
      break;
    case 'review':
      renderReview(viewRoot);
      break;
    case 'about':
      renderAbout(viewRoot);
      break;
    default:
      renderMap(viewRoot);
  }

  const count = applyFilters(state).length;
  document.getElementById('result-count').textContent = `${count} formations`;
}

function renderAll() {
  renderFilters();
  renderTimeline();
  renderView();
}

async function boot() {
  applyTheme();
  try {
    await loadData();
  } catch (err) {
    viewRoot.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
    return;
  }

  initDrawer();
  mountFilters(document.getElementById('filter-bar'));
  mountTimeline(document.getElementById('timeline'));

  subscribe(renderAll);
  window.addEventListener('hashchange', readHash);
  readHash(); // triggers first render via subscribe

  // If nothing subscribed-rendered yet (no hash), render explicitly.
  if (!viewRoot.hasChildNodes()) renderAll();

  // Deep-linked record.
  const state = getState();
  if (state.selected) openDrawer(state.selected, applyFilters(state));

  // Review-badge: pending count from the local curation API, if present.
  fetch('/api/symbols?status=pending')
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => {
      const badge = document.getElementById('review-badge');
      if (badge && body && body.symbols.length > 0) {
        badge.textContent = body.symbols.length;
        badge.hidden = false;
      }
    })
    .catch(() => {});

  // Global keyboard shortcuts.
  document.addEventListener('keydown', (e) => {
    if (getState().view === 'review' && reviewKeydown(e)) return;
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('search-box')?.focus();
    } else if (e.key === '1') update({ view: 'map' });
    else if (e.key === '2') update({ view: 'list' });
    else if (e.key === '3') update({ view: 'evolution' });
    else if (e.key === '?') document.getElementById('help-dialog').showModal();
  });

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('cca-theme', next);
  });
  document.getElementById('help-toggle').addEventListener('click', () => {
    document.getElementById('help-dialog').showModal();
  });

  window.addEventListener('resize', () => renderTimeline());
}

boot();
