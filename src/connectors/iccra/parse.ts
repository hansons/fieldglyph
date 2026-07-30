import * as cheerio from 'cheerio';
import type {
  DatePrecision,
  FetchResult,
  ParsedFormation,
  ParsedMedia,
  SourcePage,
} from '../../core/types.ts';

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

const SEASONS = new Set(['spring', 'summer', 'fall', 'autumn', 'winter']);

// Site chrome that must never be recorded as formation imagery.
const CHROME_IMAGE_RE = /ICCRAheader|line\.jpg|map_key|smcc\.|bbcc\.|miamisburg|mbcc\.|spacer/i;

interface UsDate {
  date?: string;
  precision: DatePrecision;
  warning?: string;
}

/** "November 16, 1973" / "April 1995" / "July, 1993" / "Summer 1955" / "1975". */
export function parseUsDate(raw: string): UsDate {
  const text = raw.replace(/\s+/g, ' ').trim();

  const full = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  if (full) {
    const month = MONTHS[full[1]!.slice(0, 3).toLowerCase()];
    if (month) {
      return { date: `${full[3]}-${month}-${full[2]!.padStart(2, '0')}`, precision: 'day' };
    }
  }

  const monthYear = /^([A-Za-z]+),?\s+(\d{4})$/.exec(text);
  if (monthYear) {
    const word = monthYear[1]!.toLowerCase();
    const month = MONTHS[word.slice(0, 3)];
    if (month) return { date: `${monthYear[2]}-${month}`, precision: 'month' };
    if (SEASONS.has(word)) {
      return {
        date: monthYear[2],
        precision: 'year',
        warning: `Source gives a season ("${text}"); stored the year only.`,
      };
    }
  }

  const yearOnly = /^(\d{4})$/.exec(text);
  if (yearOnly) return { date: yearOnly[1], precision: 'year' };

  const anyYear = /\b(\d{4})\b/.exec(text);
  if (anyYear) {
    return {
      date: anyYear[1],
      precision: 'year',
      warning: `Unrecognized date format "${text}"; stored the year only.`,
    };
  }

  return { precision: 'unknown', warning: `No parseable date in "${text}"` };
}

interface ListEntry {
  locationName?: string;
  date?: string;
  precision: DatePrecision;
  display: string;
  warnings: string[];
}

/** "Lemon Grove, San Diego County (November 16, 1973)" — the last parens hold the date. */
export function parseListEntry(raw: string): ListEntry {
  const display = raw.replace(/\s+/g, ' ').trim();
  const warnings: string[] = [];

  const dateMatch = /\(([^()]*)\)\s*$/.exec(display);
  let locationName: string | undefined;
  let date: string | undefined;
  let precision: DatePrecision = 'unknown';

  if (dateMatch) {
    const parsed = parseUsDate(dateMatch[1]!);
    date = parsed.date;
    precision = parsed.precision;
    if (parsed.warning) warnings.push(parsed.warning);
    locationName = display.slice(0, dateMatch.index).replace(/[,\s]+$/, '').trim() || undefined;
  } else {
    // Nested parens like "(October (late) 2005)" defeat the clean group match;
    // salvage at least the year.
    const anyYear = /\b(\d{4})\b/.exec(display);
    if (anyYear) {
      date = anyYear[1];
      precision = 'year';
      warnings.push(`Irregular date format in "${display}"; stored the year only.`);
    } else {
      warnings.push(`No trailing "(date)" group in listing entry: "${display}"`);
    }
    locationName = display || undefined;
  }

  return { locationName, date, precision, display, warnings };
}

export function stateFromUrl(url: string): string | undefined {
  const match = /\/bystate\/([^/]+)\//.exec(decodeURIComponent(new URL(url).pathname));
  return match?.[1];
}

export function isStateIndexUrl(url: string): boolean {
  return /\/ICCRA_[A-Za-z]+\.html?$/i.test(new URL(url).pathname);
}

