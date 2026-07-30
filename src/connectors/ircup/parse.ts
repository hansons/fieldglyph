import * as cheerio from 'cheerio';
import type { FetchResult, ParsedFormation } from '../../core/types.ts';

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

const COUNTRY_CODES: Record<string, string> = {
  UK: 'United Kingdom',
  US: 'United States',
  NE: 'Netherlands',
};

// "Etchilhampton (2), Wiltshire, UK - 15th Jul 2008"
const TITLE_RE = /^(.+?),\s*([^,]+?),\s*([A-Za-z]{2,3})\s*-\s*(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})$/;

export function parseIrcupFeed(fetchResult: FetchResult): ParsedFormation[] {
  const $ = cheerio.load(fetchResult.html, { xmlMode: true });
  const formations: ParsedFormation[] = [];

  $('item').each((_, el) => {
    const item = $(el);
    const rawTitle = item.find('title').first().text().trim();
    const link = item.find('link').first().text().trim();
    const description = item.find('description').first().text().trim() || undefined;
    const warnings: string[] = [];

    let externalId: string | undefined;
    try {
      externalId = link ? (new URL(link).searchParams.get('d') ?? undefined) : undefined;
    } catch {
      externalId = undefined;
    }

    const match = TITLE_RE.exec(rawTitle);
    let locationName: string | undefined;
    let adminRegion: string | undefined;
    let country: string | undefined;
    let discoveredDate: string | undefined;
    let title = rawTitle || undefined;

    if (match) {
      const location = match[1]!;
      const region = match[2]!;
      const countryCode = match[3]!;
      const day = match[4]!;
      const monthName = match[5]!;
      const year = match[6]!;
      const month = MONTHS[monthName.slice(0, 3).toLowerCase()];
      locationName = location;
      adminRegion = region;
      country = COUNTRY_CODES[countryCode.toUpperCase()] ?? countryCode.toUpperCase();
      if (month) {
        discoveredDate = `${year}-${month}-${day.padStart(2, '0')}`;
      } else {
        warnings.push(`Unrecognized month name "${monthName}" in title: "${rawTitle}"`);
      }
    } else if (rawTitle) {
      warnings.push(
        `Title did not match the expected "Location, Region, CC - Dth Mon YYYY" pattern: "${rawTitle}"`,
      );
    }

    formations.push({
      externalId,
      title,
      description,
      discoveredDate,
      discoveredDatePrecision: discoveredDate ? 'day' : 'unknown',
      locationName,
      country,
      adminRegion,
      coordinateSource: 'unknown',
      locationPrecision: 'place-name-only',
      verificationStatus: 'reported',
      media: [],
      parseWarnings: warnings.length > 0 ? warnings : undefined,
    });
  });

  return formations;
}
