import { createSimEvent } from './events.ts';
import type { AudioFeatures } from '../core/types.ts';

export function voiceFeatures(enabled: boolean, at: number, low: boolean) {
  const data: AudioFeatures = { at, rms: low ? .03 : .2, pitchMedian: low ? 95 : 150, pitchRange: low ? 5 : 50, spectralSlope: low ? -4 : -2, voicedRatio: low ? .15 : .7, pauseLength: low ? 1.8 : .2, speechRate: low ? .2 : 3 };
  return createSimEvent(enabled, 'audio_features', { ...data });
}
export function frameSource(enabled: boolean, step: number, at: number) {
  return createSimEvent(enabled, 'frame', { fixture: step, at });
}
export function syntheticChat(enabled: boolean, step: number, at: number) {
  const count = step < 4 ? 10 : 6;
  return Array.from({ length: count }, (_, index) => createSimEvent(enabled, 'chat', { id: `chat-${step}-${index}`, userId: `viewer-${index}`, at, fixture: index === 0 && step === 3 ? 'guessing' as const : 'ordinary' as const }));
}
export function simulatedCrew(enabled: boolean) {
  return createSimEvent(enabled, 'crew', { id: 'crew-partner', live: true, energy: 91 });
}
