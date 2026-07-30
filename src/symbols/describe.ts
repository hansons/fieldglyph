import Anthropic from '@anthropic-ai/sdk';
import { SYMBOL_SPEC_SCHEMA, type SymbolSpec } from './spec.ts';

export interface FormationContext {
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  imageKind: string; // 'diagram' | 'photo'
}

export interface DescribeResult {
  spec: SymbolSpec | null;
  refused: boolean;
  usage: { inputTokens: number; outputTokens: number };
}

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const SYSTEM_PROMPT = `You convert crop circle imagery into faithful symbolic representations.

Given an aerial photograph or a researcher's diagram of a crop formation, describe the
formation's geometry using ONLY the provided element vocabulary, on a normalized 100x100
canvas with the formation centered near (50,50) and scaled to use most of the canvas.

Faithfulness rules:
- Capture layout, structure, and relative proportions — the count of circles, their
  arrangement, ring nesting, connecting avenues, satellite patterns, angular elements.
- Correct for perspective: aerial photos are usually oblique; the formation itself is
  built of true circles, so render what the geometry IS, not the ellipse the camera saw.
- Do not decorate, symmetrize, or "improve" the design. If the source shows 7 satellites,
  emit 7, not a rounder-looking 8.
- Ignore tramlines (parallel tractor tracks crossing the whole field), field edges,
  shadows, people, and vehicles — they are not part of the formation.
- Draw order: largest/background elements first, details last.
- Use 'standing' circles for upright crop islands inside flattened areas.
- Report confidence honestly and note anything the vocabulary cannot express.`;

export function buildUserText(context: FormationContext): string {
  const lines = [
    context.imageKind === 'diagram'
      ? 'This image is a researcher-drawn diagram of the formation.'
      : 'This image is a photograph of the formation in the field.',
  ];
  if (context.title) lines.push(`Formation: ${context.title}`);
  if (context.tags && context.tags.length > 0) {
    lines.push(`Shape tags derived from reports: ${context.tags.join(', ')}`);
  }
  if (context.description) {
    lines.push(`Source description (may inform element counts/sizes): ${context.description.slice(0, 1200)}`);
  }
  lines.push('Produce the symbolic representation now.');
  return lines.join('\n');
}

export type DescribeFn = (
  imageBase64: string,
  mediaType: ImageMediaType,
  context: FormationContext,
) => Promise<DescribeResult>;

export function createDescribeFn(model: string): DescribeFn {
  // Resolves credentials from ANTHROPIC_API_KEY or an `ant auth login` profile.
  const client = new Anthropic();

  return async (imageBase64, mediaType, context) => {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      output_config: {
        format: {
          type: 'json_schema',
          schema: SYMBOL_SPEC_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 },
            },
            { type: 'text', text: buildUserText(context) },
          ],
        },
      ],
    });

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    if (response.stop_reason === 'refusal') {
      return { spec: null, refused: true, usage };
    }

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      return { spec: null, refused: false, usage };
    }
    return { spec: JSON.parse(text.text) as SymbolSpec, refused: false, usage };
  };
}
