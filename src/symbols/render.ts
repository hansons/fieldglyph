import type { SymbolSpec, SymbolElement } from './spec.ts';

/**
 * Deterministic symbol renderer: spec in, monochrome line-art SVG out.
 *
 * Strokes/fills use currentColor so the glyph inherits the page's theme.
 * All numeric inputs are clamped here — the structured-outputs schema cannot
 * express numeric bounds, so the renderer is the safety net.
 */

const CANVAS = 100;

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.min(hi, Math.max(lo, v));
}

function coord(n: unknown): number {
  return round2(clamp(n, -20, 120, 50)); // slight overflow allowed; viewBox crops
}

function radius(n: unknown): number {
  return round2(clamp(n, 0.5, 80, 5));
}

function strokeWidth(n: unknown): number {
  return round2(clamp(n, 0.5, 20, 1.5));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function polarPoint(cx: number, cy: number, r: number, deg: number): [number, number] {
  // 0° = up/north, clockwise positive.
  const rad = ((deg - 90) * Math.PI) / 180;
  return [round2(cx + r * Math.cos(rad)), round2(cy + r * Math.sin(rad))];
}

function renderElement(el: SymbolElement): string {
  switch (el.type) {
    case 'circle': {
      const solid = el.fill === 'flattened';
      return `<circle cx="${coord(el.cx)}" cy="${coord(el.cy)}" r="${radius(el.r)}" ` +
        (solid
          ? 'fill="currentColor" fill-opacity="0.85"'
          : 'fill="none" stroke="currentColor" stroke-width="1.5"') +
        '/>';
    }
    case 'ring':
      return `<circle cx="${coord(el.cx)}" cy="${coord(el.cy)}" r="${radius(el.r)}" fill="none" stroke="currentColor" stroke-width="${strokeWidth(el.width)}"/>`;
    case 'arc': {
      const cx = coord(el.cx);
      const cy = coord(el.cy);
      const r = radius(el.r);
      const start = clamp(el.startDeg, -360, 720, 0);
      let end = clamp(el.endDeg, -360, 720, 90);
      // Normalize sweep into (0, 360): a full circle should be a ring instead.
      let sweep = end - start;
      if (sweep <= 0) sweep += 360;
      if (sweep >= 360) sweep = 359.9;
      end = start + sweep;
      const [x1, y1] = polarPoint(cx, cy, r, start);
      const [x2, y2] = polarPoint(cx, cy, r, end);
      const largeArc = sweep > 180 ? 1 : 0;
      return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}" fill="none" stroke="currentColor" stroke-width="${strokeWidth(el.width)}"/>`;
    }
    case 'path':
      return `<line x1="${coord(el.x1)}" y1="${coord(el.y1)}" x2="${coord(el.x2)}" y2="${coord(el.y2)}" stroke="currentColor" stroke-width="${strokeWidth(el.width)}" stroke-linecap="round"/>`;
    case 'satellites': {
      const cx = coord(el.cx);
      const cy = coord(el.cy);
      const orbitR = radius(el.orbitR);
      const count = Math.round(clamp(el.count, 1, 48, 6));
      const r = radius(el.r);
      const dots: string[] = [];
      for (let i = 0; i < count; i++) {
        const [x, y] = polarPoint(cx, cy, orbitR, (360 / count) * i);
        dots.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" fill-opacity="0.85"/>`);
      }
      return dots.join('');
    }
    case 'polygon': {
      const points = (Array.isArray(el.points) ? el.points : [])
        .slice(0, 64)
        .map((p) => `${coord(p?.x)},${coord(p?.y)}`)
        .join(' ');
      if (!points) return '';
      return `<polygon points="${points}" ` +
        (el.filled
          ? 'fill="currentColor" fill-opacity="0.85"'
          : 'fill="none" stroke="currentColor" stroke-width="1.5"') +
        '/>';
    }
    default:
      return '';
  }
}

export function renderSymbolSvg(spec: SymbolSpec): string {
  const elements = (Array.isArray(spec.elements) ? spec.elements : [])
    .slice(0, 128)
    .map(renderElement)
    .filter(Boolean)
    .join('\n  ');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-label="Symbolic representation of formation layout">\n` +
    `  ${elements}\n` +
    `</svg>`
  );
}
