export interface DateFix {
  date: string | null;
  precision: 'day' | 'month' | 'year' | 'unknown';
  note: string;
}

const MIN_YEAR = 1500;
const MAX_YEAR = 2030;

export function isYearSane(date: string | null | undefined): boolean {
  if (!date) return true; // absent dates are not insane, just unknown
  const year = Number(date.slice(0, 4));
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
}

/**
 * Attempt to repair an out-of-window date using the source URL's year directory.
 * cca/ccc URLs embed the season year (/archives/2008/080808/...). If the bogus
 * date's leading digits parse as a plausible DDMM or MMDD under that year, the
 * full date is recovered; otherwise we fall back to the URL year alone.
 */
export function repairDate(badDate: string, sourceUrl: string): DateFix {
  const urlYear = /\/(?:archives\/)?(?:inter)?((?:19|20)\d{2})\//i.exec(sourceUrl)?.[1];
  if (!urlYear) {
    return {
      date: null,
      precision: 'unknown',
      note: `enrich: date "${badDate}" outside ${MIN_YEAR}-${MAX_YEAR} and no year in source URL; cleared`,
    };
  }

  // "0808" style: first two digits day or month, second two the other.
  const digits = badDate.replace(/\D/g, '');
  if (digits.length >= 4) {
    const a = Number(digits.slice(0, 2));
    const b = Number(digits.slice(2, 4));
    // Prefer DD-MM (European source convention).
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12) {
      return {
        date: `${urlYear}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`,
        precision: 'day',
        note: `enrich: repaired bogus date "${badDate}" as DD-MM under URL year ${urlYear}`,
      };
    }
    if (b >= 1 && b <= 31 && a >= 1 && a <= 12) {
      return {
        date: `${urlYear}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`,
        precision: 'day',
        note: `enrich: repaired bogus date "${badDate}" as MM-DD under URL year ${urlYear}`,
      };
    }
  }

  return {
    date: urlYear,
    precision: 'year',
    note: `enrich: date "${badDate}" outside ${MIN_YEAR}-${MAX_YEAR}; fell back to URL year ${urlYear}`,
  };
}
