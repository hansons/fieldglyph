import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSymbolSvg } from '../../src/symbols/render.ts';
import type { SymbolSpec } from '../../src/symbols/spec.ts';

const base: Omit<SymbolSpec, 'elements'> = {
  symmetry: { type: 'none', order: 1 },
  confidence: 'high',
  notes: '',
};

test('renderSymbolSvg: flattened circle is solid, standing circle is hollow', () => {
  const svg = renderSymbolSvg({
    ...base,
    elements: [
      { type: 'circle', cx: 50, cy: 50, r: 20, fill: 'flattened' },
      { type: 'circle', cx: 50, cy: 50, r: 10, fill: 'standing' },
    ],
  });
  assert.ok(svg.includes('r="20" fill="currentColor"'));
  assert.ok(svg.includes('r="10" fill="none" stroke="currentColor"'));
  assert.ok(svg.startsWith('<svg '));
});

test('renderSymbolSvg: ring renders as stroked circle with clamped width', () => {
  const svg = renderSymbolSvg({
    ...base,
    elements: [{ type: 'ring', cx: 50, cy: 50, r: 30, width: 999 }],
  });
  assert.ok(svg.includes('stroke-width="20"'), 'width clamps to 20');
});

test('renderSymbolSvg: clamps insane coordinates and radii', () => {
  const svg = renderSymbolSvg({
    ...base,
    elements: [{ type: 'circle', cx: 99999, cy: -99999, r: 5000, fill: 'flattened' }],
  });
  assert.ok(svg.includes('cx="120"'));
  assert.ok(svg.includes('cy="-20"'));
  assert.ok(svg.includes('r="80"'));
});

test('renderSymbolSvg: non-numeric values fall back to defaults', () => {
  const svg = renderSymbolSvg({
    ...base,
    elements: [
      { type: 'circle', cx: NaN, cy: undefined as unknown as number, r: 'x' as unknown as number, fill: 'flattened' },
    ],
  });
  assert.ok(svg.includes('cx="50"'));
  assert.ok(svg.includes('r="5"'));
});

test('renderSymbolSvg: satellites places count dots on the orbit', () => {
  const svg = renderSymbolSvg({
    ...base,
    elements: [{ type: 'satellites', cx: 50, cy: 50, orbitR: 30, count: 4, r: 3 }],
  });
  const dots = svg.match(/<circle /g) ?? [];
  assert.equal(dots.length, 4);
  // First satellite at 0° = due north of center.
  assert.ok(svg.includes('cx="50" cy="20"'));
});

test('renderSymbolSvg: arc normalizes sweep and never renders a degenerate full circle', () => {
  const svg = renderSymbolSvg({
    ...base,
    elements: [{ type: 'arc', cx: 50, cy: 50, r: 20, startDeg: 0, endDeg: 0, width: 2 }],
  });
  assert.ok(svg.includes('<path d="M '));
  assert.ok(svg.includes('A 20 20'));
});

test('renderSymbolSvg: polygon with no points renders nothing; determinism holds', () => {
  const spec: SymbolSpec = {
    ...base,
    elements: [
      { type: 'polygon', points: [], filled: true },
      { type: 'path', x1: 10, y1: 10, x2: 90, y2: 90, width: 2 },
    ],
  };
  const a = renderSymbolSvg(spec);
  const b = renderSymbolSvg(spec);
  assert.equal(a, b);
  assert.ok(!a.includes('<polygon'));
  assert.ok(a.includes('<line '));
});
