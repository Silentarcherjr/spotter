import { DatabaseSync } from 'node:sqlite';
import { ObsClient } from './client.ts';
import type { ObsConfig } from './client.ts';
import type { QrConfig } from '../core/qr.ts';
import { QrGuard } from '../modules/qrguard/runtime.ts';
import { PrivacyCoordinator } from '../modules/privacy.ts';
import { QrSensor } from '../qr/sensor.ts';
/** Standalone offline production sensor; no AI/Twitch calls, no retained captures. */
export async function runQrProgramTrial(
  config: ObsConfig,
  policy: QrConfig,
  mode: 'observed' | 'protected' | 'dismiss',
  durationMs = 18000,
) {
  const db = new DatabaseSync(':memory:');
  const obs = new ObsClient(config);
  const start = performance.now();
  let dismissedAt: number | null = null;
  const rows: { at: number; detected: boolean; active: boolean }[] = [];
  let unavailable = 0;
  const coordinator = new PrivacyCoordinator({
    protect: () => obs.applyPrivacy(),
    restore: () => obs.restore(),
  });
  const guard = new QrGuard(policy, db, {
    available: () => obs.connected,
    protect: () => coordinator.hold('qr_guard', true),
    confirm: () => obs.confirmPrivacy(),
    release: () => coordinator.hold('qr_guard', false),
    marker: async () => {},
  });
  const sensor = new QrSensor(
    {
      capture: async () => {
        await obs.prepareQr(policy.source, policy.renderDelayMs);
        return obs.capturePng(policy.source, policy.frameWidth);
      },
      observe: async (value, timing) => {
        if (mode !== 'observed') await guard.observe(value, timing);
        if (mode === 'dismiss' && dismissedAt === null && guard.snapshot().active) {
          await guard.dismiss();
          dismissedAt = performance.now() - start;
        }
        rows.push({
          at: performance.now() - start,
          detected: value.detected,
          active: guard.snapshot().active,
        });
      },
      unavailable: () => {
        unavailable++;
        guard.unavailable();
      },
    },
    policy.intervalMs,
  );
  try {
    await obs.start();
    await obs.prepareQr(policy.source, policy.renderDelayMs);
    sensor.start();
    await new Promise((r) => setTimeout(r, durationMs));
    sensor.stop();
    await guard.stop();
    return { mode, durationMs, dismissedAt, unavailable, rows, state: guard.snapshot() };
  } finally {
    sensor.stop();
    await guard.stop();
    await obs.stop();
    db.close();
  }
}
