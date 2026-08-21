// Formatting helpers: precision-honest dates, badges, HTML escaping.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** "2008-08-08"/d -> "8 August 2008"; "1999-07"/m -> "July 1999"; "1590"/y -> "1590". */
export function formatDate(d, dp) {
  if (!d) return 'Date unknown';
  const year = d.slice(0, 4);
  if (dp === 'y' || d.length === 4) return year;
  const month = MONTH_NAMES[Number(d.slice(5, 7)) - 1] ?? '';
  if (dp === 'm' || d.length === 7) return `${month} ${year}`;
  return `${Number(d.slice(8, 10))} ${month} ${year}`;
}

export const PRECISION_LABEL = { d: 'day-precise', m: 'month-precise', y: 'year only', u: 'date unknown' };

export const POSITION_LABEL = {
  sp: 'Exact — source coordinates',
  og: 'Exact — OS grid reference',
  rc: 'Approximate — region centroid',
  u: 'Not mappable',
};

export const VERIFICATION_LABEL = {
  r: 'Reported',
  ina: 'Investigated — no anomaly',
  iba: 'Investigated — biological anomaly',
  ha: 'Hoax admitted',
  hs: 'Hoax suspected (source assessment)',
  u: 'Unresolved',
};

export function positionBadge(cs) {
  const exact = cs === 'sp' || cs === 'og';
  const cls = exact ? 'badge-exact' : cs === 'rc' ? 'badge-approx' : '';
  return `<span class="badge ${cls}">${esc(POSITION_LABEL[cs] ?? cs)}</span>`;
}

export function verificationBadge(vs) {
  const cls = vs === 'ha' || vs === 'hs' ? 'badge-hoax' : '';
  return `<span class="badge ${cls}">${esc(VERIFICATION_LABEL[vs] ?? vs)}</span>`;
}

export function waybackBadge(fm) {
  return fm === 'w' ? '<span class="badge badge-wayback" title="Recovered from an archived capture">archived</span>' : '';
}

export function noPhotoBadge(mc) {
  return mc ? '' : '<span class="badge badge-nophoto" title="No photo captured from the source page">no photo</span>';
}

/** Wayback lookup URL for any asset (used as broken-image fallback). */
export function waybackUrlFor(url) {
  return `https://web.archive.org/web/*/${url}`;
}
