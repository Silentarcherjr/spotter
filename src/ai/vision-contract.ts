import { clueCategories, validClue } from '../core/types.ts';
import type { Clue, ClueCategory } from '../core/types.ts';

export const clueDescriptions: Record<ClueCategory, string> = {
  street_sign: 'Readable street sign',
  storefront: 'Identifying storefront visible',
  transit: 'Transit identifier visible',
  landmark: 'Distinctive landmark visible',
  license_plate: 'Readable vehicle plate',
  house_number: 'Building number visible',
  skyline: 'Distinctive skyline visible',
  vehicle_marking: 'Identifying vehicle marking',
  reflection: 'Identifying clue in reflection',
  other: 'Other identifying clue visible',
};
export const visionPrompt =
  'Describe identifying clue categories only. Never infer or output a location, place, address or coordinates. Never transcribe text or numbers seen in the image. Use only the supplied generic descriptions. Report observations, never actions or scores.';
export const visionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['clues'],
  properties: {
    clues: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'description', 'severity', 'confidence'],
        properties: {
          category: { type: 'string', enum: clueCategories },
          description: { type: 'string', enum: Object.values(clueDescriptions) },
          severity: { type: 'integer', minimum: 1, maximum: 5 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;
export function parseVision(value: unknown): Clue[] {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).join() !== 'clues' ||
    !('clues' in value) ||
    !Array.isArray(value.clues) ||
    value.clues.length > 20
  )
    throw new Error('Invalid vision observation');
  return value.clues.map((item: unknown) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Object.keys(item).toSorted().join() !== 'category,confidence,description,severity'
    )
      throw new Error('Invalid clue');
    const candidate = item as Clue & { description: string };
    if (!validClue(candidate) || candidate.description !== clueDescriptions[candidate.category])
      throw new Error('Invalid clue');
    return {
      category: candidate.category,
      severity: candidate.severity,
      confidence: candidate.confidence,
    };
  });
}