export function isDetailUrl(url: URL): boolean {
  return /\/bystate\/[^/]+\/ICCRA - /i.test(decodeURIComponent(url.pathname));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** State pages: parse the <li> entries that have no detail page of their own. */
function parseStatePage($: cheerio.CheerioAPI, fetchResult: FetchResult): ParsedFormation[] {
  const state = stateFromUrl(fetchResult.url);
  const formations: ParsedFormation[] = [];

  $('ul li').each((_, el) => {
    const li = $(el);
    if (li.find('a[href]').length > 0) return; // has a detail page; parsed there instead

    const entry = parseListEntry(li.text());
    if (!entry.locationName && !entry.date) return;

    formations.push({
      externalId: state ? `${state}-${slugify(entry.display)}` : slugify(entry.display),
      title: entry.display,
      discoveredDate: entry.date,
      discoveredDatePrecision: entry.precision,
      locationName: entry.locationName,
      country: 'United States',
      adminRegion: state,
      coordinateSource: 'unknown',
      locationPrecision: 'place-name-only',
      verificationStatus: 'reported',
      media: [],
      parseWarnings: [
        ...entry.warnings,
        'Parsed from the state index listing; the source has no dedicated detail page.',
      ],
    });
  });

  return formations;
}

/** Detail pages: title + report paragraphs live in the left content column. */
function parseDetailPage($: cheerio.CheerioAPI, fetchResult: FetchResult): ParsedFormation[] {
  const warnings: string[] = [];

  let titleParagraph: cheerio.Cheerio<never> | undefined;
  let stateName: string | undefined;
  let rawTitle = '';

  $('p').each((_, el) => {
    if (titleParagraph) return;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const match = /Reported Crop Circles for the State\s*of\s*(.+?)\s*-\s*(.+)/.exec(text);
    if (match) {
      titleParagraph = $(el) as cheerio.Cheerio<never>;
      stateName = match[1];
      rawTitle = match[2]!;
    }
  });

  const state = stateName ?? stateFromUrl(fetchResult.url);
  let entry = parseListEntry(rawTitle);

  // Several states' detail pages (MN, TX, WV, PR) lack the standard title heading
  // entirely — but the filename itself is "ICCRA - XX - Location, County (Date)".
  if (!entry.date || !entry.locationName) {
    const filename = decodeURIComponent(new URL(fetchResult.url).pathname)
      .split('/')
      .pop()!
      .replace(/\.html?$/i, '');
    const fromFilename = /^ICCRA\s*-\s*[A-Za-z .]+\s*-\s*(.+)$/.exec(filename);
    if (fromFilename) {
      const filenameEntry = parseListEntry(fromFilename[1]!);
      if (filenameEntry.date || filenameEntry.locationName) {
        entry = filenameEntry;
        warnings.push(
          'Location/date recovered from the page filename; the page body lacked a parseable title.',
        );
      }
    }
  }
  warnings.push(...entry.warnings);
  if (!titleParagraph) {
    warnings.push('No "Reported Crop Circles for the State of ..." title found on detail page.');
  }

  const contentTd = titleParagraph ? titleParagraph.closest('td') : $('td[width="631"]').first();

  const paragraphs: string[] = [];
  contentTd.find('p').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (/Reported Crop Circles for the State/.test(text)) return;
    if (/Page last updated on/i.test(text)) return;
    if (/©|&copy;|\d{4} ICCRA/.test(text)) return;
    paragraphs.push(text);
  });
  const description = paragraphs.join('\n\n').trim();

  const flatText = contentTd.text().replace(/\s+/g, ' ');
  const cropTypeMatch = /Crop type:\s*(.+?)(?:\.|\bSource\b|$)/i.exec(flatText);
  const cropType = cropTypeMatch?.[1]?.trim() || undefined;

  const media: ParsedMedia[] = [];
  contentTd.find('img').each((_, el) => {
    const src = $(el).attr('src');
    if (!src || CHROME_IMAGE_RE.test(src)) return;
    try {
      media.push({
        url: new URL(src, fetchResult.url).toString(),
        kind: 'photo',
        copyrightNotice: '© ICCRA - Jeffrey & Delsey Wilson — see https://iccra.org/about.htm',
      });
    } catch {
      /* unresolvable src — skip */
    }
  });

  const filename = decodeURIComponent(new URL(fetchResult.url).pathname)
    .split('/')
    .pop()!
    .replace(/\.html?$/i, '');

  const verification = description.toLowerCase().includes('hoax')
    ? ('hoax-suspected' as const)
    : ('reported' as const);
  if (verification === 'hoax-suspected') {
    warnings.push(
      'Marked hoax-suspected via keyword heuristic ("hoax" found in description text), not a structured field.',
    );
  }

  return [
    {
      externalId: filename,
      title: entry.display || undefined,
      description: description || undefined,
      discoveredDate: entry.date,
      discoveredDatePrecision: entry.precision,
      locationName: entry.locationName,
      country: 'United States',
      adminRegion: state,
      coordinateSource: 'unknown',
      locationPrecision: 'place-name-only',
      cropType,
      verificationStatus: verification,
      media,
      parseWarnings: warnings.length > 0 ? warnings : undefined,
    },
  ];
}

export function parseIccraPage(fetchResult: FetchResult, _page?: SourcePage): ParsedFormation[] {
  const $ = cheerio.load(fetchResult.html);
  if (isStateIndexUrl(fetchResult.url)) return parseStatePage($, fetchResult);
  return parseDetailPage($, fetchResult);
}
