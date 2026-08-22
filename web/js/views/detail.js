import { getState, update, subscribe } from '../state.js';
import { getById, getDetail, applyFilters, getMeta } from '../data.js';
import {
  esc,
  formatDate,
  PRECISION_LABEL,
  positionBadge,
  verificationBadge,
  noPhotoBadge,
  waybackUrlFor,
} from '../format.js';
import { getReviewerName } from '../lib/reviewerIdentity.js';

let currentOrder = [];
let drawerEl;
let lightboxEl;

// Idle slideshow: with nothing selected, the panel cycles through the aerial
// shots of whatever the current filters show, so browsing needs no clicking.
const SLIDE_MS = 4000;
let slideTimer = null;
let slideIdx = 0;
let slideRecords = [];
let slidePaused = false;
let slideSignature = null;
let resumeAtId = null; // unselecting a record resumes the gallery on it

// Record ids currently inside the map viewport, or null when that's not a
// meaningful restriction (off the map view, or the map hasn't been manually
// navigated yet) — see map.js's announceVisibleRecords().
let visibleIds = null;

function panelChanged(id) {
  // Let the map react (radius circle, resize) without importing map code here.
  document.dispatchEvent(new CustomEvent('panel-changed', { detail: { id } }));
}

function slideChanged(id) {
  // The map mirrors the gallery: it identifies the slide currently showing.
  document.dispatchEvent(new CustomEvent('slide-changed', { detail: { id } }));
}

export function currentSlideId() {
  if (getState().selected !== null) return null;
  if (document.body.classList.contains('panel-closed')) return null;
  return slideRecords[slideIdx]?.id ?? null;
}

