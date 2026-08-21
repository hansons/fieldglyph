/**
 * Strips Crop Circle Connector/Archives page chrome that leaked into free
 * text fields during parsing — `description` and (worse, since it's often
 * concatenated across every photo on a formation) `formation_media
 * .copyright_notice` — a donation banner, an embedded Google AdSense
 * script, a Facebook-discussion plug, a DVD-membership plug, and
 * page-navigation tab labels ("AERIAL SHOTS GROUND SHOTS DIAGRAMS...").
 * These don't sit at a fixed position: the site's own template injects them
 * at different points in the DOM relative to the real text, so real content
 * sometimes appears *between* two junk fragments (e.g. "...alive Wheat.
 * c.89 feet... FOR VISITING THE CROP CIRCLES."). Each rule therefore
 * excises just its own fragment rather than truncating from a marker
 * onward, which would risk eating real content on either side.
 *
 * Each pattern was built from the actual repeated text in the archive, not
 * guessed — see the hundreds of real examples surveyed before writing these.
 *
 * This does not fix the deeper cause on the `copyright_notice` side: some
 * records' extraction scope is too broad and concatenates multiple
 * photographers' credits with page chrome into one string, identically
 * across every photo of that formation. That needs the CCC parser's
 * attribution extraction re-scoped, not just this text cleanup.
 */

interface CleanupRule {
  label: string;
  pattern: RegExp;
}

const RULES: CleanupRule[] = [
  {
    label: 'google-adsense-script',
    // Always the same ad unit, always a complete HTML comment — but a few
    // records have it truncated (missing the google_ad_client line), so
    // match on "google_ad" appearing anywhere inside the comment rather
    // than requiring it to open the block.
    pattern: /<!--[\s\S]*?google_ad[\s\S]*?-->/gi,
  },
  {
    label: 'donation-banner',
    pattern: /Make a donation to keep the web site alive(?:\.\.\.\s*Thank you\.?|\.?)/gi,
  },
  {
    label: 'visiting-crop-circles-banner',
    pattern: /FOR VISITING THE CROP CIRCLES\.?/gi,
  },
  {
    label: 'page-nav-tabs',
    // Optional "GO TO PAGE N/TWO [OF THE REPORT]" lead-in, the fixed tab
    // label sequence (Video/COMMENTS are sometimes present, sometimes not),
    // and any dd/mm/yy sub-page date stamps immediately trailing it.
    pattern:
      /(?:GO TO PAGE (?:\d+|TWO|THREE)(?:\s+OF THE REPORT)?\s*)?AERIAL SHOTS\s*(?:Video\s*)?GROUND SHOTS\s*DIAGRAMS\s*FIELD REPORTS\s*(?:COMMENTS\s*)?(?:ARTICLES)?(?:\s*\d{2}\/\d{2}\/\d{2})*\.?/gi,
  },
  {
    label: 'facebook-discuss-plug',
    pattern: /Discuss this circle on our Facebook Crop Circles-UFO'?s-Ancient Mysteries-Scientific Speculations/gi,
  },
  {
    label: 'dvd-membership-plug',
    pattern: /CLICK HERE FOR THE LATEST CROP CIRCLE CONNECTOR DVD/gi,
  },
  {
    label: 'truncated-tail',
    // Some `copyright_notice` values are hard-truncated by the source
    // extraction well before these banners finish — as short as 150 chars,
    // sometimes cutting off before "donation" even reaches "site alive" —
    // a separate parser bug, not something text cleanup can fully fix.
    // Runs last and is anchored to end-of-string: by this point the earlier
    // rules have already removed every *complete* instance of these
    // phrases (regardless of what follows them), so anything still opening
    // with one of these leads and running to the literal end of the string
    // is a leftover truncated fragment, never real trailing content.
    pattern: /(?:Make a donation|CLICK HERE FOR THE LATEST).*$/i,
  },
];

/**
 * Returns the cleaned text, or null if nothing meaningful survives (some
 * records' entire field was this chrome and nothing else). Returns the
 * original text unchanged (same string reference) when no rule matched, so
 * callers can cheaply detect "nothing to do".
 */
export function stripSiteChrome(raw: string): string | null {
  let text = raw;
  for (const rule of RULES) {
    text = text.replace(rule.pattern, ' ');
  }
  if (text === raw) return raw;

  text = text
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1') // "word ." left by a removed neighbor -> "word."
    .replace(/(\.\s*){2,}/g, '. ') // ". ." / ". . ." collapse to one
    .trim();

  return text || null;
}
