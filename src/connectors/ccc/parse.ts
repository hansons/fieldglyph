import * as cheerio from 'cheerio';
import { osGridToLatLon } from '../../core/geo.ts';
import type {
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

// Countries that appear as the trailing segment of international formation titles.
// Anything not matched defaults to the UK, which is where the vast majority sit.
const COUNTRIES = new Set([
  'germany',
  'france',
  'netherlands',
  'holland',
  'italy',
  'switzerland',
  'belgium',
  'poland',
  'czech republic',
  'slovakia',
  'slovenia',
  'austria',
  'spain',
  'usa',
  'united states',
  'canada',
  'mexico',
  'brazil',
  'argentina',
  'russia',
  'ukraine',
  'hungary',
  'croatia',
  'serbia',
  'denmark',
  'sweden',
  'norway',
  'finland',
  'australia',
  'new zealand',
  'japan',
  'indonesia',
  'india',
  'israel',
  'turkey',
]);

function yearFromUrl(url: string): string | undefined {
  // Matches /2026/, /archives/1990/, and international dirs like /inter2000/.
  return /\/(?:inter)?(\d{4})\//i.exec(new URL(url).pathname)?.[1];
}

// Credit lines ("Images Nick Bull Copyright 2019") and site boilerplate that can
// appear bolded in the same gallery cell as a genuine caption.
const NON_CAPTION_RE =
  /copyright|^images?\b|facebook|crop circle connector|membership|map ref|has been accessed|^updated\b/i;

function isCaptionCandidate(text: string): boolean {
  return text.length >= 15 && !NON_CAPTION_RE.test(text);
}

// Nested/malformed <b> tags on these pages can yield overlapping captures of the
// same sentence; keep only the longest span covering each one.
function mergeCaptions(parts: string[]): string | undefined {
  const kept: string[] = [];
  for (const part of parts) {
    if (kept.some((k) => k.includes(part))) continue;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (part.includes(kept[i]!)) kept.splice(i, 1);
    }
    kept.push(part);
  }
  return kept.length > 0 ? kept.join(' ') : undefined;
}

// Camera auto-naming (DSCF1234.jpg, IMG_5678.jpg, P1020982.gif, MVC-024F.jpg, DSCN…)
// never collides with hand-named site chrome, so it's a safe positive signal for a
// real formation photo even when it isn't in the page's own directory.
const CAMERA_FILENAME_RE = /^(dscf?_?|img_?|dcp_?|mvc-?|p\d)/i;

interface ManualPhoto {
  url: string;
  isAerial?: boolean;
  photographer?: string;
  copyrightNotice: string;
  caption?: string;
}

const CCA_POLICY_NOTICE =
  'Per-photographer copyright — see http://www.cropcircleconnector.com/anasazi/ImageUsePolicy2004.html';

