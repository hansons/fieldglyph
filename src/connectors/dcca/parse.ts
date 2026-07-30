import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type {
  DatePrecision,
  FetchResult,
  ParsedFormation,
  ParsedMedia,
} from '../../core/types.ts';

const COPYRIGHT_NOTICE =
  '© DCCA (Dutch Crop Circle Archive) unless otherwise noted — see https://www.dcca.nl/dcca.htm';

// English + Dutch month names, matched on their first three letters.
const MONTH_NAMES: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  maa: '03', // maart
  mrt: '03',
  apr: '04',
  may: '05',
  mei: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  okt: '10',
  nov: '11',
  dec: '12',
};

const TITLE_RE = /^(\d+)-\s*(.+?),\s*([^,]+),\s*(\d{2})-(\d{2})-(\d{4})$/;

// --- shared helpers -------------------------------------------------------

interface EntryTitle {
  index?: string;
  locationName?: string;
  adminRegion?: string;
  discoveredDate?: string;
  precision: DatePrecision;
  display: string;
  warnings: string[];
}

/**
 * Lenient title parser for the pre-2001 templates, where formats drift:
 * "01- Assen, Drenthe, 1590.", "11- Enschede, Overijsel, 07-1999.",
 * "04- Poortugal, Zuid Holland, July 2000.", "02- Noord-Brabant, 1933 - 1965.",
 * "03- Ubachsberg, Limburg 03-06-2000." (missing comma), "15, 16- ..." (multi).
 */
