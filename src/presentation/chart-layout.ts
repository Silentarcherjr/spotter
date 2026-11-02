import type { TelemetryPoint } from './telemetry.ts';
export function chatSeriesState(points: readonly TelemetryPoint[]) {
  const samples = points.filter(
    (p) =>
      Number.isFinite(p.at) && typeof p.chat === 'number' && Number.isFinite(p.chat) && p.chat >= 0,
  );
  const visible = samples.some((p) => p.chat! > 0);
  return {
    n: samples.length,
    visible,
    legend: visible ? 'Chat, scaled to session peak' : 'chat not recorded',
  };
}
export interface AnnotationBox {
  index: number;
  anchor: number;
  width: number;
}
export interface PlacedAnnotation extends AnnotationBox {
  x: number;
  row: number;
}
// Search actual free intervals in three rows. Leaders preserve the event time when labels move.
export function placeAnnotationLabels(
  items: readonly AnnotationBox[],
  left: number,
  right: number,
): PlacedAnnotation[] {
  const placed: PlacedAnnotation[] = [];
  const gap = 8;
  for (const item of items) {
    if (
      ![item.anchor, item.width, left, right].every(Number.isFinite) ||
      item.width <= 0 ||
      item.width > right - left
    )
      continue;
    let best: { x: number; row: number; cost: number } | null = null;
    for (let row = 0; row < 3; row++) {
      const occupied = placed.filter((p) => p.row === row).toSorted((a, b) => a.x - b.x);
      let start = left;
      for (let i = 0; i <= occupied.length; i++) {
        const stop = occupied[i] ? occupied[i]!.x - gap : right;
        if (stop - start >= item.width) {
          const x = Math.max(start, Math.min(stop - item.width, item.anchor - item.width / 2));
          const cost = Math.abs(x + item.width / 2 - item.anchor) + row * 16;
          if (!best || cost < best.cost) best = { x, row, cost };
        }
        if (occupied[i]) start = occupied[i]!.x + occupied[i]!.width + gap;
      }
    }
    if (best) placed.push({ ...item, x: best.x, row: best.row });
  }
  return placed;
}
