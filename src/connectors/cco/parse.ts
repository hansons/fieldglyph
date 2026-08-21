import * as cheerio from 'cheerio';
import type { FetchResult, ParsedFormation, ParsedMedia } from '../../core/types.ts';

// URL slug (as used in /archive/crop-circles-archive-<slug>.htm) -> canonical
// country name, matched to the spelling already used elsewhere in the archive.
export const COUNTRY_BY_SLUG: Record<string, string> = {
  australia: 'Australia',
  austria: 'Austria',
  belgium: 'Belgium',
  bosnia: 'Bosnia and Herzegovina',
  brazil: 'Brazil',
  canada: 'Canada',
  croatia: 'Croatia',
  cyprus: 'Cyprus',
  czech: 'Czech Republic',
  denmark: 'Denmark',
  finland: 'Finland',
  france: 'France',
  germany: 'Germany',
  hungary: 'Hungary',
  indonesia: 'Indonesia',
  italy: 'Italy',
  korea: 'South Korea',
  mexico: 'Mexico',
  netherlands: 'Netherlands',
  'new-zealand': 'New Zealand',
  norway: 'Norway',
  poland: 'Poland',
  russia: 'Russia',
  slovakia: 'Slovakia',
  slovenia: 'Slovenia',
  spain: 'Spain',
  sweden: 'Sweden',
  switzerland: 'Switzerland',
  'united-kingdom': 'United Kingdom',
  usa: 'United States',
};

const COPYRIGHT_NOTICE = 'cropcirclesonline.com archive — photographer not credited';

export function countrySlugFromUrl(url: string): string | undefined {
  return /\/archive\/crop-circles-archive-([a-z-]+)\.htm$/i.exec(new URL(url).pathname)?.[1];
}

function resolveUrl(href: string | undefined, base: string): URL | null {
  if (!href) return null;
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

/** Thumbnails live under ph200/; the full-size photo is the same filename under ph/. */
function fullSizeImageUrl(thumbUrl: URL): string {
  return thumbUrl.toString().replace('/ph200/', '/ph/');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Country archive pages are one big table: date | "Crop circle at <place>" |
 * crop type | optional thumbnail linking to a ph/crop-circle-photo-NNNN.htm
 * detail page. Every country (29 of them) shares this exact template, so one
 * parser covers all of them — driven entirely by the URL slug for country name.
 */
export function parseCcoCountryPage(fetchResult: FetchResult): ParsedFormation[] {
  const slug = countrySlugFromUrl(fetchResult.url);
  const country = slug ? COUNTRY_BY_SLUG[slug] : undefined;

  const $ = cheerio.load(fetchResult.html);
  const formations: ParsedFormation[] = [];

  $('tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;

    const dateText = $(cells[0]).text().trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return; // header/spacer row, not a data row

    const rawTitle = $(cells[1]!).text().replace(/\s+/g, ' ').trim();
    const locationName = rawTitle.replace(/^crop circles?\s+at\s+/i, '').trim() || undefined;

    const cropTypeText = $(cells[2]!).text().trim();
    const cropType = cropTypeText || undefined;

    const photoLink = cells.length > 3 ? $(cells[3]!).find('a[href]').first() : null;
    const photoHref = photoLink?.attr('href');
    const photoUrl = resolveUrl(photoHref, fetchResult.url);
    const photoIdMatch = photoHref ? /crop-circle-photo-(\d+)\.htm$/i.exec(photoHref) : null;

    const media: ParsedMedia[] = [];
    if (photoUrl) {
      const thumbSrc = $(cells[3]!).find('img[src]').first().attr('src');
      const thumbUrl = resolveUrl(thumbSrc, fetchResult.url);
      if (thumbUrl) {
        media.push({
          url: fullSizeImageUrl(thumbUrl),
          kind: 'photo',
          copyrightNotice: COPYRIGHT_NOTICE,
        });
      }
    }

    const externalId = photoIdMatch
      ? `photo-${photoIdMatch[1]}`
      : slug
        ? `${slug}-${slugify(`${dateText}-${rawTitle}`)}`
        : undefined;

    const warnings: string[] = [];
    if (!country) warnings.push(`Unrecognized country slug "${slug ?? '(none)'}" in page URL.`);

    formations.push({
      externalId,
      title: locationName,
      discoveredDate: dateText,
      discoveredDatePrecision: 'day',
      locationName,
      country,
      coordinateSource: 'unknown',
      locationPrecision: 'place-name-only',
      cropType,
      verificationStatus: 'reported',
      media,
      parseWarnings: warnings.length > 0 ? warnings : undefined,
    });
  });

  return formations;
}
