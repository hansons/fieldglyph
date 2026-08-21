import { getState, update, toggleSetValue } from '../state.js';
import { applyFilters, getFormations, positionBucket } from '../data.js';
import { esc, formatDate } from '../format.js';
import { openDrawer, currentSlideId } from './detail.js';
import { createGridLayer } from './gridLayer.js';

// Leaflet is loaded globally (classic scripts in vendor/) — grab from window.
const L = window.L;

const FORMATS = ['cluster', 'heat', 'grid'];

let map = null;
let streetLayer = null;
let satelliteLayer = null;
let exactLayer = null;
let approxLayer = null;
let heatLayer = null;
let gridLayer = null;
let radiusCircle = null;
let slideMarker = null;
let mapContainerId = 'leaflet-map';

// Latest jittered points behind the marker layers — reused by heat/grid so
// toggling format or the approx checkbox doesn't need a full data recompute.
let lastExactPoints = [];
let lastApproxPoints = [];

// Once the visitor manually pans/zooms, the idle slideshow stops recentering
// the view out from under them — it still rings the current slide's marker,
// just no longer steals the viewport. Reset when the map is torn down.
//
// That same flag also gates the gallery's viewport restriction (below): while
// the app is still auto-fitting/auto-panning, "current view" isn't a
// deliberate window yet, so the gallery stays unrestricted. Restricting it
// before that point would also fight the slideshow's own auto-pan — each
// slide change would narrow the "visible" set, which could exclude the very
// slide that just centered the map.
let userHasInteracted = false;
// A depth counter, not a boolean: Leaflet's animated zoom fires a *second*,
// asynchronous 'movestart' on the next frame as the CSS transition actually
// begins, well after a programmatic setView() call has returned — resetting
// a plain boolean synchronously right after fn() would leave that later
// movestart looking user-driven. Held true for the whole move, released on
// its moveend (with a timeout fallback for a no-op setView, which never
// fires one at all).
let suppressDepth = 0;

function moveMapInternal(fn) {
  suppressDepth++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    suppressDepth = Math.max(0, suppressDepth - 1);
  };
  map.once('moveend', release);
  fn();
  setTimeout(release, 400); // covers Leaflet's ~250ms animated pan/zoom transition
}

// All records with a plottable position, regardless of the active filters —
// computed once since the underlying dataset never changes at runtime.
let cachedAllMappable = null;
function allMappableRecords() {
  if (!cachedAllMappable) {
    cachedAllMappable = getFormations().filter(
      (r) => r.lat !== undefined && r.lat !== null && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180,
    );
  }
  return cachedAllMappable;
}

// Was the last announcement "unrestricted" (null)? Guards a feedback loop:
// while idling and unrestricted, the slideshow auto-pans to each new slide
// (see highlightSlide's panTo below), which fires its own moveend — without
// this check that would re-announce, rebuild the gallery, land on the same
// slide, dispatch 'slide-changed' again, and pan again, forever. Once
// interacted, highlightSlide never calls panTo, so that loop can't recur —
// only the idle (null) case needs deduping.
let lastAnnouncedWasNull = true;

/**
 * Tells the gallery which record ids currently fall inside the map viewport,
 * independent of the active filters — the gallery intersects this with its
 * own filtered set, so this only needs to change when the viewport itself
 * does. `ids: null` means "no restriction" (not on the map, or the visitor
 * hasn't taken the wheel yet).
 */
function announceVisibleRecords() {
  if (!map || !userHasInteracted) {
    if (lastAnnouncedWasNull) return;
    lastAnnouncedWasNull = true;
    document.dispatchEvent(new CustomEvent('map-bounds-changed', { detail: { ids: null } }));
    return;
  }
  lastAnnouncedWasNull = false;
  const bounds = map.getBounds();
  const ids = new Set();
  for (const r of allMappableRecords()) {
    if (bounds.contains(positionFor(r))) ids.add(r.id);
  }
  document.dispatchEvent(new CustomEvent('map-bounds-changed', { detail: { ids } }));
}