function parseEntryTitle(raw: string): EntryTitle {
  const warnings: string[] = [];
  let text = raw
    .replace(/\/div>?/gi, '') // literal "/div>" garbage from broken 1999-era markup
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');

  let index: string | undefined;
  const indexMatch = /^(\d+(?:\s*,\s*\d+)*)\s*-\s*/.exec(text);
  if (indexMatch) {
    index = indexMatch[1]!.replace(/\s/g, '').replace(/,/g, '-');
    text = text.slice(indexMatch[0].length);
  }

  let discoveredDate: string | undefined;
  let precision: DatePrecision = 'unknown';
  let rest = text;

  const dayMatch = /,?\s*(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(rest);
  const rangeMatch = /,?\s*(\d{4})\s*-\s*(\d{4})$/.exec(rest);
  const monthNumMatch = /,?\s*(\d{1,2})-(\d{4})$/.exec(rest);
  const monthNameMatch = /,?\s*([A-Za-z]+)\s+(\d{4})$/.exec(rest);
  const yearMatch = /,?\s*(\d{4})$/.exec(rest);

  if (dayMatch) {
    discoveredDate = `${dayMatch[3]}-${dayMatch[2]!.padStart(2, '0')}-${dayMatch[1]!.padStart(2, '0')}`;
    precision = 'day';
    rest = rest.slice(0, dayMatch.index);
  } else if (rangeMatch) {
    discoveredDate = rangeMatch[1];
    precision = 'year';
    warnings.push(
      `Source gives a date range "${rangeMatch[1]} - ${rangeMatch[2]}"; stored the start year only.`,
    );
    rest = rest.slice(0, rangeMatch.index);
  } else if (monthNumMatch) {
    discoveredDate = `${monthNumMatch[2]}-${monthNumMatch[1]!.padStart(2, '0')}`;
    precision = 'month';
    rest = rest.slice(0, monthNumMatch.index);
  } else if (monthNameMatch && MONTH_NAMES[monthNameMatch[1]!.slice(0, 3).toLowerCase()]) {
    const month = MONTH_NAMES[monthNameMatch[1]!.slice(0, 3).toLowerCase()];
    discoveredDate = `${monthNameMatch[2]}-${month}`;
    precision = 'month';
    rest = rest.slice(0, monthNameMatch.index);
  } else if (yearMatch) {
    discoveredDate = yearMatch[1];
    precision = 'year';
    rest = rest.slice(0, yearMatch.index);
  } else {
    warnings.push(`No parseable date found in title: "${raw.trim()}"`);
  }

  const parts = rest
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  let locationName: string | undefined;
  let adminRegion: string | undefined;
  if (parts.length >= 2) {
    adminRegion = parts[parts.length - 1];
    locationName = parts.slice(0, -1).join(', ');
  } else if (parts.length === 1) {
    locationName = parts[0];
  }

  return { index, locationName, adminRegion, discoveredDate, precision, display: text, warnings };
}

function mediaKind(url: string): ParsedMedia['kind'] {
  if (/diagram/i.test(url)) return 'diagram';
  if (/\.gif$/i.test(url)) return 'diagram'; // old DCCA pages use gif line-drawings for formations
  if (/\.(jpe?g|png)$/i.test(url)) return 'photo';
  return 'other';
}

/** Formation imagery lives under /YYYY/; nav buttons, country maps, and chrome do not. */
function isFormationImage(resolved: URL): boolean {
  const path = resolved.pathname;
  if (!/^\/\d{4}\//.test(path)) return false;
  const filename = path.split('/').pop() ?? '';
  if (/^nederland/i.test(filename)) return false; // per-year country map images
  if (/^\d{4}a?\.(jpe?g|gif|png)$/i.test(filename)) return false; // year nav buttons
  if (/^dcc\d+\./i.test(filename)) return false; // year header banners
  return true;
}

function resolveUrl(href: string | undefined, base: string): URL | null {
  if (!href) return null;
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

/**
 * True for pre-2001-style formation detail links: two path segments under a year
 * directory (e.g. /1999/uk57.htm, /2000/ub-uk.htm), excluding year-index pages
 * themselves and Dutch-language duplicates.
 */
export function isOldDetailUrl(resolved: URL): boolean {
  const path = resolved.pathname;
  if (!/^\/\d{4}\/[^/]+\.html?$/i.test(path)) return false;
  const filename = path.split('/').pop() ?? '';
  if (/^\d{4}[a-z]?(-uk|-nl)?\.html?$/i.test(filename)) return false; // year index / nav
  if (/-nl\.html?$/i.test(filename)) return false; // Dutch duplicates of -uk pages
  if (/^oud(-uk|-nl)?\.html?$/i.test(filename)) return false; // the 1979 year index
  return true;
}

function yearFromUrl(url: string): string | undefined {
  const match = /\/(\d{4})\//.exec(new URL(url).pathname);
  return match?.[1];
}

// --- document-order tokenizer for the old templates -----------------------

type Token =
  | { kind: 'hr' }
  | { kind: 'text'; text: string }
  | { kind: 'img'; src: string; alt?: string }
  | { kind: 'link'; href: string; text: string };

interface DomNode {
  type: string;
  name?: string;
  data?: string;
  children?: DomNode[];
  attribs?: Record<string, string>;
}

function collectText(node: DomNode): string {
  if (node.type === 'text') return node.data ?? '';
  if (node.type === 'script' || node.type === 'style' || node.type === 'comment') return '';
  return (node.children ?? []).map(collectText).join('');
}

function tokenize(node: DomNode, tokens: Token[]): void {
  if (node.type === 'text') {
    const text = (node.data ?? '').replace(/\s+/g, ' ').trim();
    if (text) tokens.push({ kind: 'text', text });
    return;
  }
  if (node.type === 'script' || node.type === 'style' || node.type === 'comment') return;
  if (node.type === 'tag') {
    if (node.name === 'head' || node.name === 'title') return;
    if (node.name === 'hr') {
      tokens.push({ kind: 'hr' });
      return;
    }
    if (node.name === 'a' && node.attribs?.href) {
      tokens.push({
        kind: 'link',
        href: node.attribs.href,
        text: collectText(node).replace(/\s+/g, ' ').trim(),
      });
      return;
    }
    if (node.name === 'img' && node.attribs?.src) {
      tokens.push({ kind: 'img', src: node.attribs.src, alt: node.attribs.alt });
      return;
    }
  }
  for (const child of node.children ?? []) tokenize(child, tokens);
}

function mediaFromTokens(tokens: Token[], baseUrl: string): ParsedMedia[] {
  const media: ParsedMedia[] = [];
  for (const token of tokens) {
    if (token.kind !== 'img') continue;
    const resolved = resolveUrl(token.src, baseUrl);
    if (resolved && isFormationImage(resolved)) {
      const altCopyright =
        token.alt && /copyright/i.test(token.alt) ? token.alt.trim() : undefined;
      media.push({
        url: resolved.toString(),
        kind: mediaKind(resolved.pathname),
        copyrightNotice: altCopyright ?? COPYRIGHT_NOTICE,
      });
    }
  }
  return media;
}

function tokenizePage($: CheerioAPI): Token[][] {
  const tokens: Token[] = [];
  const root = $.root()[0] as unknown as DomNode;
  tokenize(root, tokens);

  const segments: Token[][] = [];
  let current: Token[] = [];
  for (const token of tokens) {
    if (token.kind === 'hr') {
      segments.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  segments.push(current);
  return segments;
}

// --- page parsers ---------------------------------------------------------

function verificationFromDescription(description: string): {
  status: 'reported' | 'hoax-suspected';
  warning?: string;
} {
  if (description.toLowerCase().includes('hoax')) {
    return {
      status: 'hoax-suspected',
      warning:
        'Marked hoax-suspected via keyword heuristic ("hoax" found in description text), not a structured field.',
    };
  }
  return { status: 'reported' };
}

/** 2001+ detail pages: span.k title, span.t body. */
function parseNewDetailPage($: CheerioAPI, fetchResult: FetchResult): ParsedFormation[] {
  const warnings: string[] = [];

  const titleEl = $('span.k').first();
  const rawTitle = titleEl.text().replace(/\s+/g, ' ').trim();
  const match = TITLE_RE.exec(rawTitle);

  let externalId: string | undefined;
  let locationName: string | undefined;
  let adminRegion: string | undefined;
  let discoveredDate: string | undefined;
  let title = rawTitle || undefined;

  let discoveredDatePrecision: DatePrecision = 'unknown';

  if (match) {
    const [, index, location, region, day, month, year] = match;
    externalId = `${year}-${index}`;
    locationName = location;
    adminRegion = region;
    discoveredDate = `${year}-${month}-${day}`;
    discoveredDatePrecision = 'day';
    title = `${location}, ${region}, ${day}-${month}-${year}`;
  } else if (rawTitle) {
    // Fall back to the lenient parser for the many title drifts across the site's
    // history: "06 - Hoeven" (spaced dash), "juli 2005" (Dutch month), "Andel Noord
    // Brabant, ..." (missing comma). An unclosed <span class="k"> can also swallow
    // the whole report into the title — truncate at the first full date if so.
    const truncated = /^(.+?\d{1,2}-\d{1,2}-\d{4})/.exec(rawTitle)?.[1] ?? rawTitle;
    const entry = parseEntryTitle(truncated);
    if (entry.discoveredDate) {
      externalId = entry.index
        ? `${entry.discoveredDate.slice(0, 4)}-${entry.index}`
        : undefined;
      locationName = entry.locationName;
      adminRegion = entry.adminRegion;
      discoveredDate = entry.discoveredDate;
      discoveredDatePrecision = entry.precision;
      title = entry.display;
      warnings.push(...entry.warnings);
      if (truncated !== rawTitle) {
        warnings.push('Title element was unclosed and swallowed the report body; truncated at the first date.');
      }
    } else {
      warnings.push(
        `Title did not match the expected "NN- Location, Region, DD-MM-YYYY" pattern: "${rawTitle}"`,
      );
    }
  }

  const descriptionEl = $('span.t').first();
  descriptionEl.find('br').each((_, el) => {
    $(el).replaceWith('\n');
  });
  const description = descriptionEl
    .clone()
    .find('img, center, p:has(a[href*="back"]), p:has(a[href^="javascript"])')
    .remove()
    .end()
    .text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const media: ParsedMedia[] = [];
  descriptionEl.find('img').each((_, el) => {
    const src = $(el).attr('src');
    if (!src || src.includes('/')) return; // skip nav/background images (always in a parent dir)
    const url = new URL(src, fetchResult.url).toString();
    const kind = /diagram/i.test(src) ? 'diagram' : 'photo';
    media.push({ url, kind, copyrightNotice: COPYRIGHT_NOTICE });
  });

  if ($('a[href*="continue"], a[href$="2-uk.htm"]').length > 0) {
    warnings.push(
      'Page links to a continuation page (multi-page report) — only the first page was captured.',
    );
  }

  const verification = verificationFromDescription(description);
  if (verification.warning) warnings.push(verification.warning);

  return [
    {
      externalId,
      title,
      description: description || undefined,
      discoveredDate,
      discoveredDatePrecision,
      locationName,
      country: 'Netherlands',
      adminRegion,
      coordinateSource: 'unknown',
      locationPrecision: 'place-name-only',
      verificationStatus: verification.status,
      media,
      parseWarnings: warnings.length > 0 ? warnings : undefined,
    },
  ];
}

/** Pre-2001 detail pages: div#kop title, div#tekst body, images outside the text div. */
function parseOldDetailPage($: CheerioAPI, fetchResult: FetchResult): ParsedFormation[] {
  const segments = tokenizePage($);
  const tokens = segments.flat();

  const titleToken = tokens.find((t) => t.kind === 'text');
  const rawTitle = titleToken?.kind === 'text' ? titleToken.text : '';
  const entry = parseEntryTitle(rawTitle);
  const warnings = [...entry.warnings];

  const description = tokens
    .filter((t): t is Extract<Token, { kind: 'text' }> => t.kind === 'text')
    .slice(1)
    .map((t) => t.text)
    .join('\n')
    .trim();

  const media = mediaFromTokens(tokens, fetchResult.url);

  const year = entry.discoveredDate?.slice(0, 4) ?? yearFromUrl(fetchResult.url);
  const verification = verificationFromDescription(description);
  if (verification.warning) warnings.push(verification.warning);

  return [
    {
      externalId: entry.index && year ? `${year}-${entry.index}` : undefined,
      title: entry.display || undefined,
      description: description || undefined,
      discoveredDate: entry.discoveredDate,
      discoveredDatePrecision: entry.precision,
      locationName: entry.locationName,
      country: 'Netherlands',
      adminRegion: entry.adminRegion,
      coordinateSource: 'unknown',
      locationPrecision: 'place-name-only',
      verificationStatus: verification.status,
      media,
      parseWarnings: warnings.length > 0 ? warnings : undefined,
    },
  ];
}

/**
 * Pre-2001 year-index pages list formations inline, separated by <hr>, most with
 * no dedicated detail page. Entries that DO link to a detail page are skipped here
 * — discovery yields those pages separately, and parsing them there gets the
 * fuller report without double-counting.
 */
function parseOldYearIndexPage($: CheerioAPI, fetchResult: FetchResult): ParsedFormation[] {
  const segments = tokenizePage($);
  const formations: ParsedFormation[] = [];
  const pageYear = yearFromUrl(fetchResult.url);

  for (const segment of segments) {
    const hasDetailLink = segment.some((t) => {
      if (t.kind !== 'link') return false;
      const resolved = resolveUrl(t.href, fetchResult.url);
      return resolved !== null && isOldDetailUrl(resolved);
    });
    if (hasDetailLink) continue;

    const titleIdx = segment.findIndex((t) => t.kind === 'text' && /^\d+[\d\s,]*-\s*/.test(t.text));
    if (titleIdx === -1) continue;

    const titleToken = segment[titleIdx] as Extract<Token, { kind: 'text' }>;
    const entry = parseEntryTitle(titleToken.text);
    const warnings = [...entry.warnings];
    warnings.push('Parsed from an inline year-index listing; the source has no dedicated detail page.');

    if (entry.index?.includes('-')) {
      warnings.push(
        `Source lists this as multiple formations under one entry ("${entry.index.replace('-', ', ')}"); stored as a single record.`,
      );
    }

    const description = segment
      .slice(titleIdx + 1)
      .filter((t): t is Extract<Token, { kind: 'text' }> => t.kind === 'text')
      .map((t) => t.text)
      .join('\n')
      .trim();

    const media = mediaFromTokens(segment, fetchResult.url);

    const year = entry.discoveredDate?.slice(0, 4) ?? pageYear;
    const verification = verificationFromDescription(description);
    if (verification.warning) warnings.push(verification.warning);

    formations.push({
      externalId: entry.index && year ? `${year}-${entry.index}` : undefined,
      title: entry.display || undefined,
      description: description || undefined,
      discoveredDate: entry.discoveredDate,
      discoveredDatePrecision: entry.precision,
      locationName: entry.locationName,
      country: 'Netherlands',
      adminRegion: entry.adminRegion,
      coordinateSource: 'unknown',
      locationPrecision: 'place-name-only',
      verificationStatus: verification.status,
      media,
      parseWarnings: warnings,
    });
  }

  return formations;
}

export function parseDccaFormation(fetchResult: FetchResult): ParsedFormation[] {
  const $ = cheerio.load(fetchResult.html);
  if ($('span.k').length > 0) return parseNewDetailPage($, fetchResult);
  if ($('#kop').length > 0) return parseOldDetailPage($, fetchResult);
  return parseOldYearIndexPage($, fetchResult);
}
