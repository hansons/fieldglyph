import { getState, update, toggleSetValue } from '../state.js';
import { applyFilters, positionBucket } from '../data.js';
import { esc, formatDate } from '../format.js';
import { openDrawer, currentSlideId } from './detail.js';

// Leaflet is loaded globally (classic scripts in vendor/) — grab from window.
const L = window.L;

let map = null;
let exactLayer = null;
let approxLayer = null;
let radiusCircle = null;
let slideMarker = null;
let mapContainerId = 'leaflet-map';

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

function markerFor(record) {
  const isExact = positionBucket(record) === 'exact';
  let lat = record.lat;
  let lon = record.lon;
  if (!isExact && record.rk) {
    const [dLat, dLon] = jitterFor(record.id, record.rk);
    lat += dLat;
    lon += dLon;
  }
  const icon = L.divIcon({
    className: isExact ? 'marker-exact' : 'marker-approx',
    iconSize: isExact ? [12, 12] : [14, 14],
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
      </div>
      <button class="map-tray" id="map-tray" title="Records without a mappable position"></button>
      <div class="tile-warning" id="tile-warning" hidden>Basemap unavailable — markers still shown</div>
    </div>`;
    map = null; // container rebuilt — force map re-init
  }

  if (!map) {
    map = L.map(mapContainerId, { worldCopyJump: true });
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    tiles.on('tileerror', () => {
      document.getElementById('tile-warning')?.removeAttribute('hidden');
    });
    tiles.addTo(map);

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
    map.addLayer(exactLayer);
    map.addLayer(approxLayer);

    map.on('moveend', () => {
      const c = map.getCenter();
      update({ mapView: { lat: c.lat, lon: c.lng, zoom: map.getZoom() } }, { silent: true });
    });

    document.getElementById('toggle-approx')?.addEventListener('change', (e) => {
      if (e.target.checked) map.addLayer(approxLayer);
      else map.removeLayer(approxLayer);
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
  for (const r of mappable) {
    const m = markerFor(r);
    if (positionBucket(r) === 'exact') exactMarkers.push(m);
    else approxMarkers.push(m);
  }
  exactLayer.addLayers(exactMarkers);
  approxLayer.addLayers(approxMarkers);

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
    map.setView([saved.lat, saved.lon], saved.zoom);
  } else if (mappable.length > 0) {
    const bounds = L.latLngBounds(mappable.map((r) => [r.lat, r.lon]));
    map.fitBounds(bounds.pad(0.1), { maxZoom: 10 });
  } else {
    map.setView([51.4, -1.85], 8); // Wiltshire heartland default
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
  let lat = record.lat;
  let lon = record.lon;
  if (positionBucket(record) !== 'exact' && record.rk) {
    const [dLat, dLon] = jitterFor(record.id, record.rk);
    lat += dLat;
    lon += dLon;
  }
  slideMarker = L.circleMarker([lat, lon], {
    radius: 13,
    weight: 3,
    fill: false,
    color: '#5d7a2e', // SVG attributes can't resolve CSS custom properties
    className: 'slide-highlight',
  }).addTo(map);
  showRadius(record);
  map.panTo([lat, lon]); // identify without changing zoom
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
    exactLayer = null;
    approxLayer = null;
    radiusCircle = null;
    slideMarker = null;
  }
}
