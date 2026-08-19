import { getMeta } from '../data.js';
import { esc } from '../format.js';

const KOFI_URL = 'https://ko-fi.com/hansorun';

const ALSO_FUNDS = [
  {
    title: 'A real domain',
    body: 'About $15/year buys worldglyph.org instead of a *.pages.dev address — cheap, but it’s the first thing that makes this look like a project instead of a demo.',
  },
  {
    title: 'Continued development',
    body: 'Bug fixes, new source connectors (cropcirclearchives.co.uk is next), and just keeping the archive growing instead of static.',
  },
  {
    title: 'Login + bookmarking',
    body: 'An account system so you can save formations and come back to a list, instead of re-building the same filter every visit.',
  },
  {
    title: 'A glyph-submission workflow',
    body: 'A way for you to report a formation directly — coordinates, date, a photo — instead of waiting for it to turn up in a source archive.',
  },
  {
    title: 'A community page',
    body: 'Somewhere on-site to talk about formations, theories, and sightings, instead of that conversation staying scattered across Reddit threads.',
  },
];

export function renderSupport(container) {
  const meta = getMeta();
  const records = meta.totals.records;

  const cards = ALSO_FUNDS.map(
    (f) => `<div class="support-card">
      <h3>${esc(f.title)}</h3>
      <p>${esc(f.body)}</p>
    </div>`,
  ).join('');

  container.innerHTML = `<div class="view"><div class="support">
    <h2>Support Worldglyph</h2>
    <p>Worldglyph is one person's evenings and weekends, rebuilding a public record that
    dying and abandoned crop-circle sites were about to take with them. It runs on
    hosting-costs-only economics — no ads, no login wall, no subscription. If you'd like
    it to grow faster than that, here's exactly what money buys.</p>

    <div class="support-featured">
      <h3>Give every formation its own glyph</h3>
      <p>Right now all <strong>${records.toLocaleString()} formations</strong> in the archive show up on the
      map as the same plain circle. There's already a pipeline for something better — feed a
      formation's photo to Claude's vision model, get back a geometric spec, render it as a small
      SVG glyph that actually resembles the formation instead of a generic dot. It works today (see
      the Review tab) — it just hasn't been run across the whole archive, because each formation
      costs a small AI-processing fee to convert. At current API rates that's roughly a few cents a
      formation, so symbolizing everything lands somewhere around <strong>$75</strong>.</p>
      <p class="support-goal-amount">$75 — replaces every plain circle on the map with a real glyph</p>
      <a class="support-cta" href="${esc(KOFI_URL)}" target="_blank" rel="noopener">Fund the symbol pipeline ↗</a>
    </div>

    <h2>Also funds</h2>
    <div class="support-grid">${cards}</div>

    <h2>How this works</h2>
    <p>Worldglyph is a fully static site with no backend in production, so there's no checkout
    built into this page and nothing here ever touches your card details. The button below goes to
    <strong>Ko-fi</strong>: it takes one-time or recurring support, keeps 0% of one-time donations
    (Ko-fi's own payment processor still takes its standard cut), and doesn't require registering a
    business to use.</p>
    <p>Nothing on Worldglyph is paywalled and donating doesn't unlock anything for you specifically
    — the archive stays free and open either way. This just funds what gets built next.</p>
    <a class="support-cta support-cta-secondary" href="${esc(KOFI_URL)}" target="_blank" rel="noopener">Support on Ko-fi ↗</a>
    <p class="filter-hint">This page doesn't show a live donation total — a static site has no
    honest way to track one. Once there's a Ko-fi goal set up, its own progress bar can be linked
    from here instead of faked here.</p>
  </div></div>`;
}
