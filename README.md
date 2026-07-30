# Fieldglyph

A recovery archive and explorer for crop circle formations — rescuing the
worldwide record from dead, dying, and scattered sources into one queryable,
provenance-preserving archive.

Recovers formation data (photos, locations, dates, descriptions) from crop circle
websites that are dead or at risk of disappearing, and keeps collecting new
reports from sites that are still active. Runs on Node's native TypeScript
execution — no build step.

## Setup

```
npm install
npm run migrate
```

## Usage

```
node src/cli.ts scrape <connector> [--limit N] [--force-refetch]
node src/cli.ts reparse <connector> [--clean]
node src/cli.ts sources
node src/cli.ts stats <connector>

node src/cli.ts enrich [--dry-run]   # QA + centroids + shape tags (run after every scrape)
node src/cli.ts export [--geojson]   # DB -> static JSON under web/data/
node src/cli.ts vendor               # copy Leaflet assets into web/vendor/ (once)
node src/cli.ts serve [--port 8787]  # formation explorer at http://127.0.0.1:8787
```

The pipeline is **scrape → enrich → export → serve**. Scraping overwrites
enriched columns, so `enrich` re-runs after every scrape (it is idempotent —
a second consecutive run reports zero changes); `export` warns if it detects
un-enriched data.

## Formation explorer

`web/` is a self-contained static app (no build step, Leaflet vendored, only
external requests are OSM basemap tiles and hotlinked source imagery):

- **Map** — exact positions as solid markers, region-centroid records as dashed
  glyphs deterministically scattered within their region radius, "not mappable"
  tray for the remainder. Everything is filterable and the URL hash holds the
  full state, so any view is shareable.
- **List** — precision-aware dates, provenance badges, keyboard navigation.
- **Evolution** — era panels (pre-1900 legends → pictogram explosion → fractals
  → the quiet years) + per-tag frequency sparklines. Shape tags are auto-derived
  from source descriptions and the coverage is disclosed in-app.
- **Detail drawer** — hotlinked imagery with photographer credit, Wayback
  fallback for dead origins, and a full provenance block on every record.
- **Review** — curation queue for AI-derived symbolic representations
  (`symbolize` command, Claude vision → geometric spec → SVG); approve/reject
  keyboard-first. Requires the local `serve` (the curation API never ships to
  static hosting).

## Deploying to Cloudflare Pages

`web/` is fully static (data JSON and vendor assets are committed), so no build
step is needed:

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the
   `hansons/fieldglyph` repo.
2. Build command: *(leave empty)* · Build output directory: `web`.
3. Deploy. Updates flow by re-running `enrich` + `export` locally, committing
   `web/data/`, and pushing.

The published site is read-only by design: browsing, map, timeline, evolution
and approved symbols all work; the Review tab explains that curation happens
on the machine holding the database.

`reparse` rebuilds records from the raw HTML cache with zero network calls;
`--clean` drops the source's rows first (use after a parser upgrade changes
external-ID extraction, so improved rows replace rather than sit beside old ones).

Registered connectors:

| id      | source                                | status         | coverage |
|---------|---------------------------------------|----------------|----------|
| `dcca`  | Dutch Crop Circle Archive (dcca.nl)   | abandoned/live | NL 1590–2012 (site frozen since 2012) |
| `ircup` | IRCUP database (cropcircleresearch.com) | dead         | 7 records from the sole login-free Wayback RSS snapshot |
| `iccra` | ICCRA USA formations (iccra.org)      | abandoned/live | US by state, ~1950s–2011 |
| `ccc`   | Crop Circle Connector                 | active         | 2014–present (pre-2014 lives at cropcirclearchives.co.uk — future connector) |

## Design

- `src/core/` — shared fetch/cache/wayback/robots infrastructure, connector contract.
- `src/db/` — SQLite schema (migrations), typed repository.
- `src/connectors/<id>/` — one folder per source site: `discoverPages` (enumerate
  pages) + `parsePage` (pure HTML -> structured data, no I/O, fixture-testable).
- `data/raw/` — every fetched page is cached here before parsing. This cache is
  the actual recovery archive: once a page is captured, it's owned independently
  of the source site or the Wayback Machine's continued availability.
- `data/db/archive.sqlite3` — normalized `formation_reports` / `formation_media`
  / `fetch_log` tables. One row per (source, source entry) — no cross-source
  entity resolution yet.

Media policy defaults to metadata + link-back only (no bulk image copying),
configurable in `src/config.ts`.
