import { esc, formatDate, waybackUrlFor } from '../format.js';

// Curation view: source image vs generated symbol, keyboard-first.
// Requires the local serve API; on a static host it degrades to an explainer.

let queue = [];
let index = 0;
let reviewed = 0;
let total = 0;
let container = null;

export function renderReview(root) {
  container = root;
  root.innerHTML = '<div class="view"><div class="review"><p>Loading pending symbols…</p></div></div>';
  loadQueue();
}

async function loadQueue() {
  let res;
  try {
    res = await fetch('/api/symbols?status=pending');
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    container.innerHTML = `<div class="view"><div class="review">
      <div class="honesty-banner">The review workflow needs the local curation API — run the explorer
      with <code>node src/cli.ts serve</code> on the machine that holds the archive database.
      On a static host this view is read-only by design.</div></div></div>`;
    return;
  }
  const body = await res.json();
  queue = body.symbols;
  index = 0;
  reviewed = 0;
  total = queue.length;
  render();
}

function current() {
  return queue[index] ?? null;
}

function render() {
  const item = current();
  if (!item) {
    container.innerHTML = `<div class="view"><div class="review">
      <div class="empty-state">
        <p>${total === 0 ? 'No symbols waiting for review.' : `All done — ${reviewed} of ${total} reviewed.`}</p>
        <p class="filter-hint">Generate more with: <code>node src/cli.ts symbolize --limit N</code></p>
      </div></div></div>`;
    return;
  }

  container.innerHTML = `<div class="view"><div class="review">
    <div class="review-progress">
      <strong>${reviewed} reviewed</strong> · ${queue.length - index} remaining
      <span class="filter-hint">a approve · r reject · space skip</span>
    </div>
    <div class="review-card">
      <figure class="review-photo">
        <img src="${esc(item.photoUrl)}" alt="Source imagery for ${esc(item.title ?? '')}"
          onerror="this.outerHTML='<div class=&quot;drawer-hero-fallback&quot;>📷 Image unavailable<br><a href=&quot;${esc(waybackUrlFor(item.photoUrl))}&quot; target=&quot;_blank&quot; rel=&quot;noopener&quot;>Try Wayback ↗</a></div>'">
        <figcaption>Source image (${esc(item.photoUrl.split('/').pop() ?? '')})</figcaption>
      </figure>
      <div class="review-symbol">
        <div class="symbol-frame">${item.svg}</div>
        <figcaption>Generated symbol · model confidence: <strong>${esc(item.confidence ?? '?')}</strong></figcaption>
        ${item.modelNotes ? `<p class="filter-hint">Model notes: ${esc(item.modelNotes)}</p>` : ''}
      </div>
    </div>
    <div class="review-meta">
      <h3>${esc(item.title ?? '(untitled)')}</h3>
      <div class="drawer-sub">${esc(formatDate(item.date, item.datePrecision === 'day' ? 'd' : item.datePrecision === 'month' ? 'm' : item.datePrecision === 'year' ? 'y' : 'u'))} · ${esc(item.place ?? '')}</div>
      <div class="badge-row">${(item.tags ?? []).map((t) => `<span class="badge">${esc(t)}</span>`).join('')}
        <a class="badge" href="#/f/${esc(item.formationId)}">open record →</a></div>
    </div>
    <div class="review-actions">
      <button id="rv-approve" class="rv-approve">✓ Approve <kbd>a</kbd></button>
      <button id="rv-reject" class="rv-reject">✗ Reject <kbd>r</kbd></button>
      <button id="rv-skip">Skip <kbd>space</kbd></button>
      <input id="rv-note" type="text" placeholder="Optional note (what's wrong / missing)…">
    </div>
  </div></div>`;

  container.querySelector('#rv-approve').addEventListener('click', () => verdict('approve'));
  container.querySelector('#rv-reject').addEventListener('click', () => verdict('reject'));
  container.querySelector('#rv-skip').addEventListener('click', skip);
}

async function verdict(action) {
  const item = current();
  if (!item) return;
  const notes = container.querySelector('#rv-note')?.value?.trim() || undefined;
  try {
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbolId: item.symbolId, action, notes }),
    });
    if (!res.ok) throw new Error(String(res.status));
  } catch (err) {
    alert(`Review failed: ${err}`);
    return;
  }
  reviewed++;
  queue.splice(index, 1);
  if (index >= queue.length) index = Math.max(0, queue.length - 1);
  render();
}

function skip() {
  if (queue.length === 0) return;
  const [item] = queue.splice(index, 1);
  queue.push(item);
  render();
}

export function reviewKeydown(e) {
  if (!container || !current()) return false;
  if (e.target.matches('input, textarea')) return false;
  if (e.key === 'a') {
    verdict('approve');
    return true;
  }
  if (e.key === 'r') {
    verdict('reject');
    return true;
  }
  if (e.key === ' ') {
    e.preventDefault();
    skip();
    return true;
  }
  return false;
}
