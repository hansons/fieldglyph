import { esc, formatDate, waybackUrlFor } from '../format.js';
import { createReviewQueue } from '../lib/reviewQueue.js';

// Glyph review: source imagery vs. generated/human-submitted symbol, keyboard-first.
// Requires the local serve API; on a static host it degrades to an explainer.

async function fetchQueue() {
  const res = await fetch('/api/symbols?status=pending');
  if (!res.ok) throw new Error(String(res.status));
  const body = await res.json();
  return body.symbols;
}

function submittedBy(item) {
  return item.source === 'human_replacement' ? item.submittedBy : null;
}

function renderCard(item) {
  return `<div class="review-card">
    <figure class="review-photo">
      <img src="${esc(item.photoUrl)}" alt="Source imagery for ${esc(item.title ?? '')}" referrerpolicy="no-referrer"
        onerror="this.outerHTML='<div class=&quot;drawer-hero-fallback&quot;>📷 Image unavailable<br><a href=&quot;${esc(waybackUrlFor(item.photoUrl))}&quot; target=&quot;_blank&quot; rel=&quot;noopener&quot;>Try Wayback ↗</a></div>'">
      <figcaption>Source image (${esc(item.photoUrl.split('/').pop() ?? '')})</figcaption>
    </figure>
    <div class="review-symbol">
      <div class="symbol-frame">${item.svg}</div>
      <figcaption>
        ${item.source === 'human_replacement' ? `Submitted by <strong>${esc(item.submittedBy)}</strong>` : `AI-generated · model confidence: <strong>${esc(item.confidence ?? '?')}</strong>`}
        ${item.replacesSymbolId ? ` · replaces symbol #${esc(String(item.replacesSymbolId))}` : ''}
      </figcaption>
      ${item.modelNotes ? `<p class="filter-hint">Model notes: ${esc(item.modelNotes)}</p>` : ''}
    </div>
  </div>
  <div class="review-meta">
    <h3>${esc(item.title ?? '(untitled)')}</h3>
    <div class="drawer-sub">${esc(formatDate(item.date, item.datePrecision === 'day' ? 'd' : item.datePrecision === 'month' ? 'm' : item.datePrecision === 'year' ? 'y' : 'u'))} · ${esc(item.place ?? '')}</div>
    <div class="badge-row">${(item.tags ?? []).map((t) => `<span class="badge">${esc(t)}</span>`).join('')}
      <a class="badge" href="#/f/${esc(item.formationId)}">open record →</a></div>
  </div>`;
}

function renderReplaceForm() {
  return `<label for="rq-svg" class="filter-hint">Paste a well-formed replacement, e.g.
    <code>&lt;svg viewBox="0 0 100 100"&gt;…&lt;/svg&gt;</code> — matches the auto-generated glyphs' convention.</label>
    <textarea id="rq-svg" rows="6" placeholder="&lt;svg viewBox=&quot;0 0 100 100&quot;&gt;...&lt;/svg&gt;"></textarea>`;
}

function collectReplacePayload(item, formEl) {
  const svg = formEl.querySelector('#rq-svg')?.value?.trim() ?? '';
  if (!svg.includes('<svg') || !svg.includes('</svg>')) {
    alert('Paste a well-formed <svg>...</svg> document.');
    return null;
  }
  return { svg };
}

async function verdictAction(item, verdict, notes, reviewerName) {
  return fetch('/api/symbol-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbolId: item.symbolId, verdict, reviewerName, notes }),
  });
}

async function replaceAction(item, payload, reviewerName) {
  return fetch('/api/symbol-replace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbolId: item.symbolId, reviewerName, svg: payload.svg }),
  });
}

const queue = createReviewQueue({
  fetchQueue,
  submittedBy,
  renderCard,
  renderReplaceForm,
  collectReplacePayload,
  verdictAction,
  replaceAction,
  emptyStateHint: 'Generate more with: node src/cli.ts symbolize --limit N',
});

export function renderReview(root) {
  queue.load(root);
}

export function reviewKeydown(e) {
  return queue.keydown(e);
}
