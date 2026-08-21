import { esc, formatDate } from '../format.js';
import { getMeta } from '../data.js';
import { createReviewQueue } from '../lib/reviewQueue.js';

// Tag-proposal review: a human-submitted correction to a formation's auto-derived
// shape tags vs. the current baseline, keyboard-first. Requires the local serve API.

async function fetchQueue() {
  const res = await fetch('/api/tag-proposals?status=pending');
  if (!res.ok) throw new Error(String(res.status));
  const body = await res.json();
  return body.proposals;
}

function submittedBy(item) {
  return item.submittedBy;
}

function tagBadges(tags, cls) {
  if (!tags.length) return `<span class="filter-hint">(none)</span>`;
  return tags.map((t) => `<span class="badge ${cls ?? ''}">${esc(t)}</span>`).join(' ');
}

function renderCard(item) {
  return `<div class="review-card tag-review-card">
    <div class="review-symbol">
      <figcaption>Current (auto-derived) tags</figcaption>
      <div class="badge-row">${tagBadges(item.currentTags ?? [])}</div>
    </div>
    <div class="review-symbol">
      <figcaption>Proposed by <strong>${esc(item.submittedBy)}</strong></figcaption>
      <div class="badge-row">${tagBadges(item.proposedTags ?? [], 'badge-exact')}</div>
      ${item.rationale ? `<p class="filter-hint">“${esc(item.rationale)}”</p>` : ''}
    </div>
  </div>
  <div class="review-meta">
    <h3>${esc(item.title ?? '(untitled)')}</h3>
    <div class="drawer-sub">${esc(formatDate(item.date, item.datePrecision === 'day' ? 'd' : item.datePrecision === 'month' ? 'm' : item.datePrecision === 'year' ? 'y' : 'u'))} · ${esc(item.place ?? '')}</div>
    <div class="badge-row"><a class="badge" href="#/f/${esc(item.formationId)}">open record →</a></div>
  </div>`;
}

function renderReplaceForm(item) {
  const vocabulary = getMeta().tags;
  const selected = new Set(item.proposedTags ?? []);
  return `<label class="filter-hint">Pick the correct tag set, then submit — this becomes a new proposal
    that a different reviewer must validate.</label>
    <div class="badge-row" id="rq-tag-picker">
      ${vocabulary
        .map(
          (t) =>
            `<button type="button" class="chip" data-tag="${esc(t.id)}" aria-pressed="${selected.has(t.id)}">${esc(t.label)}</button>`,
        )
        .join('')}
    </div>
    <input id="rq-rationale" type="text" placeholder="Rationale (optional)…" value="${esc(item.rationale ?? '')}">`;
}

function bindReplaceForm(item, formEl) {
  formEl.querySelectorAll('#rq-tag-picker [data-tag]').forEach((el) => {
    el.addEventListener('click', () => {
      el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') !== 'true');
    });
  });
}

function collectReplacePayload(item, formEl) {
  const tags = [...formEl.querySelectorAll('#rq-tag-picker [data-tag][aria-pressed="true"]')].map(
    (el) => el.dataset.tag,
  );
  const rationale = formEl.querySelector('#rq-rationale')?.value?.trim() || undefined;
  return { tags, rationale };
}

async function verdictAction(item, verdict, notes, reviewerName) {
  return fetch('/api/tag-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposalId: item.proposalId, verdict, reviewerName, notes }),
  });
}

async function replaceAction(item, payload, reviewerName) {
  return fetch('/api/tag-replace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proposalId: item.proposalId,
      reviewerName,
      tags: payload.tags,
      rationale: payload.rationale,
    }),
  });
}

const queue = createReviewQueue({
  fetchQueue,
  submittedBy,
  renderCard,
  renderReplaceForm,
  bindReplaceForm,
  collectReplacePayload,
  verdictAction,
  replaceAction,
  emptyStateHint: "Propose a correction from any formation's detail panel to add to this queue.",
});

export function renderTagReview(root) {
  queue.load(root);
}

export function tagReviewKeydown(e) {
  return queue.keydown(e);
}
