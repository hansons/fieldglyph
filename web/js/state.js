// Filter/view state <-> URL hash. The hash is the single source of truth so any
// filtered view is shareable and the back button works.

const DEFAULTS = () => ({
  view: 'map',
  dates: null, // ['YYYY-MM-DD', 'YYYY-MM-DD'] or null = all time
  months: new Set(),
  tags: new Set(),
  sources: new Set(),
  countries: new Set(),
  verification: new Set(),
  position: new Set(), // 'exact' | 'approx' | 'none'
  query: '',
  selected: null, // formation id
  mapView: null, // { lat, lon, zoom }
  mapFormat: 'cluster', // 'cluster' | 'heat' | 'grid'
  mapBasemap: 'street', // 'street' | 'satellite'
});

let state = DEFAULTS();
const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(state);
}

export function update(patch, { silent = false } = {}) {
  state = { ...state, ...patch };
  writeHash();
  if (!silent) emit();
}

export function toggleSetValue(key, value) {
  const next = new Set(state[key]);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  update({ [key]: next });
}

export function clearFilters() {
  const keep = { view: state.view, mapView: state.mapView, mapFormat: state.mapFormat, mapBasemap: state.mapBasemap };
  state = { ...DEFAULTS(), ...keep };
  writeHash();
  emit();
}

export function hasActiveFilters() {
  return (
    state.dates !== null ||
    state.months.size > 0 ||
    state.tags.size > 0 ||
    state.sources.size > 0 ||
    state.countries.size > 0 ||
    state.verification.size > 0 ||
    state.position.size > 0 ||
    state.query !== ''
  );
}

// ---- hash codec -----------------------------------------------------------

function encodeSet(set) {
  return [...set].join(',');
}

// A range spanning whole calendar years keeps the short y=1990-2003 hash form
// (also what old bookmarks use); anything finer serializes as d=from..to.
export function isWholeYearRange(dates) {
  return dates[0].endsWith('-01-01') && dates[1].endsWith('-12-31');
}

function writeHash() {
  const params = new URLSearchParams();
  if (state.dates) {
    if (isWholeYearRange(state.dates)) {
      params.set('y', `${Number(state.dates[0].slice(0, 4))}-${Number(state.dates[1].slice(0, 4))}`);
    } else {
      params.set('d', `${state.dates[0]}..${state.dates[1]}`);
    }
  }
  if (state.months.size) params.set('mo', encodeSet(state.months));
  if (state.tags.size) params.set('tg', encodeSet(state.tags));
  if (state.sources.size) params.set('src', encodeSet(state.sources));
  if (state.countries.size) params.set('co', encodeSet(state.countries));
  if (state.verification.size) params.set('vs', encodeSet(state.verification));
  if (state.position.size) params.set('cs', encodeSet(state.position));
  if (state.query) params.set('q', state.query);
  if (state.selected) params.set('sel', state.selected);
  if (state.mapView) {
    params.set('c', `${state.mapView.lat.toFixed(4)},${state.mapView.lon.toFixed(4)},${state.mapView.zoom}`);
  }
  if (state.mapFormat !== 'cluster') params.set('fmt', state.mapFormat);
  if (state.mapBasemap !== 'street') params.set('bm', state.mapBasemap);
  const qs = params.toString();
  const hash = `#/${state.view}${qs ? '?' + qs : ''}`;
  if (location.hash !== hash) {
    history.replaceState(null, '', hash);
  }
}

export function readHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [viewPart, qs] = raw.split('?');
  const params = new URLSearchParams(qs ?? '');
  const next = DEFAULTS();

  // #/f/{id} deep link opens the record on the map view.
  if (viewPart?.startsWith('f/')) {
    next.view = 'map';
    next.selected = viewPart.slice(2);
  } else if (['map', 'list', 'evolution', 'review', 'about', 'support'].includes(viewPart)) {
    next.view = viewPart;
  }

  const years = params.get('y');
  if (years && /^\d{3,4}-\d{3,4}$/.test(years)) {
    const [a, b] = years.split('-').map(Number);
    const pad = (y) => String(y).padStart(4, '0');
    next.dates = [`${pad(Math.min(a, b))}-01-01`, `${pad(Math.max(a, b))}-12-31`];
  }
  const dates = params.get('d');
  if (dates && /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(dates)) {
    const [a, b] = dates.split('..');
    next.dates = a <= b ? [a, b] : [b, a];
  }
  const setKeys = { mo: 'months', tg: 'tags', src: 'sources', co: 'countries', vs: 'verification', cs: 'position' };
  for (const [param, key] of Object.entries(setKeys)) {
    const v = params.get(param);
    if (v) next[key] = new Set(v.split(',').filter(Boolean));
  }
  next.query = params.get('q') ?? '';
  next.selected = next.selected ?? params.get('sel');
  const c = params.get('c');
  if (c) {
    const [lat, lon, zoom] = c.split(',').map(Number);
    if ([lat, lon, zoom].every(Number.isFinite)) next.mapView = { lat, lon, zoom };
  }
  const fmt = params.get('fmt');
  if (fmt === 'heat' || fmt === 'grid') next.mapFormat = fmt;
  const bm = params.get('bm');
  if (bm === 'satellite') next.mapBasemap = bm;

  state = next;
  emit();
}