// A handful of confirmed real photos for formations that otherwise have zero media —
// hand-verified (fetched, opened, confirmed to show the actual formation, not site
// chrome or a placeholder) rather than caught by a general rule. Keyed by page
// pathname so the exception is auditable and travels with the parser instead of a
// silent DB write. Two groups:
//  - Same-site: a real photo the img-scraping heuristics above still miss, sourced
//    from the same cca/ccc page, so the site's own image-use policy notice applies.
//  - External: no photo exists anywhere on cropcirclearchives.co.uk/cropcircleconnector.com
//    for this formation, but one was located elsewhere online and verified (by place +
//    year, and for UK reports usually exact date) to depict this specific formation.
//    Carries its own source-specific attribution instead of the cca/ccc policy notice.
const MANUAL_EXTRA_PHOTOS: Record<string, ManualPhoto[]> = {
  // Same-site (see austria95.html note below for the one non-obvious URL).
  '/archives/2011/pitt1/pitt2011a.html': [
    { url: 'https://www.cropcirclearchives.co.uk/archives/2011/images/Nr-Pitt03.jpg', isAerial: true, copyrightNotice: CCA_POLICY_NOTICE },
  ],
  // austria95.html's own <img src> is "../archives/1995/korn195.jpg", which resolves to
  // a 404 (the page's relative path has a stray extra "archives/" segment) — the real
  // file is one directory shallower, hence the absolute URL below.
  '/archives/Inter95/austria95.html': [
    { url: 'https://www.cropcirclearchives.co.uk/archives/1995/korn195.jpg', isAerial: true, copyrightNotice: CCA_POLICY_NOTICE },
  ],
  '/2014/wilmington2/wilmington2014b.html': [
    { url: 'https://www.cropcircleconnector.com/2014/wiltshire2/wilmington2014sw.jpg', isAerial: false, copyrightNotice: CCA_POLICY_NOTICE },
  ],
  '/archives/inter99/Vig99a.html': [
    { url: 'https://www.cropcirclearchives.co.uk/archives/inter98/K5w.jpg', isAerial: true, copyrightNotice: CCA_POLICY_NOTICE },
  ],
  // External — recovered via web search, no photo survives on the original site.
  '/archives/1998/unconfirmed98.html': [
    {
      url: 'https://www.lucypringle.co.uk/photos/1998/uk1998ae.jpg',
      isAerial: true,
      photographer: 'Lucy Pringle',
      copyrightNotice: 'Photo © Lucy Pringle — recovered from lucypringle.co.uk, not the original archive',
      caption: 'Newton St Loe, near Bath — two circles, one larger; date and description match this record exactly.',
    },
  ],
  '/archives/inter2000/bainbridge2000a.html': [
    {
      url: 'https://iccra.org/bystate/Ohio/images/bainbridge2000-2.jpg',
      isAerial: true,
      photographer: 'John Timmerman',
      copyrightNotice: 'Photos: John Timmerman, landowner (name withheld); site © 2008 ICCRA — recovered from iccra.org, not the original archive',
    },
  ],
  '/archives/inter99/Cottonwood99a.html': [
    {
      url: 'http://www.iccra.org/bystate/Washington/images/wallawalla1999-1.jpg',
      isAerial: true,
      copyrightNotice: '© 2008 ICCRA — recovered from iccra.org, not the original archive',
    },
  ],
  '/archives/inter99/Borchen99a.html': [
    {
      url: 'https://web.archive.org/web/20000116092103im_/http://fgk.org/99/Berichte/Paderborn-1/PADERB1-Hoos.JPG',
      isAerial: true,
      photographer: 'Hoos (per FGK image filename); field report by Markus Schröder / FGK',
      copyrightNotice: 'Recovered from fgk.org via Wayback Machine snapshot (Jan 2000), not the original archive',
    },
  ],
  // The archive's own source_url for this record is a scraper mismatch (it actually
  // points at an unrelated Lowville, Ontario report with no photo) — a pre-existing
  // parser bug affecting several inter99 pages, not something this photo fixes. The
  // title "Edmonton, Alberta, Canada" independently matches a well-documented, separate
  // Sept 21 1999 Edmonton formation; this photo is of that event, not of whatever
  // Lowville's page actually describes.
  '/archives/inter99/Lowville99a.html': [
    {
      url: 'http://www.cropcirclequest.com/edmonton99/edaerial.jpg',
      isAerial: true,
      photographer: 'R. Manuel (farmer, photo credit); report by Judy Arndt',
      copyrightNotice: 'Recovered from cropcirclequest.com, not the original archive',
      caption:
        'Edmonton, Alberta — seven circles, 21 Sept 1999. Note: this record’s source_url is mismatched to an unrelated Lowville, ON page; matched to this photo by title/place/year, not by the scraped source link.',
    },
  ],
};