/** Deterministic jitter from the record id: same position every session. */
function jitterFor(id, radiusKm) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const angle = ((h % 3600) / 3600) * Math.PI * 2;
  const dist = Math.sqrt(((h >>> 12) % 1000) / 1000) * radiusKm * 0.7;
  const dLat = (dist / 111) * Math.cos(angle);
  const dLon = (dist / (111 * Math.cos((51 * Math.PI) / 180))) * Math.sin(angle);
  return [dLat, dLon];
}

/** Displayed position: the true coordinate for exact records, jittered for approx. */
function positionFor(record) {
  let lat = record.lat;
  let lon = record.lon;
  if (positionBucket(record) !== 'exact' && record.rk) {
    const [dLat, dLon] = jitterFor(record.id, record.rk);
    lat += dLat;
    lon += dLon;
  }
  return [lat, lon];
}

function markerFor(record) {
  const isExact = positionBucket(record) === 'exact';
  const [lat, lon] = positionFor(record);
  const icon = L.divIcon({
    className: isExact ? 'marker-exact' : 'marker-approx',
    iconSize: isExact ? [18, 18] : [20, 20],
  });
  const marker = L.marker([lat, lon], {
    icon,
    keyboard: false,
    title: `${record.t ?? ''} — ${formatDate(record.d, record.dp)}`,
  });
  // One click = populated side panel. No popup intermediary — rapid review.
  marker.on('click', () => {
    openDrawer(record.id, applyFilters(getState()));
    showRadius(record);
  });
  marker._record = record;
  return marker;
}

