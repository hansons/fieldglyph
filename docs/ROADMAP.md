# Recovery Roadmap

Distilled from the project's guidance statement ("Data Recovery & Archive Design,"
2026-07-28) and adjusted where direct verification contradicted it. The goal: one
canonical archive where every known formation has, at minimum, an image, a
location, and a date — cross-referenced to whichever original source(s) reported
it, with disagreements kept visible rather than silently overwritten.

## Source inventory (verified status)

| Source | Status (verified) | Connector | Notes |
|---|---|---|---|
| dcca.nl | Frozen since 2012, owner offering site for takeover | `dcca` ✅ full | NL 1590–2012 incl. pre-web historical entries from Terry Wilson's book |
| ccdb.cropcircleresearch.com (IRCUP) | **Dead — DNS fails.** Founder Paul Vigay died 2009 | `ircup` ✅ complete | Database was login-walled even while live; Wayback only ever saw the sign-on page. Sole recovery: one RSS snapshot, 7 records. ~587 record IDs exist in the CDX index but their content was never captured. |
| iccra.org | Static since ~2011-2015, still resolves | `iccra` ✅ full | US formations by state; detail filenames embed city/county/date |
| cropcircleconnector.com | **Active** (updated daily in season) | `ccc` ✅ 2014–present | Aerial pages only so far; sub-pages (ground/diagrams/field reports) are a follow-on. OS grid refs + streetmap-provided WGS84 coords captured. |
| cropcirclearchives.co.uk | Public, same org as CCC (not an orphaned mirror as first believed) | ⬜ next | Holds CCC's pre-2014 archive, 1978–2018 index |
| cropdecoder.com | Live; claims 4,700+ formations / 346 years | ⬜ | Structure not yet characterized — plain fetch doesn't expose content (possible JS/JSON backend). Treat the 346-year claim skeptically. |
| culture-crop.com | Live, French; curated link index | ⬜ | Harvest links → feed new domains into the Wayback sweep |
| circleresearcharchive.com | Live digitization project (600+ scanned magazines) | — | **Not** a formation database (guidance doc overstated it). Partnership conversation, not a scrape target. |
| BLT Research / CCCS | Institutional | — | Data-sharing conversation, never a scrape |
| Wayback sweeps of defunct enthusiast sites | — | ⬜ | CDX-driven domain sweeps; culture-crop's link list seeds the target set |
| Book scans (Delgado, Andrews, Anderhub & Roth, Haselhoff) + 2,188-image set | Internet Archive | ⬜ | OCR/manual pass — the only non-digital-native source |

## Phases

1. ✅ **Staging pipeline** — connector framework, raw-HTML cache (the archive's
   real safety net), Wayback CDX/snapshot fallback, charset-correct fetching,
   SQLite staging schema with per-field precision flags.
2. 🔶 **Live + abandoned harvest** — DCCA, IRCUP, ICCRA, CCC done;
   cropcirclearchives.co.uk, Crop Decoder, culture-crop remain. CCC sub-pages
   (ground shots, diagrams, field reports) need a merge-by-externalId upsert path.
3. ⬜ **Ongoing intake** — scheduled incremental CCC runs (fetch_log timestamps
   support "new since last run"); current-season trackers as a feed.
4. ⬜ **Print/OCR pass** — pre-web formations from the four books + image set.
5. ⬜ **Cross-source reconciliation** — canonical `formations` table +
   `formation_links` mapping; match by date window + location + crop type; keep
   every source's version, surface disagreements (e.g. hoax-status conflicts).
   The explorer makes candidate duplicates visible (e.g. DCCA and ICCRA records
   interleaving in the same week), which is how the matching heuristic gets tuned.
6. 🔶 **Publish** — delivered as a local-first static explorer (map + timeline
   scrubber + shape taxonomy + evolution view + GeoJSON export), host-anywhere.
   Deferred from the original prospectus: PostGIS canonical store, REST API,
   moderated contribution queue — revisit if/when the archive goes public.

## Non-negotiable constraints

- Aerial photography is per-photographer copyright (Steve Alexander, Lucy
  Pringle, Hugh Newman, Stonehenge Dronescapes, …). Metadata + attribution +
  link-back only; full-resolution re-hosting requires an explicit license.
  `MEDIA_POLICY.cacheThumbnails` stays `false` until that conversation happens.
- robots.txt and ToS checked before every automated harvest; where scraping is
  disallowed, ask for a data-sharing arrangement instead.
- Wayback content is cited as an archived capture with its timestamp
  (`fetch_mode`/`wayback_timestamp` columns), never passed off as live.
