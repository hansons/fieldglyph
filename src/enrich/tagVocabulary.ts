export interface TagDef {
  id: string;
  label: string;
  patterns: RegExp[];
}

/**
 * The marking taxonomy, matched against formation DESCRIPTIONS only — titles are
 * pure placenames on every source ("Star Lane", "Crossbush") and would false-tag.
 * The literal phrase "crop circle(s)" is stripped before matching so a generic
 * "a crop circle appeared" doesn't tag `circle`.
 */
export const TAG_VOCABULARY: TagDef[] = [
  { id: 'circle', label: 'Simple circle(s)', patterns: [/\bcircles?\b/] },
  { id: 'ring', label: 'Ring / concentric', patterns: [/\brings?\b/, /concentric/, /annular/] },
  { id: 'pathway', label: 'Pathways / avenues', patterns: [/\bpath(?:way)?s?\b/, /corridors?/, /avenues?/] },
  { id: 'oval', label: 'Oval / ellipse', patterns: [/\bovals?\b/, /ellip(?:se|tical)/] },
  { id: 'pictogram', label: 'Pictogram', patterns: [/pictograms?/, /\bglyphs?\b/] },
  { id: 'dumbbell', label: 'Dumbbell', patterns: [/dumb.?bells?/, /bar.?bell/] },
  { id: 'cross', label: 'Cross', patterns: [/\bcross(?:es)?\b/, /crucifix/] },
  { id: 'triangle', label: 'Triangle / triskelion', patterns: [/triang/, /triskel/, /tetrahedr/] },
  { id: 'lattice', label: 'Lattice / weave', patterns: [/lattice/, /basket/, /weav/, /\bgrid\b/, /\bmesh\b/] },
  { id: 'text-code', label: 'Text / code', patterns: [/binary/, /\bcodes?\b/, /inscription/, /\blettering\b/, /\bletters\b/] },
  { id: 'star', label: 'Star / pentagram', patterns: [/\bstars?\b/, /pentagram/, /pentacle/, /hexagram/, /heptagram/] },
  { id: 'key-claw', label: 'Key / claw / comb', patterns: [/\bkeys?\b/, /\bclaws?\b/, /\bcombs?\b/] },
  { id: 'grapeshot', label: 'Grapeshot / satellites', patterns: [/grape.?shot/, /satellites?/] },
  { id: 'spiral', label: 'Spiral', patterns: [/spirals?/, /\bhelix\b/, /helical/] },
  { id: 'celtic', label: 'Celtic knot / cross', patterns: [/celtic/] },
  { id: 'figure', label: 'Face / figure', patterns: [/\bfaces?\b/, /portrait/, /humanoid/, /\balien\b/] },
  { id: 'crescent', label: 'Crescent / moon', patterns: [/crescents?/, /\bmoons?\b/] },
  { id: 'fractal', label: 'Fractal', patterns: [/fractals?/, /julia set/, /mandelbrot/, /\bkoch\b/] },
  { id: 'serpent', label: 'Serpent', patterns: [/serpents?/, /\bsnakes?\b/] },
  { id: 'mandala', label: 'Mandala / flower-of-life', patterns: [/mandala/, /flower of life/, /rosette/, /\blotus\b/] },
];
