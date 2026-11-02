import type { DatabaseSync } from 'node:sqlite';
import { initialQr, stepQr } from '../../core/qr.ts';
import type { QrConfig } from '../../core/qr.ts';
import type { QrObservation } from '../../qr/detector.ts';
import { distribution } from '../../observability/metrics.ts';
interface Dependencies {
  available?: () => boolean;
  protect: () => Promise<void>;
  confirm: () => Promise<void>;
  release: () => Promise<void>;
  marker: () => Promise<unknown>;
  clock?: () => number;
}
export class QrGuard {
  private config: QrConfig;
  private state = initialQr();
  private db: DatabaseSync;
  private dependencies: Dependencies;
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  private markerTasks = new Set<Promise<void>>();
  private latencyRows: {
    at: number;
    captureMs: number;
    detectorMs: number;
    decisionToSceneMs: number;
    captureToSceneMs: number;
  }[] = [];
  private lastMarker: { id: string; positionSeconds: number } | null = null;
  private markerStatus = 'idle';
  private actionStatus = 'idle';
  constructor(config: QrConfig, db: DatabaseSync, dependencies: Dependencies) {
    this.config = config;
    this.db = db;
    this.dependencies = dependencies;
    db.exec(
      'CREATE TABLE IF NOT EXISTS qr_audit (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, reason TEXT NOT NULL, outcome TEXT NOT NULL)',
    );
  }
  private enqueue(work: () => Promise<void>) {
    const run = this.queue.then(work);
    this.queue = run.catch(() => {});
    return run;
  }
  unavailable() {
    this.state = stepQr(
      this.state,
      { type: 'sample', at: Date.now(), detected: null },
      this.config,
    ).state;
  }
  observe(
    observation: QrObservation,
    timing: { captureMs: number; detectorMs: number; started: number },
    now = Date.now(),
  ) {
    return this.enqueue(async () => {
      if (this.stopped) return;
      const previous = this.state;
      const clock = this.dependencies.clock ?? (() => performance.now());
      const detected = timing.started + timing.captureMs + timing.detectorMs;
      const decision = stepQr(
        previous,
        { type: 'sample', at: now, detected: observation.detected === true },
        this.config,
      );
      try {
        for (const action of decision.actions) {
          if (this.stopped || this.dependencies.available?.() === false)
            throw Error('QR Guard unavailable');
          if (action === 'protect') {
            await this.dependencies.protect();
            await this.dependencies.confirm();
            const applied = clock();
            this.actionStatus = 'privacy applied';
            this.latencyRows.push({
              at: now,
              captureMs: timing.captureMs,
              detectorMs: timing.detectorMs,
              decisionToSceneMs: applied - detected,
              captureToSceneMs: applied - timing.started,
            });
            this.latencyRows = this.latencyRows.slice(-200);
          }
          if (action === 'release') {
            await this.dependencies.release();
            this.actionStatus = 'restored';
          }
          if (action === 'audit')
            this.db
              .prepare('INSERT INTO qr_audit(at,reason,outcome) VALUES (?,?,?)')
              .run(now, 'qr_guard', 'privacy applied');
          if (action === 'marker') {
            const task = this.dependencies.marker().then(
              (response) => {
                this.markerStatus = 'created';
                const marker = (
                  response as { data?: { id?: unknown; position_seconds?: unknown }[] } | undefined
                )?.data?.[0];
                if (
                  marker &&
                  /^[A-Za-z0-9_-]{1,128}$/.test(String(marker.id)) &&
                  typeof marker.position_seconds === 'number' &&
                  Number.isFinite(marker.position_seconds)
                )
                  this.lastMarker = {
                    id: String(marker.id),
                    positionSeconds: marker.position_seconds,
                  };
              },
              () => {
                this.markerStatus = 'unavailable';
              },
            );
            this.markerTasks.add(task);
            void task.finally(() => this.markerTasks.delete(task));
          }
        }
        this.state = decision.state;
      } catch {
        this.state = stepQr(
          previous,
          { type: 'sample', at: now, detected: null },
          this.config,
        ).state;
        this.actionStatus = 'unavailable';
      }
    });
  }
  dismiss(now = Date.now()) {
    return this.enqueue(async () => {
      const decision = stepQr(this.state, { type: 'dismiss', at: now }, this.config);
      for (const action of decision.actions)
        if (action === 'release') await this.dependencies.release();
      this.state = decision.state;
      this.actionStatus = 'dismissed';
    });
  }
  snapshot() {
    const entries = this.db
      .prepare('SELECT at,reason,outcome FROM qr_audit ORDER BY id DESC LIMIT 100')
      .all() as { at: number; reason: string; outcome: string }[];
    return {
      enabled: true,
      status: this.state.status,
      active: this.state.active,
      cleanFrames: this.state.clean,
      suppressUntil: this.state.suppressUntil,
      markerStatus: this.markerStatus,
      lastMarker: this.lastMarker,
      actionStatus: this.actionStatus,
      lastLatency: this.latencyRows.at(-1) ?? null,
      latency: {
        detectionToScene: distribution(this.latencyRows.map((row) => row.decisionToSceneMs)),
        captureToScene: distribution(this.latencyRows.map((row) => row.captureToSceneMs)),
      },
      entries,
    };
  }
  async stop() {
    this.stopped = true;
    await this.queue;
    await Promise.allSettled([...this.markerTasks]);
  }
}
