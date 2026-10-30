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

// Scripted input only: moderate, irregular decline into the measured44-ish range.
export function demoVoiceFeatures(at: number, step: number) {
  const levels = [0, .04, -.03, .02, .3, .5, .7, .9, 1, 1.01, 1.025, 1.01];
  const f = levels[step] ?? [1.015, 1.025, 1.01, 1.02][step % 4]!;
  return createSimEvent(true, 'audio_features', { at, rms: .2 - .04 * f, pitchMedian: 150 - 18 * f, pitchRange: 50 - 14 * f, spectralSlope: -2 - .8 * f, voicedRatio: .7 - .12 * f, pauseLength: .2 + .16 * f, speechRate: 3 - .8 * f });
}