export function renderMap(container) {
  const state = getState();
  const records = applyFilters(state);
  const mappable = records.filter(
    (r) => r.lat !== undefined && r.lat !== null && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180,
  );
  const unmappable = records.length - mappable.length;

  if (!container.querySelector(`#${mapContainerId}`)) {
    container.innerHTML = `<div class="view view-map">
      <div id="${mapContainerId}"></div>
      <div class="map-legend" aria-hidden="false">
        <span><span class="legend-swatch legend-exact"></span> exact position</span>
        <span><span class="legend-swatch legend-approx"></span> region-level (scattered for display)</span>
        <label><input type="checkbox" id="toggle-approx" checked> show approximate</label>
        <div class="map-format-switcher" role="group" aria-label="Map presentation">
          <button type="button" class="chip" data-format="cluster">Clusters</button>
          <button type="button" class="chip" data-format="heat">Heat map</button>
          <button type="button" class="chip" data-format="grid">Grid</button>
        </div>
        <div class="map-format-switcher" role="group" aria-label="Map basemap">
          <button type="button" class="chip" data-basemap="street">Street</button>
          <button type="button" class="chip" data-basemap="satellite">Satellite</button>
        </div>
      </div>
      <button class="map-tray" id="map-tray" title="Records without a mappable position"></button>
      <div class="tile-warning" id="tile-warning" hidden>Basemap unavailable — markers still shown</div>
    </div>`;
    map = null; // container rebuilt — force map re-init
  }

  if (!map) {
    map = L.map(mapContainerId, { worldCopyJump: true });
    streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        // Esri's real coverage ceiling varies by region and is well short of the
        // service's nominal z19 in rural/remote areas (verified empirically:
        // z17 real, z18+ returns a placeholder tile reading "Map data not yet
        // available" over rural UK crop-circle fields). 17 is a conservative
        // floor; maxZoom lets Leaflet stretch that last real tile further instead.
        maxNativeZoom: 17,
        maxZoom: 22,
        attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      },
    );
    const onTileError = () => document.getElementById('tile-warning')?.removeAttribute('hidden');
    streetLayer.on('tileerror', onTileError);
    satelliteLayer.on('tileerror', onTileError);
    (getState().mapBasemap === 'satellite' ? satelliteLayer : streetLayer).addTo(map);

    exactLayer = L.markerClusterGroup({ maxClusterRadius: 46 });
    approxLayer = L.markerClusterGroup({
      maxClusterRadius: 46,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        const size = count < 10 ? 'small' : count < 100 ? 'medium' : 'large';
        return L.divIcon({
          html: `<div><span>${count}</span></div>`,
          className: `marker-cluster marker-cluster-${size} cluster-approx`,
          iconSize: L.point(40, 40),
        });
      },
    });
    heatLayer = L.heatLayer([], {
      radius: 25,
      blur: 18,
      // Leaflet.heat fades each point's weight the further the current zoom
      // sits below `maxZoom` — defaulting to the basemap's 18 (street level)
      // makes the layer nearly invisible at this dataset's natural whole-
      // world default view. 9 (country/continent scale) is where crop-circle
      // density is actually meaningful, so calibrate the falloff to that.
      maxZoom: 9,
      gradient: { 0.3: '#e6ecd8', 0.55: '#a3c065', 0.8: '#5d7a2e', 1: '#3d5620' },
    });
    gridLayer = createGridLayer();
    // Which of exact/approx/heat/grid is on the map is decided by applyFormat()
    // below, driven by state.mapFormat — none of them get added here.

    map.on('moveend', () => {
      const c = map.getCenter();
      update({ mapView: { lat: c.lat, lon: c.lng, zoom: map.getZoom() } }, { silent: true });
      announceVisibleRecords();
    });

    map.on('movestart', () => {
      if (suppressDepth === 0) userHasInteracted = true;
    });

    document.getElementById('toggle-approx')?.addEventListener('change', applyFormat);

    document.querySelectorAll('.map-format-switcher [data-format]').forEach((btn) => {
      btn.addEventListener('click', () => update({ mapFormat: btn.dataset.format }));
    });

    document.querySelectorAll('[data-basemap]').forEach((btn) => {
      btn.addEventListener('click', () => update({ mapBasemap: btn.dataset.basemap }));
    });

    // Panel opened/closed or selection changed: the map width shifts and the
    // uncertainty radius must follow the selection.
    document.addEventListener('panel-changed', (e) => {
      if (!map) return;
      setTimeout(() => map.invalidateSize(), 0);
      const id = e.detail?.id;
      if (!id) {
        hideRadius();
        return;
      }
      const record = applyFilters(getState()).find((r) => r.id === id);
      if (record) showRadius(record);
    });

    // The gallery slideshow announces each slide — identify it on the map
    // like a click would, panning to it but never touching the zoom level.
    document.addEventListener('slide-changed', (e) => {
      if (!map) return;
      highlightSlide(e.detail?.id ?? null);
    });
  }

  exactLayer.clearLayers();
  approxLayer.clearLayers();
  const exactMarkers = [];
  const approxMarkers = [];
  lastExactPoints = [];
  lastApproxPoints = [];
  for (const r of mappable) {
    const m = markerFor(r);
    const pos = m.getLatLng();
    if (positionBucket(r) === 'exact') {
      exactMarkers.push(m);
      lastExactPoints.push([pos.lat, pos.lng]);
    } else {
      approxMarkers.push(m);
      lastApproxPoints.push([pos.lat, pos.lng]);
    }
  }
  exactLayer.addLayers(exactMarkers);
  approxLayer.addLayers(approxMarkers);

  document.querySelectorAll('.map-format-switcher [data-format]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.format === state.mapFormat));
  });
  applyFormat();

  document.querySelectorAll('[data-basemap]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.basemap === state.mapBasemap));
  });
  applyBasemap(state.mapBasemap);

  const tray = document.getElementById('map-tray');
  if (tray) {
    tray.textContent = `⊘ ${unmappable} not mappable`;
    tray.style.display = unmappable > 0 ? '' : 'none';
    tray.onclick = () => {
      update({ view: 'list', position: new Set(['none']) });
    };
  }

  // Viewport: honor the hash if present, else fit the filtered data.
  const saved = state.mapView;
  if (saved) {
    moveMapInternal(() => map.setView([saved.lat, saved.lon], saved.zoom));
  } else if (mappable.length > 0) {
    const bounds = L.latLngBounds(mappable.map((r) => [r.lat, r.lon]));
    moveMapInternal(() => map.fitBounds(bounds.pad(0.1), { maxZoom: 10 }));
  } else {
    moveMapInternal(() => map.setView([51.4, -1.85], 8)); // Wiltshire heartland default
  }

  // Deep-linked selection.
  if (state.selected) {
    openDrawer(state.selected, records);
  }

  // Remounting mid-slideshow (view switch, filter change): re-identify the
  // slide currently showing in the gallery.
  highlightSlide(currentSlideId());

  setTimeout(() => map.invalidateSize(), 0);
}