export function parseCccFormation(fetchResult: FetchResult, _page?: SourcePage): ParsedFormation[] {
  const $ = cheerio.load(fetchResult.html);
  const warnings: string[] = [];
  const urlYear = yearFromUrl(fetchResult.url);

  // Title wording drifts across years and authors: "Crop Circle at Milk Hill ...
  // Reported 12th July 2026", "Crop Circle near Wrzesnia, Poland. Reported 17th
  // July 2021", "Crop Circle formationsnear Szczecinek, Poland. Reported end of
  // July. 2021" (sic). Location and date are matched separately and leniently.
  // The "Crop Circle at/near" prefix is optional: cropcirclearchives.co.uk pages
  // (same organization, older template) title as just "Location. Reported ...".
  const titleText = $('title').text().replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').trim();
  const titleMatch =
    /^(?:Crop Circles?(?:\s*formations?)?\s*(?:at|near|in)?\s+)?(.+?)\.?\s*Reported\s*(.*)$/i.exec(
      titleText,
    );

  let locationPart: string | undefined;
  let discoveredDate: string | undefined;
  let discoveredDatePrecision: ParsedFormation['discoveredDatePrecision'] = 'unknown';

  if (titleMatch) {
    locationPart = titleMatch[1]!.trim();
    const dateText = titleMatch[2] ?? '';

    const dayMatch = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s*(\d{4})?/.exec(dateText);
    const dayMonth = dayMatch ? MONTHS[dayMatch[2]!.slice(0, 3).toLowerCase()] : undefined;
    if (dayMatch && dayMonth) {
      const year = dayMatch[3] ?? urlYear;
      if (year) {
        discoveredDate = `${year}-${dayMonth}-${dayMatch[1]!.padStart(2, '0')}`;
        discoveredDatePrecision = 'day';
      }
    }
    if (!discoveredDate) {
      // "end of July. 2021", "early June", "July 2020" — settle for the month.
      const monthWord = dateText
        .split(/[^A-Za-z]+/)
        .map((w) => MONTHS[w.slice(0, 3).toLowerCase()])
        .find(Boolean);
      const year = /(\d{4})/.exec(dateText)?.[1] ?? urlYear;
      if (monthWord && year) {
        discoveredDate = `${year}-${monthWord}`;
        discoveredDatePrecision = 'month';
      } else if (year) {
        discoveredDate = year;
        discoveredDatePrecision = 'year';
        warnings.push(`No parseable day/month in title date "${dateText}"; stored the year only.`);
      }
    }
  } else if (titleText) {
    warnings.push(
      `Title did not match the expected "Crop Circle at/near ... Reported ..." pattern: "${titleText}"`,
    );
    // Early archive pages title as just "Location, Region." with no report date —
    // still worth splitting into location fields.
    if (titleText.includes(',')) {
      locationPart = titleText.replace(/\.\s*$/, '').trim();
    }
    if (urlYear) {
      discoveredDate = urlYear;
      discoveredDatePrecision = 'year';
    }
  }

  let locationName: string | undefined;
  let adminRegion: string | undefined;
  let country = 'United Kingdom';
  if (locationPart) {
    const parts = locationPart.split(',').map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1]?.toLowerCase();
    if (last && COUNTRIES.has(last)) {
      country = parts.pop()!;
      country = country.charAt(0).toUpperCase() + country.slice(1);
    }
    if (parts.length >= 2) {
      adminRegion = parts[parts.length - 1];
      locationName = parts.slice(0, -1).join(', ');
    } else {
      locationName = parts[0];
    }
  }

  // "Map Ref: <a href='https://www.streetmap.co.uk/map?...&sv=51.375,+-1.850&...'>SU1052564021</a>"
  let osGridRef: string | undefined;
  let latitude: number | undefined;
  let longitude: number | undefined;
  let coordinateSource: ParsedFormation['coordinateSource'] = 'unknown';

  const mapLink = $('a[href*="streetmap"]').first();
  if (mapLink.length > 0) {
    const refText = mapLink.text().replace(/\s+/g, '').trim();
    if (/^[A-HJ-Z]{2}\d{2,10}$/i.test(refText)) osGridRef = refText.toUpperCase();

    const href = mapLink.attr('href') ?? '';
    // Some pages put OS eastings/northings in sv= instead of lat/lon — range-check
    // before trusting, otherwise "sv=412383,162123" becomes latitude 412383.
    const svMatch = /[?&]sv=([\d.+-]+),\+?(-?[\d.]+)/.exec(href);
    if (svMatch) {
      const lat = Number(svMatch[1]);
      const lon = Number(svMatch[2]);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        latitude = lat;
        longitude = lon;
        coordinateSource = 'source_provided';
      }
    }
    if (latitude === undefined && osGridRef) {
      const converted = osGridToLatLon(osGridRef);
      if (converted) {
        latitude = converted.latitude;
        longitude = converted.longitude;
        coordinateSource = 'os_grid_converted';
      }
    }
  }

  // Formation photos sit in the same directory as the page; all chrome lives in
  // parent directories, so "src without a slash" isolates the real imagery — except
  // camera-generated filenames (DSCF1234.jpg, IMG_5678.jpg, P1020982.gif, MVC-024F.jpg,
  // …), which sometimes get uploaded into a shared sibling folder instead. That naming
  // convention never collides with hand-named chrome, so it's a safe carve-out.
  // Only per-formation-directory "a" pages are the AERIAL SHOTS convention;
  // flat archive pages mix aerial and ground, so leave the flag unset there.
  const pathname = new URL(fetchResult.url).pathname;
  const isAerialPage = /\/[^/]+\/[^/]+a\.html?$/i.test(pathname);
  const media: ParsedMedia[] = [];
  const captionParts: string[] = [];
  const seenCaptionTds = new Set<unknown>();
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    if (!src) return;
    const basename = src.split('/').pop() ?? '';
    if (src.includes('/') && !CAMERA_FILENAME_RE.test(basename)) return;
    // Site-chrome banners (tour/season/meals promo images) are reused verbatim
    // across hundreds of formation directories and are never the formation photo.
    if (/banner/i.test(basename)) return;
    const url = new URL(src, fetchResult.url).toString();

    const td = $(el).closest('td');
    const tdText = td.text().replace(/\s+/g, ' ').trim();
    let copyrightNotice: string | undefined;
    const creditMatch = /((?:IMAGES?|Photos?)\s+[^.]*?copyright[^.]*?)(?:\.|$)/i.exec(tdText);
    if (creditMatch) {
      copyrightNotice = creditMatch[1]!.trim().slice(0, 300);
    } else if (/copyright/i.test(tdText)) {
      copyrightNotice = tdText.slice(0, 300);
    }

    // A caption sentence — location/size/shape — sometimes sits bolded in the
    // same cell as the photos, ahead of the "Images ... Copyright" credit line.
    // Visit each gallery cell once; multiple photos commonly share one <td>.
    const tdEl = td.get(0);
    if (tdEl && !seenCaptionTds.has(tdEl)) {
      seenCaptionTds.add(tdEl);
      td.find('b').each((_, b) => {
        const text = $(b).text().replace(/\s+/g, ' ').trim();
        if (isCaptionCandidate(text)) captionParts.push(text);
      });
    }

    media.push({
      url,
      kind: /diagram/i.test(src) ? 'diagram' : 'photo',
      isAerial: isAerialPage ? true : undefined,
      copyrightNotice:
        copyrightNotice ??
        'Per-photographer copyright — see http://www.cropcircleconnector.com/anasazi/ImageUsePolicy2004.html',
    });
  });

  for (const extra of MANUAL_EXTRA_PHOTOS[pathname] ?? []) {
    if (media.some((m) => m.url === extra.url)) continue;
    media.push({
      url: extra.url,
      kind: 'photo',
      isAerial: extra.isAerial,
      photographer: extra.photographer,
      copyrightNotice: extra.copyrightNotice,
      caption: extra.caption,
    });
  }

  const description = mergeCaptions(captionParts);

  const dirMatch = /\/(?:inter)?(\d{4})\/([^/]+)\/[^/]*$/i.exec(pathname);
  const flatMatch = /\/(?:inter)?(\d{4})\/([^/]+)\.html?$/i.exec(pathname);
  const externalId = dirMatch
    ? `${dirMatch[1]}-${dirMatch[2]}`
    : flatMatch
      ? `${flatMatch[1]}-${flatMatch[2]}`
      : undefined;

  warnings.push(
    'Only the aerial-shots page is harvested; ground shots, diagrams, field reports, and comments sub-pages are not yet captured.',
  );

  return [
    {
      externalId,
      title: locationPart ? `${locationPart}${discoveredDate ? ` (reported ${discoveredDate})` : ''}` : titleText || undefined,
      description,
      discoveredDate,
      discoveredDatePrecision,
      locationName,
      country,
      adminRegion,
      latitude,
      longitude,
      coordinateSource,
      locationPrecision: osGridRef ? 'exact' : 'place-name-only',
      osGridRef,
      verificationStatus: 'reported',
      media,
      parseWarnings: warnings,
    },
  ];
}
