// Data layer: loads the formations index + meta at boot, lazy-loads detail
// shards, and runs the filter engine every view shares.

let formations = [];
let meta = null;
const shardCache = new Map();

export async function loadData() {
  const [fRes, mRes] = await Promise.all([fetch('data/formations.json'), fetch('data/meta.json')]);
  if (!fRes.ok || !mRes.ok) {
    throw new Error('Data files missing — run: node src/cli.ts export');
  }
  const fJson = await fRes.json();
  formations = fJson.records;
  meta = await mRes.json();

  // Pre-compute lowercase search haystack + numeric year/month once.
  for (const r of formations) {
    r._search = [r.t, r.ln, r.ar, r.co].filter(Boolean).join(' ').toLowerCase();
    r._year = r.d ? Number(r.d.slice(0, 4)) : null;
    r._month = r.d && r.d.length >= 7 ? Number(r.d.slice(5, 7)) : null;
    // Date interval for range filtering, compared as strings. Partial dates
    // ('1990', '1990-07') span their whole year/month so they match any range
    // they could fall in; '-31' is a lexicographic month-end, not a real day.
    if (r.d) {
      r._from = (r.d + '-01-01').slice(0, 10);
      r._to = r.d.length === 4 ? `${r.d}-12-31` : r.d.length === 7 ? `${r.d}-31` : r.d;
    } else {
      r._from = r._to = null;
    }
  }
  return { formations, meta };
}

export function getFormations() {
  return formations;
}

export function getMeta() {
  return meta;
}

export function getById(id) {
  return formations.find((r) => r.id === id) ?? null;
}

export async function getDetail(id) {
  const shardKey = id[0];
  let shard = shardCache.get(shardKey);
  if (!shard) {
    const res = await fetch(`data/details-${shardKey}.json`);
    if (!res.ok) throw new Error(`detail shard ${shardKey} missing`);
    shard = await res.json();
    shardCache.set(shardKey, shard);
  }
  return shard[id] ?? null;
}

// ---- filter engine --------------------------------------------------------

function positionBucket(r) {
  if (r.cs === 'sp' || r.cs === 'og') return 'exact';
  if (r.cs === 'rc') return 'approx';
  return 'none';
}

export function applyFilters(state) {
  const q = state.query.trim().toLowerCase();
  return formations.filter((r) => {
    if (state.dates) {
      if (r._from === null) return false;
      if (r._to < state.dates[0] || r._from > state.dates[1]) return false;
    }
    if (state.months.size > 0) {
      if (r._month === null || !state.months.has(String(r._month))) return false;
    }
    if (state.sources.size > 0 && !state.sources.has(r.src)) return false;
    if (state.countries.size > 0 && !state.countries.has(r.co ?? '')) return false;
    if (state.verification.size > 0 && !state.verification.has(r.vs)) return false;
    if (state.position.size > 0 && !state.position.has(positionBucket(r))) return false;
    if (state.tags.size > 0) {
      for (const tag of state.tags) {
        if (tag === '_untagged') {
          if (!(Array.isArray(r.tg) && r.tg.length === 0)) return false;
        } else if (tag === '_notext') {
          if (r.tg !== undefined) return false;
        } else if (!r.tg || !r.tg.includes(tag)) {
          return false;
        }
      }
    }
    if (q && !r._search.includes(q)) return false;
    return true;
  });
}

export { positionBucket };
