import { getState, toggleSetValue, update, clearFilters, hasActiveFilters, isWholeYearRange } from '../state.js';
import { getFormations, getMeta, applyFilters, positionBucket, mediaBucket } from '../data.js';
import { esc } from '../format.js';

const SOURCE_LABELS = { cca: 'CC Archives ’78–13', ccc: 'CC Connector ’14–', dcca: 'Dutch Archive', iccra: 'ICCRA (US)', ircup: 'IRCUP' };
const MONTH_ABBR = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const POSITION_LABELS = { exact: 'exact', approx: 'region-level', none: 'not mappable' };
const MEDIA_LABELS = { has: 'has photo', none: 'no photo' };
const STATUS_LABELS = { r: 'reported', hs: 'hoax suspected', ha: 'hoax admitted', ina: 'no anomaly', iba: 'bio anomaly', u: 'unresolved' };

const OPEN_KEY = 'cca-filters-open';

let root;

export function mountFilters(container) {
  root = container;
  render();
}

export function renderFilters() {
  if (root) render();
}

function isOpen() {
  return localStorage.getItem(OPEN_KEY) === '1';
}

function chip(label, key, value, count, pressed, title = '') {
  return `<button class="chip" data-filter-key="${key}" data-filter-value="${esc(value)}"
    aria-pressed="${pressed}" ${count === 0 && !pressed ? 'disabled' : ''} title="${esc(title)}">
    ${esc(label)}<span class="count">${count}</span></button>`;
}

