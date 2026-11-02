import { createSimEvent } from './events.ts';
import type { AudioFeatures } from '../core/types.ts';

export function voiceFeatures(enabled: boolean, at: number, low: boolean) {
  const data: AudioFeatures = {
    at,
    rms: low ? 0.03 : 0.2,
    pitchMedian: low ? 95 : 150,
    pitchRange: low ? 5 : 50,
    spectralSlope: low ? -4 : -2,
    voicedRatio: low ? 0.15 : 0.7,
    pauseLength: low ? 1.8 : 0.2,
    speechRate: low ? 0.2 : 3,
  };
  return createSimEvent(enabled, 'audio_features', { ...data });
}
export function frameSource(enabled: boolean, step: number, at: number) {
  return createSimEvent(enabled, 'frame', { fixture: step, at });
}
export function syntheticChat(enabled: boolean, step: number, at: number) {
  const count = step < 4 ? 10 : 6;
  return Array.from({ length: count }, (_, index) =>
    createSimEvent(enabled, 'chat', {
      id: `chat-${step}-${index}`,
      userId: `viewer-${index}`,
      at,
      fixture: index === 0 && step === 3 ? ('guessing' as const) : ('ordinary' as const),
    }),
  );
}
export function simulatedCrew(enabled: boolean) {
  return createSimEvent(enabled, 'crew', { id: 'crew-partner', live: true, energy: 91 });
}

// Scripted input only: moderate, irregular decline into the measured44-ish range.
export function demoVoiceFeatures(at: number, step: number) {
  const levels = [0, 0.04, -0.03, 0.02, 0.3, 0.5, 0.7, 0.9, 1, 1.01, 1.025, 1.01];
  const f = levels[step] ?? [1.015, 1.025, 1.01, 1.02][step % 4]!;
  return createSimEvent(true, 'audio_features', {
    at,
    rms: 0.2 - 0.04 * f,
    pitchMedian: 150 - 18 * f,
    pitchRange: 50 - 14 * f,
    spectralSlope: -2 - 0.8 * f,
    voicedRatio: 0.7 - 0.12 * f,
    pauseLength: 0.2 + 0.16 * f,
    speechRate: 3 - 0.8 * f,
  });
}
