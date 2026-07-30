/** Country-name normalization: source sites drift ("Holland", "USA", "England"). */
const COUNTRY_MAP: Record<string, string> = {
  holland: 'Netherlands',
  'the netherlands': 'Netherlands',
  usa: 'United States',
  'u.s.a.': 'United States',
  us: 'United States',
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  england: 'United Kingdom',
  scotland: 'United Kingdom',
  wales: 'United Kingdom',
  'northern ireland': 'United Kingdom',
  'great britain': 'United Kingdom',
  'the czech republic': 'Czech Republic',
};

export function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return COUNTRY_MAP[trimmed.toLowerCase()] ?? trimmed;
}