function countBy(records, fn) {
  const counts = new Map();
  for (const r of records) {
    const k = fn(r);
    if (k === null || k === undefined) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function render() {
  const state = getState();
  const meta = getMeta();
  const all = getFormations();

  // Counts are computed against records passing all OTHER filter groups, so a
  // chip's number answers "what would I get if I added this?"
  const withoutGroup = (group) => {
    const relaxed = { ...state, [group]: group === 'query' ? '' : new Set() };
    return applyFilters(relaxed);
  };

  const bySource = countBy(withoutGroup('sources'), (r) => r.src);
  const byCountry = countBy(withoutGroup('countries'), (r) => r.co ?? '');
  const byTag = (() => {
    const relaxed = withoutGroup('tags');
    const counts = new Map();
    let untagged = 0;
    let notext = 0;
    for (const r of relaxed) {
      if (r.tg === undefined) notext++;
      else if (r.tg.length === 0) untagged++;
      for (const t of r.tg ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return { counts, untagged, notext };
  })();
  const byMonth = countBy(withoutGroup('months'), (r) => (r._month === null ? null : String(r._month)));
  const byPosition = countBy(withoutGroup('position'), positionBucket);
  const byMedia = countBy(withoutGroup('media'), mediaBucket);
  const byVerification = countBy(withoutGroup('verification'), (r) => r.vs);

  const monthMax = Math.max(1, ...byMonth.values());
  const tagged = meta.totals.tagged;
  const total = meta.totals.records;

  // Dataset extent bounds the date pickers and stands in for a blank input.
  let minYear = Infinity;
  let maxYear = -Infinity;
  for (const r of all) {
    if (r._year === null) continue;
    if (r._year < minYear) minYear = r._year;
    if (r._year > maxYear) maxYear = r._year;
  }
  const dataMin = Number.isFinite(minYear) ? `${String(minYear).padStart(4, '0')}-01-01` : '1900-01-01';
  const dataMax = Number.isFinite(maxYear) ? `${maxYear}-12-31` : '2100-12-31';

  const topCountries = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Active-filter pills: visible even when the panel is collapsed, so state is
  // never hidden and any filter is removable in one click.
  const pills = [];
  const tagLabel = (id) =>
    id === '_untagged' ? 'untagged text' : id === '_notext' ? 'no text' : meta.tags.find((t) => t.id === id)?.label ?? id;
  for (const v of state.sources) pills.push({ key: 'sources', value: v, label: SOURCE_LABELS[v] ?? v });
  for (const v of state.months) pills.push({ key: 'months', value: v, label: MONTH_FULL[Number(v) - 1] ?? v });
  for (const v of state.tags) pills.push({ key: 'tags', value: v, label: tagLabel(v) });
  for (const v of state.position) pills.push({ key: 'position', value: v, label: POSITION_LABELS[v] ?? v });
  for (const v of state.media) pills.push({ key: 'media', value: v, label: MEDIA_LABELS[v] ?? v });
  for (const v of state.verification) pills.push({ key: 'verification', value: v, label: STATUS_LABELS[v] ?? v });
  for (const v of state.countries) pills.push({ key: 'countries', value: v, label: v || '(unknown)' });
  if (state.dates) {
    const label = isWholeYearRange(state.dates)
      ? `${Number(state.dates[0].slice(0, 4))}–${Number(state.dates[1].slice(0, 4))}`
      : `${state.dates[0]} – ${state.dates[1]}`;
    pills.push({ key: '_dates', value: '', label });
  }

  const open = isOpen();
  const activeCount = pills.length + (state.query ? 1 : 0);

  // Chrome commits date inputs while they still hold focus — remember which one
  // the user is in so the re-render below can hand focus back.
  const focusedId = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : null;

  root.innerHTML = `
    <div class="filter-summary">
      <input id="search-box" type="search" placeholder="Search title / place… ( / )"
        value="${esc(state.query)}" aria-label="Search formations">
      <button id="filters-toggle" aria-expanded="${open}" aria-controls="filter-groups"
        title="Show/hide filter controls">
        <span class="chevron">${open ? '▾' : '▸'}</span> Filters${activeCount ? ` <span class="count">${activeCount}</span>` : ''}
      </button>
      ${pills
        .map(
          (p) => `<button class="chip pill" data-pill-key="${p.key}" data-pill-value="${esc(p.value)}"
            aria-pressed="true" title="Remove this filter">${esc(p.label)} ✕</button>`,
        )
        .join('')}
      ${hasActiveFilters() ? '<button class="clear-all" id="clear-filters">Clear all</button>' : ''}
    </div>

    <div class="filter-groups" id="filter-groups" ${open ? '' : 'hidden'}>
      <div class="filter-group" role="group" aria-label="Date range">
        <label>Date</label>
        <input type="date" id="date-from" aria-label="Show formations from this date"
          value="${state.dates?.[0] ?? ''}" min="${dataMin}" max="${dataMax}">
        <span class="date-sep">–</span>
        <input type="date" id="date-to" aria-label="Show formations up to this date"
          value="${state.dates?.[1] ?? ''}" min="${dataMin}" max="${dataMax}">
      </div>

      <div class="filter-group" role="group" aria-label="Sources">
        <label>Source</label>
        ${meta.sources.map((s) => chip(SOURCE_LABELS[s.key] ?? s.key, 'sources', s.key, bySource.get(s.key) ?? 0, state.sources.has(s.key), s.name)).join('')}
      </div>

      <div class="filter-group" role="group" aria-label="Months">
        <label>Month</label>
        <div class="month-bars">
          ${MONTH_ABBR.map((abbr, i) => {
            const m = String(i + 1);
            const count = byMonth.get(m) ?? 0;
            const h = Math.round((count / monthMax) * 26);
            return `<button data-filter-key="months" data-filter-value="${m}" aria-pressed="${state.months.has(m)}"
              title="${count} formations in ${MONTH_FULL[i]}" aria-label="${MONTH_FULL[i]}: ${count} formations">
              <span class="bar" style="height:${h}px"></span>${abbr}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="filter-group" role="group" aria-label="Shape tags">
        <label>Shape</label>
        ${meta.tags
          .filter((t) => (byTag.counts.get(t.id) ?? 0) > 0 || state.tags.has(t.id))
          .map((t) => chip(t.label, 'tags', t.id, byTag.counts.get(t.id) ?? 0, state.tags.has(t.id)))
          .join('')}
        ${chip('untagged text', 'tags', '_untagged', byTag.untagged, state.tags.has('_untagged'), 'Description analyzed, no shape keyword found')}
        ${chip('no text', 'tags', '_notext', byTag.notext, state.tags.has('_notext'), 'Source provided no description to analyze')}
        <span class="filter-hint" title="Tags are auto-derived from source descriptions">
          tags cover ${Math.round((tagged / total) * 100)}% of records</span>
      </div>

      <div class="filter-group" role="group" aria-label="Position quality">
        <label>Position</label>
        ${chip('exact', 'position', 'exact', byPosition.get('exact') ?? 0, state.position.has('exact'), 'GPS or OS-grid coordinates')}
        ${chip('region-level', 'position', 'approx', byPosition.get('approx') ?? 0, state.position.has('approx'), 'Approximate region centroid')}
        ${chip('not mappable', 'position', 'none', byPosition.get('none') ?? 0, state.position.has('none'))}
      </div>

      <div class="filter-group" role="group" aria-label="Media">
        <label>Photos</label>
        ${chip('has photo', 'media', 'has', byMedia.get('has') ?? 0, state.media.has('has'))}
        ${chip('no photo', 'media', 'none', byMedia.get('none') ?? 0, state.media.has('none'), 'No photo captured from the source page')}
      </div>

      <div class="filter-group" role="group" aria-label="Verification">
        <label>Status</label>
        ${['r', 'hs', 'ha', 'ina', 'iba', 'u']
          .filter((v) => (byVerification.get(v) ?? 0) > 0 || state.verification.has(v))
          .map((v) => chip(STATUS_LABELS[v], 'verification', v, byVerification.get(v) ?? 0, state.verification.has(v)))
          .join('')}
      </div>

      <div class="filter-group" role="group" aria-label="Countries">
        <label>Country</label>
        ${topCountries.map(([c, n]) => chip(c || '(unknown)', 'countries', c, n, state.countries.has(c))).join('')}
      </div>
    </div>
  `;

  root.querySelectorAll('[data-filter-key]').forEach((el) => {
    el.addEventListener('click', () => {
      toggleSetValue(el.dataset.filterKey, el.dataset.filterValue);
    });
  });
  root.querySelectorAll('[data-pill-key]').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.dataset.pillKey === '_dates') update({ dates: null });
      else toggleSetValue(el.dataset.pillKey, el.dataset.pillValue);
    });
  });
  const dateFrom = root.querySelector('#date-from');
  const dateTo = root.querySelector('#date-to');
  const onDateChange = () => {
    const f = dateFrom.value;
    const t = dateTo.value;
    if (!f && !t) {
      update({ dates: null });
      return;
    }
    // A blank side means "open-ended" — substitute the dataset extent.
    const from = f || dataMin;
    const to = t || dataMax;
    update({ dates: from <= to ? [from, to] : [to, from] });
  };
  dateFrom.addEventListener('change', onDateChange);
  dateTo.addEventListener('change', onDateChange);
  root.querySelector('#filters-toggle').addEventListener('click', () => {
    localStorage.setItem(OPEN_KEY, isOpen() ? '0' : '1');
    render();
  });
  const search = root.querySelector('#search-box');
  let debounce;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => update({ query: search.value }), 180);
  });
  root.querySelector('#clear-filters')?.addEventListener('click', clearFilters);

  if (focusedId === 'date-from' || focusedId === 'date-to') {
    root.querySelector(`#${focusedId}`)?.focus();
  }

  // Re-renders steal focus from the search box mid-typing — give it back.
  if (state.query && document.activeElement === document.body) {
    const box = root.querySelector('#search-box');
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }
}
