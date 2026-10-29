import { parseVision, clueDescriptions } from './vision-contract.ts';
import type { Clue, ClueCategory } from '../core/types.ts';
import type { ChatObservation } from '../core/moderation.ts';

// Fixture IDs are simulation metadata, never image interpretation in production.
export function mockVision(frame: number): Clue[] {
  const categories: ClueCategory[] = frame === 0 ? ['street_sign'] : frame === 1 ? ['storefront'] : frame === 2 ? ['storefront', 'transit'] : ['storefront', 'transit', 'reflection'];
  return parseVision({ clues: categories.map((category) => ({ category, description: clueDescriptions[category], severity: frame === 0 ? 2 : 4, confidence: frame === 0 ? .75 : .95 })) });
}
export function mockChatClassifier(fixture: 'ordinary' | 'guessing'): ChatObservation {
  return { guessing: fixture === 'guessing', confidence: .98 };
}
