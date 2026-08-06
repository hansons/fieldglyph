// Hand-rolled Leaflet layer: buckets points into fixed-pixel grid cells and
// shades each occupied cell by count. No hexbin/d3 dependency — square cells
// computed straight off the canvas, redrawn on pan/zoom like Leaflet.heat does.
const L = window.L;

// Canvas fillStyle can't resolve CSS custom properties (same constraint the
// slide-highlight ring and uncertainty circle work around in map.js) — the
// --exact blue, hardcoded.
const CELL_RGB = '61, 107, 179';

const GridBinLayer = L.Layer.extend({
  initialize(options) {
    this._points = [];
    L.setOptions(this, { cellPx: 36, ...options });
  },

  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'grid-bin-layer leaflet-layer');
    map.getPanes().overlayPane.appendChild(this._canvas);
    map.on('moveend zoomend resize', this._redraw, this);
    this._redraw();
  },

  onRemove(map) {
    L.DomUtil.remove(this._canvas);
    map.off('moveend zoomend resize', this._redraw, this);
    this._canvas = null;
  },

  setPoints(points) {
    this._points = points;
    if (this._map) this._redraw();
  },

  _redraw() {
    if (!this._map || !this._canvas) return;
    const size = this._map.getSize();
    this._canvas.width = size.x;
    this._canvas.height = size.y;
    L.DomUtil.setPosition(this._canvas, this._map.containerPointToLayerPoint([0, 0]));

    const ctx = this._canvas.getContext('2d');
    ctx.clearRect(0, 0, size.x, size.y);

    const cellPx = this.options.cellPx;
    const bins = new Map();
    for (const [lat, lon] of this._points) {
      const p = this._map.latLngToContainerPoint([lat, lon]);
      if (p.x < 0 || p.y < 0 || p.x > size.x || p.y > size.y) continue;
      const key = `${Math.floor(p.x / cellPx)},${Math.floor(p.y / cellPx)}`;
      bins.set(key, (bins.get(key) ?? 0) + 1);
    }
    if (bins.size === 0) return;

    const max = Math.max(...bins.values());
    const logMax = Math.log(max + 1);
    const pad = 1;
    for (const [key, count] of bins) {
      const [cx, cy] = key.split(',').map(Number);
      const t = logMax === 0 ? 1 : Math.log(count + 1) / logMax;
      const alpha = 0.15 + t * 0.7;
      ctx.fillStyle = `rgba(${CELL_RGB}, ${alpha.toFixed(2)})`;
      ctx.fillRect(cx * cellPx + pad, cy * cellPx + pad, cellPx - pad * 2, cellPx - pad * 2);
      if (cellPx >= 28) {
        ctx.fillStyle = '#fff';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(count), cx * cellPx + cellPx / 2, cy * cellPx + cellPx / 2);
      }
    }
  },
});

export function createGridLayer(options) {
  return new GridBinLayer(options);
}
