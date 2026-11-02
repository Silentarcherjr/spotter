export const clueCategories = [
  'street_sign',
  'storefront',
  'transit',
  'landmark',
  'license_plate',
  'house_number',
  'skyline',
  'vehicle_marking',
  'reflection',
  'other',
] as const;
export type ClueCategory = (typeof clueCategories)[number];
export interface Clue {
  category: ClueCategory;
  severity: number;
  confidence: number;
}
export interface FrameObservation {
  at: number;
  clues: readonly Clue[];
}
export interface AudioFeatures {
  at: number;
  rms: number;
  pitchMedian: number;
  pitchRange: number;
  spectralSlope: number;
  voicedRatio: number;
  pauseLength: number;
  speechRate: number;
}
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
export function validClue(clue: Clue): boolean {
  return (
    clueCategories.includes(clue.category) &&
    Number.isInteger(clue.severity) &&
    clue.severity >= 1 &&
    clue.severity <= 5 &&
    Number.isFinite(clue.confidence) &&
    clue.confidence >= 0 &&
    clue.confidence <= 1
  );
}
