/**
 * The symbol spec: a constrained geometric vocabulary a vision model fills in
 * to describe a crop formation's layout on a normalized 100×100 canvas.
 *
 * The JSON schema below is structured-outputs-compatible: every object carries
 * additionalProperties:false, and there are NO numeric min/max constraints
 * (unsupported) — the renderer clamps instead.
 */

export interface CircleElement {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
  fill: 'flattened' | 'standing';
}

export interface RingElement {
  type: 'ring';
  cx: number;
  cy: number;
  r: number;
  width: number;
}

export interface ArcElement {
  type: 'arc';
  cx: number;
  cy: number;
  r: number;
  startDeg: number;
  endDeg: number;
  width: number;
}

export interface PathElement {
  type: 'path';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export interface SatellitesElement {
  type: 'satellites';
  cx: number;
  cy: number;
  orbitR: number;
  count: number;
  r: number;
}

export interface PolygonElement {
  type: 'polygon';
  points: Array<{ x: number; y: number }>;
  filled: boolean;
}

export type SymbolElement =
  | CircleElement
  | RingElement
  | ArcElement
  | PathElement
  | SatellitesElement
  | PolygonElement;

export interface SymbolSpec {
  elements: SymbolElement[];
  symmetry: { type: 'radial' | 'bilateral' | 'none'; order: number };
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

const num = { type: 'number' } as const;

export const SYMBOL_SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['elements', 'symmetry', 'confidence', 'notes'],
  properties: {
    elements: {
      type: 'array',
      description:
        'The geometric elements of the formation, in back-to-front draw order (largest/outermost first). Coordinates on a 100x100 canvas, formation centered near (50,50).',
      items: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'cx', 'cy', 'r', 'fill'],
            properties: {
              type: { const: 'circle' },
              cx: num,
              cy: num,
              r: num,
              fill: {
                enum: ['flattened', 'standing'],
                description:
                  'flattened = crop laid down (solid disc); standing = upright crop inside a flattened surround (hollow)',
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'cx', 'cy', 'r', 'width'],
            properties: {
              type: { const: 'ring' },
              cx: num,
              cy: num,
              r: { type: 'number', description: 'radius of the ring centerline' },
              width: num,
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'cx', 'cy', 'r', 'startDeg', 'endDeg', 'width'],
            properties: {
              type: { const: 'arc' },
              cx: num,
              cy: num,
              r: num,
              startDeg: { type: 'number', description: '0 = up/north, clockwise' },
              endDeg: num,
              width: num,
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'x1', 'y1', 'x2', 'y2', 'width'],
            properties: {
              type: { const: 'path' },
              x1: num,
              y1: num,
              x2: num,
              y2: num,
              width: { type: 'number', description: 'avenue/corridor width' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'cx', 'cy', 'orbitR', 'count', 'r'],
            properties: {
              type: { const: 'satellites' },
              cx: num,
              cy: num,
              orbitR: { type: 'number', description: 'radius of the orbit the small circles sit on' },
              count: { type: 'integer', description: 'number of satellite circles, evenly spaced' },
              r: { type: 'number', description: 'radius of each satellite circle' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'points', 'filled'],
            properties: {
              type: { const: 'polygon' },
              points: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['x', 'y'],
                  properties: { x: num, y: num },
                },
              },
              filled: { type: 'boolean' },
            },
          },
        ],
      },
    },
    symmetry: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'order'],
      properties: {
        type: { enum: ['radial', 'bilateral', 'none'] },
        order: {
          type: 'integer',
          description: 'fold count for radial symmetry (e.g. 6 for six-fold); 1 otherwise',
        },
      },
    },
    confidence: {
      enum: ['high', 'medium', 'low'],
      description:
        'high = geometry clearly visible; medium = partly obscured/oblique; low = significant guesswork',
    },
    notes: {
      type: 'string',
      description:
        'Anything the vocabulary could not capture faithfully (weaves, 3D shading, lettering), or uncertainty worth flagging. Empty string if none.',
    },
  },
} as const;
