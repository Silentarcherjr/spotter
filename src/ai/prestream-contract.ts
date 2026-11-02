import { visionSchema, clueDescriptions } from './vision-contract.ts';
const descriptions: Record<string, string> = {
  ...clueDescriptions,
  readable_document: 'Readable document',
  package_label: 'Mail or package label',
  street_view_window: 'Window with street view',
};
export const prestreamSchema = {
  ...visionSchema,
  properties: {
    clues: {
      ...visionSchema.properties.clues,
      items: {
        ...visionSchema.properties.clues.items,
        properties: {
          ...visionSchema.properties.clues.items.properties,
          category: { type: 'string', enum: Object.keys(descriptions) },
          description: { type: 'string', enum: Object.values(descriptions) },
        },
      },
    },
  },
} as const;
export function parsePrestreamVision(value: unknown): string[] {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).join() !== 'clues' ||
    !('clues' in value) ||
    !Array.isArray(value.clues) ||
    value.clues.length > 20
  )
    throw Error('Invalid observation');
  return value.clues.map((item: unknown) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Object.keys(item).toSorted().join() !== 'category,confidence,description,severity'
    )
      throw Error('Invalid observation');
    const c = item as {
      category: string;
      description: string;
      severity: number;
      confidence: number;
    };
    if (
      !Object.hasOwn(descriptions, c.category) ||
      descriptions[c.category] !== c.description ||
      !Number.isInteger(c.severity) ||
      c.severity < 1 ||
      c.severity > 5 ||
      !Number.isFinite(c.confidence) ||
      c.confidence < 0 ||
      c.confidence > 1
    )
      throw Error('Invalid observation');
    return c.description;
  });
}