export function initDrawer() {
  drawerEl = document.getElementById('drawer');
  lightboxEl = document.getElementById('lightbox');
  slidePaused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderPlaceholder();

  // Filters changed while idling → rebuild the slideshow over the new set.
  subscribe(() => {
    if (getState().selected !== null) return;
    if (document.body.classList.contains('panel-closed')) return;
    const filtered = applyFilters(getState());
    const sig = `${filtered.length}:${filtered[0]?.id ?? ''}:${filtered[filtered.length - 1]?.id ?? ''}`;
    if (sig !== slideSignature) renderPlaceholder();
  });

  // Map viewport changed → rebuild the slideshow over what's now in view.
  document.addEventListener('map-bounds-changed', (e) => {
    visibleIds = e.detail?.ids ?? null;
    if (getState().selected !== null) return;
    if (document.body.classList.contains('panel-closed')) return;
    renderPlaceholder();
  });

  document.addEventListener('keydown', (e) => {
    if (lightboxEl && !lightboxEl.hidden && e.key === 'Escape') {
      closeLightbox();
      return;
    }
    if (e.target.matches('input, textarea, select')) return;
    if (document.body.classList.contains('panel-closed')) return;
    // Esc is two-step: record → back to the gallery, gallery → close panel.
    if (e.key === 'Escape') {
      if (getState().selected !== null) deselect();
      else closeDrawer();
    }
    if (getState().selected === null) {
      if (e.key === 'ArrowLeft') slideStep(-1);
      if (e.key === 'ArrowRight') slideStep(1);
      return;
    }
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
}

function stopSlideshow() {
  if (slideTimer) {
    clearInterval(slideTimer);
    slideTimer = null;
  }
}

function startSlideshow() {
  stopSlideshow();
  if (!slidePaused && slideRecords.length > 1) {
    slideTimer = setInterval(() => slideStep(1, { fromTimer: true }), SLIDE_MS);
  }
}

function slideStep(direction, { fromTimer = false } = {}) {
  if (slideRecords.length === 0) return;
  slideIdx = (slideIdx + direction + slideRecords.length) % slideRecords.length;
  renderSlide();
  if (!fromTimer) startSlideshow(); // manual step: restart the dwell timer
}

// One click undoes the map-viewport restriction below, whichever of the two
// places it's showing (the slideshow hint or the empty state).
function clearViewRestriction() {
  document.dispatchEvent(new CustomEvent('clear-view-restriction'));
}

function viewRestrictionNote() {
  if (!visibleIds) return ' matching the current filters';
  return ' in the current map view (<button type="button" class="inline-link-btn" id="ss-clear-view">show all</button>)';
}

function renderSlide() {
  const r = slideRecords[slideIdx];
  const place = [r.ln, r.ar, r.co].filter(Boolean).join(', ');
  const focusedId = document.activeElement && drawerEl.contains(document.activeElement) ? document.activeElement.id : null;

  drawerEl.innerHTML = `
    <div class="drawer-nav">
      <button id="ss-prev" title="Previous (←)">←</button>
      <button id="ss-play" title="${slidePaused ? 'Play slideshow' : 'Pause slideshow'}">${slidePaused ? '▶' : '⏸'}</button>
      <button id="ss-next" title="Next (→)">→</button>
      <span class="ss-counter">${slideIdx + 1} / ${slideRecords.length}</span>
      <span class="spacer"></span>
      <button id="dr-close" title="Close panel (Esc)">✕</button>
    </div>
    <button class="ss-slide" id="ss-open" title="Open this formation">
      <img class="drawer-hero" src="${esc(r.hi)}" alt="${esc(r.t ?? 'formation photo')}" referrerpolicy="no-referrer">
    </button>
    <div class="drawer-body">
      <h2>${esc(r.t ?? '(untitled formation)')}</h2>
      <div class="drawer-sub">${formatDate(r.d, r.dp)}</div>
      <div class="drawer-sub">${esc(place)}</div>
      <p class="ss-hint">Slideshow of the ${slideRecords.length} formations with imagery${viewRestrictionNote()} —
        click the photo to open the full record.</p>
    </div>`;

  drawerEl.querySelector('#dr-close').addEventListener('click', closeDrawer);
  drawerEl.querySelector('#ss-prev').addEventListener('click', () => slideStep(-1));
  drawerEl.querySelector('#ss-next').addEventListener('click', () => slideStep(1));
  drawerEl.querySelector('#ss-play').addEventListener('click', () => {
    slidePaused = !slidePaused;
    startSlideshow();
    renderSlide();
  });
  drawerEl.querySelector('#ss-open').addEventListener('click', () => openDrawer(r.id, currentOrder));
  drawerEl.querySelector('#ss-clear-view')?.addEventListener('click', clearViewRestriction);
  drawerEl.querySelector('.drawer-hero').addEventListener('error', () => {
    // Dead image link — drop the record and keep the show going.
    slideRecords = slideRecords.filter((rec) => rec !== r);
    if (slideRecords.length === 0) {
      renderPlaceholder();
      return;
    }
    slideIdx = slideIdx % slideRecords.length;
    renderSlide();
  });

  // Warm the next image so advancing doesn't flash a blank frame.
  const next = slideRecords[(slideIdx + 1) % slideRecords.length];
  if (next && next !== r) new Image().src = next.hi;

  if (focusedId) drawerEl.querySelector(`#${focusedId}`)?.focus();
  slideChanged(r.id);
}

function renderPlaceholder() {
  stopSlideshow();
  const state = getState();
  const filtered = applyFilters(state);
  const inView = visibleIds ? filtered.filter((r) => visibleIds.has(r.id)) : filtered;
  // Newest first, undated last — mirrors the list view's default order.
  currentOrder = [...inView].sort((a, b) => (b.d ?? '').localeCompare(a.d ?? ''));
  slideRecords = currentOrder.filter((r) => r.hi && r.src !== 'ircup');
  slideSignature = `${filtered.length}:${visibleIds ? visibleIds.size : -1}:${slideRecords[0]?.id ?? ''}:${slideRecords[slideRecords.length - 1]?.id ?? ''}`;
  if (resumeAtId) {
    const i = slideRecords.findIndex((r) => r.id === resumeAtId);
    if (i >= 0) slideIdx = i;
    resumeAtId = null;
  }
  if (slideIdx >= slideRecords.length) slideIdx = 0;

  if (document.body.classList.contains('panel-closed') || slideRecords.length === 0) {
    const emptyReason =
      slideRecords.length === 0 && filtered.length > 0
        ? inView.length === 0
          ? 'Nothing matches the current filters within this map view — pan or zoom out, or <button type="button" class="inline-link-btn" id="ss-clear-view">show all</button>. '
          : 'No preserved imagery in the current view. '
        : '';
    drawerEl.innerHTML = `
      <div class="drawer-nav">
        <span class="spacer"></span>
        <button id="dr-close" title="Close panel (Esc)">✕</button>
      </div>
      <div class="drawer-placeholder">
        <div class="glyph">◎</div>
        <p>${emptyReason}Click a formation — on the map or in the list — and its details appear here.</p>
        <p>Then <kbd>←</kbd> <kbd>→</kbd> step through neighbouring records.</p>
      </div>`;
    drawerEl.querySelector('#dr-close').addEventListener('click', closeDrawer);
    drawerEl.querySelector('#ss-clear-view')?.addEventListener('click', clearViewRestriction);
    slideChanged(null);
    return;
  }

  renderSlide();
  startSlideshow();
}

export async function openDrawer(id, orderedRecords = null) {
  stopSlideshow();
  slideChanged(null);
  if (orderedRecords) currentOrder = orderedRecords;
  const record = getById(id);
  if (!record) return;
  update({ selected: id }, { silent: true });

  document.body.classList.remove('panel-closed');
  drawerEl.innerHTML = '<div class="drawer-body"><p>Loading…</p></div>';

  let detail;
  try {
    detail = await getDetail(id);
  } catch {
    detail = null;
  }
  // A faster click may have superseded this load — never render a stale record.
  if (getState().selected !== id) return;
  render(record, detail);
  panelChanged(id);
}

export function closeDrawer() {
  document.body.classList.add('panel-closed');
  renderPlaceholder();
  update({ selected: null }, { silent: true });
  panelChanged(null);
}

// Unselect: leave the record but keep the panel open, resuming the gallery
// slideshow on the record just viewed.
export function deselect() {
  const id = getState().selected;
  if (id === null) return;
  update({ selected: null }, { silent: true });
  resumeAtId = id;
  // Selection cleanup first — renderPlaceholder announces the resumed slide,
  // and the map identification for it must not be wiped right after.
  panelChanged(null);
  renderPlaceholder();
}

function step(direction) {
  const state = getState();
  if (currentOrder.length === 0 || !state.selected) return;
  const idx = currentOrder.findIndex((r) => r.id === state.selected);
  const next = currentOrder[idx + direction];
  if (next) openDrawer(next.id);
}

function heroBlock(record, detail) {
  const deadSource = record.src === 'ircup';
  if (!record.hi || deadSource) {
    const first = detail?.media?.[0];
    if (!first) return '<div class="drawer-hero-fallback">◎<br>No imagery preserved for this formation</div>';
    return `<div class="drawer-hero-fallback">◎<br>Source offline — imagery may survive in the Wayback Machine<br>
      <a href="${esc(waybackUrlFor(first.u))}" target="_blank" rel="noopener">Try Wayback Machine ↗</a></div>`;
  }
  return `<img class="drawer-hero" src="${esc(record.hi)}" alt="${esc(record.t ?? 'formation photo')}" referrerpolicy="no-referrer"
    onerror="this.outerHTML='<div class=&quot;drawer-hero-fallback&quot;>📷 Image unavailable from origin<br><a href=&quot;${esc(waybackUrlFor(record.hi))}&quot; target=&quot;_blank&quot; rel=&quot;noopener&quot;>Try Wayback Machine ↗</a></div>'">`;
}

function mediaStrip(detail) {
  if (!detail?.media?.length) return '';
  const items = detail.media
    .map((m) => {
      if (m.k === 'video') {
        return `<a class="media-link-card" href="${esc(m.u)}" target="_blank" rel="noopener">▶ Video<br><small>${esc(m.cp ?? '')}</small></a>`;
      }
      const caption = m.ph ?? m.cp ?? '';
      return `<figure>
        <img loading="lazy" src="${esc(m.u)}" alt="${esc(m.c ?? caption ?? 'formation image')}" referrerpolicy="no-referrer"
          data-full="${esc(m.u)}" data-caption="${esc(caption)}"
          onerror="this.closest('figure').innerHTML='<a class=&quot;media-link-card&quot; href=&quot;${esc(waybackUrlFor(m.u))}&quot; target=&quot;_blank&quot; rel=&quot;noopener&quot;>📷 offline<br>Wayback ↗</a>'">
        <figcaption title="${esc(caption)}">${m.k === 'diagram' ? '✎ ' : ''}${esc(caption) || '&nbsp;'}</figcaption>
      </figure>`;
    })
    .join('');
  return `<div class="media-strip">${items}</div>`;
}

function render(record, detail) {
  const dateLine = `${formatDate(record.d, record.dp)} <span class="badge">${esc(PRECISION_LABEL[record.dp] ?? '')}</span>`;
  const place = [record.ln, record.ar, record.co].filter(Boolean).join(', ');

  drawerEl.innerHTML = `
    <div class="drawer-nav">
      <button id="dr-prev" title="Previous (←)">←</button>
      <button id="dr-next" title="Next (→)">→</button>
      <button id="dr-gallery" title="Unselect — back to the gallery slideshow (Esc)">▦ gallery</button>
      <span class="spacer"></span>
      <button id="dr-close" title="Close panel">✕</button>
    </div>
    ${heroBlock(record, detail)}
    <div class="drawer-body">
      <h2>${esc(record.t ?? '(untitled formation)')}</h2>
      <div class="drawer-sub">${dateLine}</div>
      <div class="drawer-sub">${esc(place)}</div>
      <div class="badge-row">
        ${positionBadge(record.cs)}
        ${verificationBadge(record.vs)}
        ${noPhotoBadge(record.mc)}
        ${record.ct ? `<span class="badge">crop: ${esc(record.ct)}</span>` : ''}
      </div>
      ${(record.tg ?? []).length ? `<div class="badge-row">${record.tg.map((t) => `<button class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
      <div class="tag-propose" id="tag-propose"></div>
      ${detail?.sym ? `<div class="symbol-card">
        <div class="symbol-frame">${detail.sym.svg}</div>
        <div class="symbol-caption">Symbolic representation — AI-derived, curator-approved${detail.sym.cf ? ` · confidence ${esc(detail.sym.cf)}` : ''}</div>
      </div>` : ''}
      ${detail?.desc ? `<p class="drawer-desc">${esc(detail.desc)}</p>` : ''}
      ${detail?.rb ? `<p class="drawer-sub">Reported by: ${esc(detail.rb)}</p>` : ''}
      ${mediaStrip(detail)}
      <div class="provenance">
        <dl>
          <dt>Source</dt><dd><a href="${esc(detail?.su ?? '#')}" target="_blank" rel="noopener">${esc(detail?.su ?? 'unknown')}</a></dd>
          ${detail?.wt ? `<dt>Provenance</dt><dd class="wayback-line">Archived capture from the Wayback Machine, ${esc(detail.wt.slice(0, 4))}-${esc(detail.wt.slice(4, 6))}-${esc(detail.wt.slice(6, 8))}${detail.wu ? ` — <a href="${esc(detail.wu)}" target="_blank" rel="noopener">view capture</a>` : ''}</dd>` : ''}
          ${detail?.ra ? `<dt>Retrieved</dt><dd>${esc(detail.ra.slice(0, 10))}</dd>` : ''}
          ${detail?.og ? `<dt>OS grid ref</dt><dd>${esc(detail.og)}</dd>` : ''}
          ${detail?.xid ? `<dt>Source ID</dt><dd>${esc(detail.xid)}</dd>` : ''}
        </dl>
        ${detail?.warn?.length ? `<details class="data-notes"><summary>Data notes (${detail.warn.length})</summary><ul>${detail.warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
      </div>
    </div>
  `;

  drawerEl.querySelector('#dr-close').addEventListener('click', closeDrawer);
  drawerEl.querySelector('#dr-gallery').addEventListener('click', deselect);
  drawerEl.querySelector('#dr-prev').addEventListener('click', () => step(-1));
  drawerEl.querySelector('#dr-next').addEventListener('click', () => step(1));
  drawerEl.querySelectorAll('[data-tag]').forEach((el) =>
    el.addEventListener('click', () => {
      deselect();
      import('../state.js').then((m) => m.toggleSetValue('tags', el.dataset.tag));
    }),
  );
  drawerEl.querySelectorAll('.media-strip img[data-full]').forEach((img) =>
    img.addEventListener('click', () => openLightbox(img.dataset.full, img.dataset.caption, detail?.su)),
  );

  mountTagPropose(drawerEl.querySelector('#tag-propose'), record);
}

// Lazy, self-contained widget: only hits the local curation API once the user
// actually opens it, and degrades to an explainer when that API isn't reachable
// (a static/hosted deployment) — same detection pattern as the review queues.
function mountTagPropose(container, record) {
  if (!container) return;
  let open = false;
  let loaded = null; // null = not yet fetched, 'error' = API unreachable, else { proposals }

  function paint() {
    if (!open) {
      container.innerHTML = `<button id="tp-toggle" class="tag-propose-toggle">Propose a tag correction</button>`;
      container.querySelector('#tp-toggle').addEventListener('click', async () => {
        open = true;
        paint();
        if (loaded === null) {
          try {
            const res = await fetch(`/api/tag-proposals?formationUid=${encodeURIComponent(record.id)}`);
            if (!res.ok) throw new Error(String(res.status));
            loaded = await res.json();
          } catch {
            loaded = 'error';
          }
          paint();
        }
      });
      return;
    }

    if (loaded === null) {
      container.innerHTML = `<div class="tag-propose-form"><p class="filter-hint">Loading…</p></div>`;
      return;
    }
    if (loaded === 'error') {
      container.innerHTML = `<div class="tag-propose-form honesty-banner">Proposing a correction needs the
        local curation API — run <code>node src/cli.ts serve</code> on the machine that holds the archive
        database. On a static host this is read-only by design.</div>`;
      return;
    }

    const pending = loaded.proposals.find((p) => p.status === 'pending' || p.status === 'enhancement_proposed');
    if (pending) {
      container.innerHTML = `<div class="tag-propose-form"><p class="filter-hint">A correction proposed by
        <strong>${esc(pending.submittedBy)}</strong> is already awaiting review${pending.status === 'enhancement_proposed' ? ' (flagged for further enhancement)' : ''}.</p></div>`;
      return;
    }

    const vocabulary = getMeta().tags;
    const selected = new Set(record.tg ?? []);
    container.innerHTML = `<div class="tag-propose-form">
      <div class="badge-row" id="tp-picker">
        ${vocabulary.map((t) => `<button type="button" class="chip" data-tag="${esc(t.id)}" aria-pressed="${selected.has(t.id)}">${esc(t.label)}</button>`).join('')}
      </div>
      <input id="tp-rationale" type="text" placeholder="Why? (optional)…">
      <div class="review-actions">
        <button id="tp-submit">Submit for review</button>
        <button id="tp-cancel">Cancel</button>
      </div>
    </div>`;
    container.querySelectorAll('#tp-picker [data-tag]').forEach((el) => {
      el.addEventListener('click', () => el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') !== 'true'));
    });
    container.querySelector('#tp-cancel').addEventListener('click', () => {
      open = false;
      paint();
    });
    container.querySelector('#tp-submit').addEventListener('click', async () => {
      const tags = [...container.querySelectorAll('#tp-picker [data-tag][aria-pressed="true"]')].map(
        (el) => el.dataset.tag,
      );
      const rationale = container.querySelector('#tp-rationale').value.trim() || undefined;
      const reviewerName = getReviewerName();
      if (!reviewerName) return;
      let res;
      try {
        res = await fetch('/api/tag-propose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formationUid: record.id, tags, rationale, reviewerName }),
        });
      } catch (err) {
        alert(`Submitting failed: ${err}`);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? `Submitting failed (${res.status})`);
        return;
      }
      loaded = { proposals: [{ status: 'pending', submittedBy: reviewerName }] };
      paint();
    });
  }

  paint();
}

function openLightbox(url, caption, sourceUrl) {
  lightboxEl.hidden = false;
  lightboxEl.innerHTML = `
    <img src="${esc(url)}" alt="${esc(caption ?? '')}" referrerpolicy="no-referrer">
    <div class="lb-caption">${esc(caption ?? '')}${sourceUrl ? ` — <a href="${esc(sourceUrl)}" target="_blank" rel="noopener">View on source page ↗</a>` : ''}</div>
    <button id="lb-close">Close (Esc)</button>
  `;
  lightboxEl.querySelector('#lb-close').addEventListener('click', closeLightbox);
  lightboxEl.addEventListener('click', (e) => {
    if (e.target === lightboxEl) closeLightbox();
  });
}

function closeLightbox() {
  lightboxEl.hidden = true;
  lightboxEl.innerHTML = '';
}
