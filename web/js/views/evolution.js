import { getState, update, toggleSetValue } from '../state.js';
import { applyFilters, getMeta, getFormations, getDetail } from '../data.js';
import { esc } from '../format.js';
import { openDrawer } from './detail.js';

const ERAS = [
  { from: 1500, to: 1899, title: 'Pre-1900 legends', blurb: 'Scattered historical accounts — fairy rings, the Mowing Devil era, an 1590 dancing-circle report from Assen. Recovered from print sources via the archives.' },
  { from: 1900, to: 1979, title: 'Scattered early reports', blurb: 'Occasional eyewitness accounts and retrospectively-collected cases, decades before the phenomenon had a name.' },
  { from: 1980, to: 1989, title: 'The Hampshire beginnings', blurb: 'Simple circles and circle-sets in the fields below the Westbury and Cheesefoot Head escarpments. The first researchers arrive.' },
  { from: 1990, to: 1994, title: 'The pictogram explosion', blurb: 'Formations abruptly grow grammar: dumbbells, keys, claws, pictographic chains hundreds of feet long. Report counts triple.' },
  { from: 1995, to: 2002, title: 'Fractals & mandalas', blurb: 'Julia sets, koch snowflakes, flower-of-life geometries — the era of mathematical showpieces.' },
  { from: 2003, to: 2014, title: 'Late complexity', blurb: 'Coded discs, portrait faces, 3-D illusions. Formation counts begin their long decline.' },
  { from: 2015, to: 2100, title: 'The quiet years', blurb: 'Fewer formations each season, still concentrated in the Wiltshire heartland.' },
];

export function renderEvolution(container) {
  const meta = getMeta();
  const all = getFormations();
  const taggedCount = meta.totals.tagged;
  const withText = meta.totals.withText;
  const total = meta.totals.records;

  const eraPanels = ERAS.map((era) => {
    const records = all.filter((r) => r._year !== null && r._year >= era.from && r._year <= era.to);
    if (records.length === 0) return '';
    const tagged = records.filter((r) => r.tg && r.tg.length > 0);

    const tagCounts = new Map();
    for (const r of tagged) for (const t of r.tg) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Representative thumbnails: media-rich records first, prefer ones with a hero image.
    const thumbs = records
      .filter((r) => r.hi)
      .sort((a, b) => b.mc - a.mc)
      .slice(0, 4);

    const spanLabel = era.to >= 2100 ? `${era.from}–` : `${era.from}–${era.to}`;
    return `<section class="era-panel">
      <h3>${esc(era.title)}</h3>
      <div class="era-span">${spanLabel} · ${records.length} formations${tagged.length ? ` · ${tagged.length} with shape tags` : ''}</div>
      <p>${esc(era.blurb)}</p>
      <div class="era-stats">
        ${topTags.map(([t, n]) => `<button class="chip" data-tag="${esc(t)}">${esc(t)}<span class="count">${n}</span></button>`).join(' ')}
        ${topTags.length === 0 ? `<span class="filter-hint">No tagged records in this era (${records.length} records lack descriptive text)</span>` : ''}
      </div>
      <div class="era-thumbs">
        ${thumbs.map((r) => `<img loading="lazy" src="${esc(r.hi)}" alt="${esc(r.t ?? '')}" title="${esc(r.t ?? '')}" data-id="${r.id}" onerror="this.remove()">`).join('')}
      </div>
      <button data-era="${era.from},${Math.min(era.to, new Date().getFullYear())}">Explore this era on the map →</button>
    </section>`;
  }).join('');

  // Per-tag sparklines 1980–present.
  const startYear = 1980;
  const endYear = new Date().getFullYear();
  const sparklines = meta.tags
    .filter((t) => t.count > 0)
    .map((tag) => {
      const perYear = new Array(endYear - startYear + 1).fill(0);
      let max = 1;
      for (const r of all) {
        if (r._year === null || r._year < startYear || !r.tg?.includes(tag.id)) continue;
        const idx = Math.min(perYear.length - 1, r._year - startYear);
        perYear[idx]++;
        if (perYear[idx] > max) max = perYear[idx];
      }
      const w = 200;
      const h = 30;
      const step = w / (perYear.length - 1);
      const points = perYear.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`);
      const line = `M${points.join('L')}`;
      const area = `M0,${h}L${points.join('L')}L${w},${h}Z`;
      return `<div class="sparkline" data-tag="${esc(tag.id)}" role="button" tabindex="0"
          title="Filter to ${esc(tag.label)}">
        <div class="spark-label"><span>${esc(tag.label)}</span><span>${tag.count}</span></div>
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="${esc(tag.label)}: yearly counts ${startYear}–${endYear}">
          <path class="spark-area" d="${area}"/><path d="${line}"/>
        </svg>
      </div>`;
    })
    .join('');

  container.innerHTML = `<div class="view"><div class="evolution">
    <div class="honesty-banner">
      Shape tags are auto-derived from source descriptions. <strong>${taggedCount}</strong> of
      <strong>${total}</strong> records (${Math.round((withText / total) * 100)}% have descriptive text;
      ${Math.round((taggedCount / total) * 100)}% carry at least one tag). Counts below are of
      <em>tagged</em> records — eras with sparse text under-report their true variety.
    </div>
    ${eraPanels}
    <h3>Shape frequency by year, ${startYear}–${endYear}</h3>
    <div class="sparklines">${sparklines}</div>
  </div></div>`;

  container.querySelectorAll('[data-era]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const [from, to] = btn.dataset.era.split(',').map(Number);
      update({ view: 'map', years: [from, to] });
    }),
  );
  container.querySelectorAll('[data-tag]').forEach((el) => {
    const activate = () => toggleSetValue('tags', el.dataset.tag);
    el.addEventListener('click', activate);
    if (el.classList.contains('sparkline')) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    }
  });
  container.querySelectorAll('.era-thumbs img').forEach((img) =>
    img.addEventListener('click', () => openDrawer(img.dataset.id, applyFilters(getState()))),
  );
}
