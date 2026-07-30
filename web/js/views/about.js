import { getMeta } from '../data.js';
import { esc } from '../format.js';

export function renderAbout(container) {
  const meta = getMeta();
  const t = meta.totals;

  const sourceCards = meta.sources
    .map(
      (s) => `<div class="source-card">
      <h3>${esc(s.name)}</h3>
      <div class="source-stats">
        <span>status: ${esc(s.status)}</span>
        <span>${s.records} records</span>
        <span>${s.media} media links</span>
        <span>${s.records ? Math.round((s.geocoded / s.records) * 100) : 0}% located</span>
        <span>${s.records ? Math.round((s.described / s.records) * 100) : 0}% with text</span>
        ${s.wayback ? `<span>${s.wayback} from Wayback captures</span>` : ''}
      </div>
      <p class="notes">${esc(s.notes ?? '')}</p>
      <a href="${esc(s.baseUrl)}" target="_blank" rel="noopener">${esc(s.baseUrl)} ↗</a>
    </div>`,
    )
    .join('');

  container.innerHTML = `<div class="view"><div class="about">
    <h2>About this archive</h2>
    <p>A recovery archive of crop circle formation reports, rebuilt from sources that are
    active, abandoned, or entirely dead — <strong>${t.records} formations</strong>,
    <strong>${t.media} media links</strong>, spanning 1590 to the present.
    Every record keeps full provenance: which site reported it, when it was retrieved,
    and — where the original is gone — which Wayback Machine capture preserved it.</p>

    <h2>Sources</h2>
    ${sourceCards}

    <h2>What was auto-derived</h2>
    <p>To make the archive browsable, some fields are computed rather than reported:</p>
    <ul>
      <li><strong>Region centroids</strong> — ${t.geocoded - meta.sources.reduce((n, s) => n, 0) >= 0 ? '' : ''}records whose source gave only a
        region (a US state, Dutch province, or UK county) are placed at that region's centre
        and always displayed as explicitly approximate — dashed markers, never precise pins.</li>
      <li><strong>Shape tags</strong> — derived by keyword matching over source descriptions
        (${Math.round((t.tagged / t.records) * 100)}% of records tagged). Titles are never used:
        they're placenames, and "Star Lane" is not a star formation.</li>
      <li><strong>Country and date repairs</strong> — normalized spellings ("Holland" → Netherlands)
        and one mis-parsed date recovered from its source URL. Every alteration is logged in
        the record's data notes.</li>
    </ul>

    <h2>Image policy</h2>
    <p>Formation photography is the copyright of the individual photographers credited on
    each image. This explorer stores <em>links</em>, never copies — images load directly
    from the source sites with attribution, and dead links fall back to the Wayback Machine.
    If you are a photographer whose work is referenced and want it delinked, that takes one line.</p>

    <h2>Data downloads</h2>
    <p>
      <a href="data/formations.json" download>formations.json</a> — the full index ·
      <a href="data/formations.geojson" download>formations.geojson</a> — for QGIS / geojson.io ·
      <a href="data/meta.json" download>meta.json</a> — coverage statistics
    </p>
    <p class="filter-hint">Export generated ${esc(meta.generated?.slice(0, 19)?.replace('T', ' ') ?? '')}.</p>
  </div></div>`;
}
