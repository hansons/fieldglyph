import { getMeta } from '../data.js';
import { esc } from '../format.js';

const KOFI_URL = 'https://ko-fi.com/hansorun';

// Measured against real archive images (Claude Opus 5, $5/M in, $25/M out): fixed
// system-prompt+schema overhead (~1360 tok) + a sampled-average image (~280 tok) +
// title/tag/description context (~120 tok) as input, ~450 tok of structured output.
// ~$0.02/formation. Buffered 20% for refusals, retries, and complexity variance.
const SYMBOL_COST_PER_FORMATION_USD = 0.02;
const SYMBOL_COST_BUFFER = 1.2;

// The actual number set on the Ko-fi goal bar (ko-fi.com/hansorun/goal) — rounded up from
// the computed combined total below to a clean number. Keep this in sync by hand if the
// Ko-fi goal is ever changed.
const KOFI_GOAL_USD = 500;

function roundUpTo(n, step) {
  return Math.ceil(n / step) * step;
}

// Fixed one-time goals. The domain is a real, metered cost (the registrar bill).
// The three feature goals are NOT metered like the glyph pipeline above — Fieldglyph
// has no paid backend today (fully static, Cloudflare Pages), and each of these would
// run inside Cloudflare's free tier (D1/R2/Workers) at this archive's scale. Their
// dollar amount is a rough time-value estimate of the build effort, not an API bill —
// flagged as such in the copy so it isn't mistaken for the same kind of number.
const FUNDING_GOALS = [
  {
    title: 'A real domain',
    amount: 15,
    period: '/year',
    body: 'Buys fieldglyph.org instead of a *.pages.dev address — cheap, but it’s the first thing that makes this look like a project instead of a demo.',
    metered: true,
  },
  {
    title: 'Login + bookmarking',
    amount: 150,
    body: 'An account system so you can save formations and come back to a list, instead of re-building the same filter every visit. Rough estimate for a couple of focused weekends: accounts, sessions, and a save/bookmark list.',
    metered: false,
  },
  {
    title: 'A glyph-submission workflow',
    amount: 100,
    body: 'A way for you to report a formation directly — coordinates, date, a photo — instead of waiting for it to turn up in a source archive. Rough estimate for a weekend: submission form, photo upload, and a moderation queue so nothing goes live unreviewed.',
    metered: false,
  },
  {
    title: 'A community page',
    amount: 150,
    body: 'Somewhere on-site to talk about formations, theories, and sightings, instead of that conversation staying scattered across Reddit threads. Rough estimate for a couple of weekends: threaded discussion plus enough moderation tooling to keep it usable.',
    metered: false,
  },
];

export function renderSupport(container) {
  const meta = getMeta();
  const records = meta.totals.records;
  const symbolizable = meta.totals.symbolizable ?? records;
  const baseCost = symbolizable * SYMBOL_COST_PER_FORMATION_USD;
  const symbolGoal = roundUpTo(baseCost * SYMBOL_COST_BUFFER, 5);
  const combinedGoal = symbolGoal + FUNDING_GOALS.reduce((sum, g) => sum + g.amount, 0);

  const goalCards = FUNDING_GOALS.map(
    (g) => `<div class="support-card">
      <h3>${esc(g.title)}</h3>
      <p class="support-goal-amount">$${g.amount}${esc(g.period ?? '')}</p>
      <p>${esc(g.body)}</p>
      ${!g.metered ? '<p class="filter-hint">Rough time-value estimate, not a metered cost.</p>' : ''}
    </div>`,
  ).join('');

  container.innerHTML = `<div class="view"><div class="support">
    <h2>Support Fieldglyph</h2>
    <p>Fieldglyph is one person's evenings and weekends, rebuilding a public record that
    dying and abandoned crop-circle sites were about to take with them. It runs on
    hosting-costs-only economics — no ads, no login wall, no subscription. If you'd like
    it to grow faster than that, here's exactly what money buys.</p>

    <div class="support-featured">
      <h3>Give every formation its own glyph</h3>
      <p>Right now all <strong>${records.toLocaleString()} formations</strong> in the archive show up on the
      map as the same plain circle. There's already a pipeline for something better — feed a
      formation's photo to Claude's vision model, get back a geometric spec, render it as a small
      SVG glyph that actually resembles the formation instead of a generic dot. It works today (see
      the Review tab) — it just hasn't been run across the archive yet.
      <strong>${symbolizable.toLocaleString()}</strong> formations currently have a usable photo or
      diagram to convert (the rest — mostly from sources not fully harvested yet — don't have an
      image to feed the model, so they're excluded from this goal until they do). At roughly 2
      cents a formation in API costs, that's about $${Math.round(baseCost)} — this goal adds a 20%
      buffer on top for refused/retried images and unusually complex formations.</p>
      <p class="support-goal-amount">$${symbolGoal} — replaces every plain circle on the map with a real glyph</p>
      <a class="support-cta" href="${esc(KOFI_URL)}" target="_blank" rel="noopener">Fund the symbol pipeline ↗</a>
    </div>

    <h2>Other funding goals</h2>
    <p>These aren't API-metered the way the glyph pipeline is — Fieldglyph has no paid backend
    yet, and each of these would run on Cloudflare's free tier at this archive's size. The dollar
    amounts below are a rough estimate of the build time each one takes, not a bill from a
    service.</p>
    <div class="support-grid">${goalCards}</div>

    <h2>Keeps it moving</h2>
    <p>Bug fixes, new source connectors (cropcirclearchives.co.uk is next), and just keeping the
    archive growing instead of static — this one doesn't have an end state or a goal amount, it's
    ongoing. Recurring support on Ko-fi funds this directly.</p>

    <h2>How this works</h2>
    <p>Fieldglyph is a fully static site with no backend in production, so there's no checkout
    built into this page and nothing here ever touches your card details.</p>
    <p>Nothing on Fieldglyph is paywalled and donating doesn't unlock anything for you specifically
    — the archive stays free and open either way. This just funds what gets built next.</p>
    <a class="support-cta support-cta-secondary" href="${esc(KOFI_URL)}" target="_blank" rel="noopener">Support on Ko-fi ↗</a>
    <p class="filter-hint">This page doesn't show a live donation total — a static site has no
    honest way to track one. The Ko-fi page's own goal bar is set to <strong>$${KOFI_GOAL_USD}</strong>,
    a round number just above the $${combinedGoal} combined total of every goal above (computed
    here, not on Ko-fi) — Ko-fi only supports one active goal at a time, so that single bar tracks
    progress toward all of them together rather than one each. That computed total grows a little
    as the archive does (more formations means a bigger glyph-pipeline goal), so it may drift
    closer to — or past — the Ko-fi number over time.</p>
  </div></div>`;
}
