import {
  evaluatePrestream,
  filterPrestreamClues,
  DEFAULT_PRESTREAM_CONFIDENCE,
} from '../core/prestream.ts';
import type { PrestreamInput } from '../core/prestream.ts';
type Configuration = Omit<
  PrestreamInput,
  'visionAvailable' | 'qrAvailable' | 'clues' | 'qrDetected'
> & { scene: string | null };
export async function runPrestream(
  deps: {
    inspect: () => Promise<Configuration>;
    capture: (scene: string) => Promise<Buffer>;
    detect: (image: Buffer) => { detected: boolean };
    vision: (image: string) => Promise<{ description: string; confidence: number }[]>;
  },
  qrEnabled: boolean,
  minimumConfidence = DEFAULT_PRESTREAM_CONFIDENCE,
) {
  let config: Configuration;
  try {
    config = await deps.inspect();
    if (!config.scene) throw Error('Scene unavailable');
  } catch {
    return {
      level: 'amber' as const,
      findings: ['OBS inspection unavailable', 'analysis unavailable'],
    };
  }
  let qrAvailable = false,
    qrDetected = false,
    visionAvailable = false,
    clues: string[] = [];
  try {
    const image = await deps.capture(config.scene!);
    try {
      qrDetected = deps.detect(image).detected;
      qrAvailable = true;
    } catch {}
    if (qrAvailable && !qrDetected) {
      try {
        clues = filterPrestreamClues(
          await deps.vision(`data:image/png;base64,${image.toString('base64')}`),
          minimumConfidence,
        );
        visionAvailable = true;
      } catch {}
    }
  } catch {}
  return evaluatePrestream({
    ...config,
    qrEnabled,
    visionAvailable,
    qrAvailable,
    qrDetected,
    clues,
  });
}