/** Swaps the basemap tile layer without touching the marker/heat/grid layers above it. */
function applyBasemap(basemap) {
  const wanted = basemap === 'satellite' ? satelliteLayer : streetLayer;
  const other = wanted === satelliteLayer ? streetLayer : satelliteLayer;
  if (map.hasLayer(other)) map.removeLayer(other);
  if (!map.hasLayer(wanted)) map.addLayer(wanted);
}

/** Shows exactly the layer(s) for the active presentation format; heat/grid
 *  fold exact+approx into one point set instead of the marker layers' split. */
function applyFormat() {
  const format = FORMATS.includes(getState().mapFormat) ? getState().mapFormat : 'cluster';
  const showApprox = document.getElementById('toggle-approx')?.checked ?? true;

  const wanted =
    format === 'cluster'
      ? [exactLayer, ...(showApprox ? [approxLayer] : [])]
      : format === 'heat'
        ? [heatLayer]
        : [gridLayer];

  // Only touch layers whose membership is actually changing — Leaflet drops
  // a layer's internal map reference on removeLayer, so removing and
  // immediately re-adding the still-active layer (e.g. on every filter
  // change while parked on Heat map) would hand it a stale reference.
  for (const layer of [exactLayer, approxLayer, heatLayer, gridLayer]) {
    if (!wanted.includes(layer) && map.hasLayer(layer)) map.removeLayer(layer);
  }
  for (const layer of wanted) {
    if (!map.hasLayer(layer)) map.addLayer(layer);
  }

  if (format === 'cluster') return;
  const points = showApprox ? lastExactPoints.concat(lastApproxPoints) : lastExactPoints;
  if (format === 'heat') heatLayer.setLatLngs(points);
  else gridLayer.setPoints(points);
}

function highlightSlide(id) {
  if (slideMarker) {
    map.removeLayer(slideMarker);
    slideMarker = null;
  }
  if (!id) {
    hideRadius();
    return;
  }
  const record = applyFilters(getState()).find((r) => r.id === id);
  if (!record || record.lat === undefined || record.lat === null || Math.abs(record.lat) > 90 || Math.abs(record.lon) > 180) {
    hideRadius();
    return;
  }
  // Ring the marker's displayed position (same jitter as the marker itself).
  const [lat, lon] = positionFor(record);
  slideMarker = L.circleMarker([lat, lon], {
    radius: 13,
    weight: 3,
    fill: false,
    color: '#5d7a2e', // SVG attributes can't resolve CSS custom properties
    className: 'slide-highlight',
  }).addTo(map);
  showRadius(record);
  // Identify without changing zoom — but once the visitor has taken the
  // wheel themselves, stop recentering the view out from under them.
  if (!userHasInteracted) moveMapInternal(() => map.panTo([lat, lon]));
}

function showRadius(record) {
  hideRadius();
  if (!record || positionBucket(record) !== 'approx' || !record.rk) return;
  radiusCircle = L.circle([record.lat, record.lon], {
    radius: record.rk * 1000,
    dashArray: '6 8',
    fill: false,
    color: '#b3823d', // SVG attributes can't resolve CSS custom properties
    weight: 2,
  }).addTo(map);
  radiusCircle
    .bindTooltip(`Location approximate — somewhere in ${esc(record.ar ?? 'this region')}`)
    .openTooltip();
}

function hideRadius() {
  if (radiusCircle) {
    map.removeLayer(radiusCircle);
    radiusCircle = null;
  }
}

export function teardownMap() {
  if (map) {
    map.remove();
    map = null;
    streetLayer = null;
    satelliteLayer = null;
    exactLayer = null;
    approxLayer = null;
    heatLayer = null;
    gridLayer = null;
    radiusCircle = null;
    slideMarker = null;
    userHasInteracted = false;
    // Leaving the map view: "current view window" no longer means anything,
    // so the gallery drops back to filter-only.
    announceVisibleRecords();
  }
}
