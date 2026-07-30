import { TAG_VOCABULARY } from './tagVocabulary.ts';

/**
 * Derive shape tags from a formation's description text.
 * Returns null when there is no text to analyze (a meaningful distinction from
 * [] = "text analyzed, no shape identified").
 */
export function deriveTags(description: string | null | undefined): string[] | null {
  if (!description || !description.trim()) return null;

  const text = description
    .toLowerCase()
    .replace(/crop\s*circles?/gi, ' ') // generic phrase, not a shape signal
    .replace(/\s+/g, ' ');

  const tags: string[] = [];
  for (const tag of TAG_VOCABULARY) {
    if (tag.patterns.some((p) => p.test(text))) {
      tags.push(tag.id);
    }
  }
  return tags.sort();
}
