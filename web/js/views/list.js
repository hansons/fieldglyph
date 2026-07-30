import { getState, update } from '../state.js';
import { applyFilters } from '../data.js';
import { esc, formatDate, waybackBadge, positionBadge } from '../format.js';
import { openDrawer } from './detail.js';

const CHUNK = 150;
let sortKey = 'date';
let sortDir = -1;
let kbIndex = -1;

function sortRecords(records) {
  const value = {
    date: (r) => r.d ?? '',
    title: (r) => r.t ?? '',
    source: (r) => r.src,
    place: (r) => `${r.co ?? ''} ${r.ar ?? ''}`,
    media: (r) => r.mc,
  }[sortKey];
  return [...records].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
  });
}

export function renderList(container) {
  const state = getState();
  const records = sortRecords(applyFilters(state));
  kbIndex = -1;

  const positionOnly = state.position.size === 1 && state.position.has('none');
  const banner = positionOnly
    ? `<div class="list-banner">These ${records.length} records have no coordinates and no recognizable
       region — they can't be placed on the map, but every one is still fully browsable here.</div>`
    : '';

  if (records.length === 0) {
    container.innerHTML = `<div class="view"><div class="empty-state">
      <p>No formations match the current filters.</p>
      <button id="empty-clear">Clear all filters</button></div></div>`;
    container.querySelector('#empty-clear')?.addEventListener('click', () =>
      import('../state.js').then((m) => m.clearFilters()),
    );
    return;
  }

  const arrow = (key) => (sortKey === key ? `<span class="sort-arrow">${sortDir === 1 ? '↑' : '↓'}</span>` : '');

  container.innerHTML = `<div class="view">${banner}
    <table class="list-table" aria-label="Formations">
      <thead><tr>
        <th data-sort="date">Date ${arrow('date')}</th>
        <th data-sort="title">Formation ${arrow('title')}</th>
        <th data-sort="place">Where ${arrow('place')}</th>
        <th>Tags</th>
        <th data-sort="media">📷 ${arrow('media')}</th>
        <th data-sort="source">Source ${arrow('source')}</th>
      </tr></thead>
      <tbody id="list-body"></tbody>
    </table>
    <div id="list-sentinel"></div>
  </div>`;

  const body = container.querySelector('#list-body');
  let rendered = 0;

  const renderChunk = () => {
    const slice = records.slice(rendered, rendered + CHUNK);
    const html = slice
      .map(
        (r, i) => `<tr data-id="${r.id}" data-index="${rendered + i}" tabindex="-1">
        <td>${esc(formatDate(r.d, r.dp))}</td>
        <td>${esc(r.t ?? '(untitled)')} ${waybackBadge(r.fm)}</td>
        <td>${esc([r.ar, r.co].filter(Boolean).join(', '))} ${positionBadge(r.cs)}</td>
        <td>${(r.tg ?? []).map((t) => `<span class="badge">${esc(t)}</span>`).join(' ')}</td>
        <td>${r.mc || ''}</td>
        <td>${esc(r.src)}</td>
      </tr>`,
      )
      .join('');
    body.insertAdjacentHTML('beforeend', html);
    rendered += slice.length;
  };
  renderChunk();

  const sentinel = container.querySelector('#list-sentinel');
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && rendered < records.length) renderChunk();
  });
  observer.observe(sentinel);

  body.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-id]');
    if (row) openDrawer(row.dataset.id, records);
  });

  container.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1;
      else {
        sortKey = key;
        sortDir = key === 'date' || key === 'media' ? -1 : 1;
      }
      renderList(container);
    });
  });

  // Keyboard navigation over rendered rows.
  container.querySelector('.view').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
    const rows = body.querySelectorAll('tr');
    if (rows.length === 0) return;
    if (e.key === 'Enter') {
      if (kbIndex >= 0) rows[kbIndex]?.click();
      return;
    }
    e.preventDefault();
    rows[kbIndex]?.classList.remove('kb-focus');
    kbIndex = Math.max(0, Math.min(rows.length - 1, kbIndex + (e.key === 'ArrowDown' ? 1 : -1)));
    const row = rows[kbIndex];
    row.classList.add('kb-focus');
    row.scrollIntoView({ block: 'nearest' });
  });
  container.querySelector('.view').tabIndex = 0;
}
