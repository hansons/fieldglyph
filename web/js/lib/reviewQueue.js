// Shared "load a queue of pending items, verdict them one at a time" controller
// used by both the glyph-review queue and the tag-proposal queue. Each caller
// gets its own instance (all state lives in this closure), and supplies the
// resource-specific bits: how to fetch the queue, how to render one item, how
// to submit a verdict, and — optionally — how to submit a replacement.

import { esc } from '../format.js';
import { getReviewerName, peekReviewerName, changeReviewerName } from './reviewerIdentity.js';

export function createReviewQueue({
  fetchQueue,
  submittedBy,
  renderCard,
  renderReplaceForm,
  bindReplaceForm,
  collectReplacePayload,
  verdictAction,
  replaceAction,
  emptyStateHint,
  unavailableHint,
}) {
  let queue = [];
  let index = 0;
  let reviewed = 0;
  let total = 0;
  let container = null;
  let replaceOpen = false;

  function current() {
    return queue[index] ?? null;
  }

  function isMine(item) {
    const reviewerName = peekReviewerName();
    const owner = submittedBy(item);
    return !!(reviewerName && owner && owner.trim().toLowerCase() === reviewerName.trim().toLowerCase());
  }

  async function load(root) {
    container = root;
    replaceOpen = false;
    container.innerHTML = '<div class="view"><div class="review"><p>Loading…</p></div></div>';
    let items;
    try {
      items = await fetchQueue();
    } catch {
      container.innerHTML = `<div class="view"><div class="review">
        <div class="honesty-banner">This queue needs the local curation API — run the explorer
        with <code>node src/cli.ts serve</code> on the machine that holds the archive database.
        ${unavailableHint ?? ''} On a static host this view is read-only by design.</div></div></div>`;
      return;
    }
    queue = items;
    index = 0;
    reviewed = 0;
    total = queue.length;
    render();
  }

  function render() {
    const item = current();
    if (!item) {
      container.innerHTML = `<div class="view"><div class="review">
        <div class="empty-state">
          <p>${total === 0 ? 'Nothing waiting for review.' : `All done — ${reviewed} of ${total} reviewed.`}</p>
          ${emptyStateHint ? `<p class="filter-hint">${emptyStateHint}</p>` : ''}
        </div></div></div>`;
      return;
    }

    const reviewerName = peekReviewerName();
    const mine = isMine(item);

    container.innerHTML = `<div class="view"><div class="review">
      <div class="review-progress">
        <strong>${reviewed} reviewed</strong> · ${queue.length - index} remaining
        <span class="filter-hint">a acceptable · u unacceptable · e enhancement · r replace · space skip</span>
      </div>
      <div class="reviewer-line">reviewing as ${reviewerName ? `<strong>${esc(reviewerName)}</strong>` : '<em>(not set)</em>'}
        · <button id="rq-change-reviewer" class="linklike">change</button></div>
      ${mine ? '<div class="honesty-banner">You submitted this item — ask a different reviewer to validate it.</div>' : ''}
      ${renderCard(item)}
      <div class="review-actions">
        <button id="rq-acceptable" class="rv-approve" ${mine ? 'disabled' : ''}>✓ Acceptable <kbd>a</kbd></button>
        <button id="rq-unacceptable" class="rv-reject" ${mine ? 'disabled' : ''}>✗ Unacceptable <kbd>u</kbd></button>
        <button id="rq-enhance" class="rv-enhance" ${mine ? 'disabled' : ''}>△ Proposed enhancement <kbd>e</kbd></button>
        ${renderReplaceForm ? `<button id="rq-replace-toggle" class="rv-replace" ${mine ? 'disabled' : ''}>⇄ Submit replacement… <kbd>r</kbd></button>` : ''}
        <button id="rq-skip">Skip <kbd>space</kbd></button>
        <input id="rq-note" type="text" placeholder="Notes (required for 'proposed enhancement')…">
      </div>
      ${
        renderReplaceForm
          ? `<div class="replacement-form" id="rq-replace-form" ${replaceOpen ? '' : 'hidden'}>
              ${renderReplaceForm(item)}
              <div class="review-actions">
                <button id="rq-replace-submit" class="rv-replace">Submit replacement</button>
                <button id="rq-replace-cancel">Cancel</button>
              </div>
            </div>`
          : ''
      }
    </div></div>`;

    container.querySelector('#rq-change-reviewer').addEventListener('click', () => {
      changeReviewerName();
      render();
    });
    if (!mine) {
      container.querySelector('#rq-acceptable').addEventListener('click', () => verdict('acceptable'));
      container.querySelector('#rq-unacceptable').addEventListener('click', () => verdict('unacceptable'));
      container.querySelector('#rq-enhance').addEventListener('click', () => verdict('enhancement_proposed'));
      const replaceToggle = container.querySelector('#rq-replace-toggle');
      replaceToggle?.addEventListener('click', () => {
        replaceOpen = !replaceOpen;
        render();
      });
    }
    container.querySelector('#rq-skip').addEventListener('click', skip);
    container.querySelector('#rq-replace-cancel')?.addEventListener('click', () => {
      replaceOpen = false;
      render();
    });
    container.querySelector('#rq-replace-submit')?.addEventListener('click', submitReplacement);
    const replaceFormEl = container.querySelector('#rq-replace-form');
    if (replaceFormEl && replaceOpen && bindReplaceForm) bindReplaceForm(item, replaceFormEl);
  }

  async function verdict(verdictValue) {
    const item = current();
    if (!item) return;
    const notes = container.querySelector('#rq-note')?.value?.trim() || undefined;
    if (verdictValue === 'enhancement_proposed' && !notes) {
      alert("A 'proposed enhancement' verdict needs a note explaining what should change.");
      return;
    }
    const reviewerName = getReviewerName();
    if (!reviewerName) return;
    let res;
    try {
      res = await verdictAction(item, verdictValue, notes, reviewerName);
    } catch (err) {
      alert(`Review failed: ${err}`);
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? `Review failed (${res.status})`);
      return;
    }
    reviewed++;
    queue.splice(index, 1);
    if (index >= queue.length) index = Math.max(0, queue.length - 1);
    render();
  }

  async function submitReplacement() {
    const item = current();
    if (!item) return;
    const formEl = container.querySelector('#rq-replace-form');
    const payload = collectReplacePayload(item, formEl);
    if (!payload) return; // collectReplacePayload already alerted on invalid input
    const reviewerName = getReviewerName();
    if (!reviewerName) return;
    let res;
    try {
      res = await replaceAction(item, payload, reviewerName);
    } catch (err) {
      alert(`Submitting replacement failed: ${err}`);
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? `Submitting replacement failed (${res.status})`);
      return;
    }
    replaceOpen = false;
    reviewed++;
    queue.splice(index, 1);
    if (index >= queue.length) index = Math.max(0, queue.length - 1);
    render();
  }

  function skip() {
    if (queue.length === 0) return;
    replaceOpen = false;
    const [item] = queue.splice(index, 1);
    queue.push(item);
    render();
  }

  function keydown(e) {
    if (!container || !current()) return false;
    if (e.target.matches('input, textarea, select')) return false;
    if (e.key === 'a') {
      verdict('acceptable');
      return true;
    }
    if (e.key === 'u') {
      verdict('unacceptable');
      return true;
    }
    if (e.key === 'e') {
      verdict('enhancement_proposed');
      return true;
    }
    if (e.key === 'r' && renderReplaceForm) {
      replaceOpen = !replaceOpen;
      render();
      return true;
    }
    if (e.key === ' ') {
      e.preventDefault();
      skip();
      return true;
    }
    return false;
  }

  return { load, keydown };
}
