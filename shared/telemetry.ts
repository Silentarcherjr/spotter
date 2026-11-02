import { chatSeriesState, placeAnnotationLabels } from '../src/presentation/chart-layout.ts';
import { elapsedTime, summarizeTelemetry } from '../src/presentation/telemetry.ts';
import type {
  RecordedTake,
  TelemetryEvent,
  TelemetryPoint,
} from '../src/presentation/telemetry.ts';
export { summarizeTelemetry, elapsedTime };
export type { TelemetryEvent, TelemetryPoint };
const ns = 'http://www.w3.org/2000/svg';
export function drawTelemetry(
  svg: SVGSVGElement,
  points: readonly TelemetryPoint[],
  events: readonly TelemetryEvent[] = [],
): void {
  const width = Math.max(320, svg.clientWidth || 600);
  const height = Math.max(150, svg.clientHeight || 220);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.replaceChildren();
  const left = 38,
    right = width - 18,
    top = 70,
    bottom = height - 40;
  const valid = points.filter((p) => Number.isFinite(p.at)).toSorted((a, b) => a.at - b.at);
  const start = valid[0]?.at ?? 0,
    end = valid.at(-1)?.at ?? start;
  const x = (at: number) => left + ((at - start) / Math.max(1, end - start)) * (right - left);
  const peak = Math.max(1, ...valid.map((p) => p.chat ?? 0));
  const node = (tag: string, attrs: Record<string, string>, text?: string) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    svg.append(e);
    return e;
  };
  for (const value of [0, 50, 100]) {
    const y = bottom - (value / 100) * (bottom - top);
    node('line', {
      x1: String(left),
      x2: String(right),
      y1: String(y),
      y2: String(y),
      stroke: '#ffffff25',
    });
    node('text', { x: '0', y: String(y + 5), fill: '#bdc9df', 'font-size': '14' }, String(value));
  }
  for (let i = 0; i <= 3; i++) {
    const at = start + ((end - start) * i) / 3;
    node(
      'text',
      {
        x: String(x(at)),
        y: String(height - 12),
        'text-anchor': i === 0 ? 'start' : i === 3 ? 'end' : 'middle',
        fill: '#bdc9df',
        'font-size': '14',
      },
      elapsedTime(at - start),
    );
  }
  const gaps = valid
    .slice(1)
    .map((p, i) => p.at - valid[i]!.at)
    .filter((n) => n > 0)
    .toSorted((a, b) => a - b);
  const gapLimit = Math.max(5000, (gaps[Math.floor(gaps.length / 2)] ?? 30000) * 3);
  const chat = chatSeriesState(valid);
  const legend = svg.parentElement?.querySelector<HTMLElement>('[data-chat-legend]');
  if (legend) {
    legend.textContent = chat.visible ? '● ' + chat.legend : chat.legend;
    legend.classList.toggle('chat-unrecorded', !chat.visible);
  }
  for (const metric of ['energy', 'chat'] as const) {
    if (metric === 'chat' && !chat.visible) continue;
    let segment: string[] = [];
    let previous: number | null = null;
    const flush = () => {
      if (segment.length)
        node('polyline', {
          points: segment.join(' '),
          fill: 'none',
          stroke: metric === 'energy' ? '#c5ff6b' : '#b5a0ff',
          'stroke-width': '3',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'data-series': metric,
        });
      segment = [];
    };
    for (const point of valid) {
      const value = point[metric];
      if (
        value === null ||
        !Number.isFinite(value) ||
        (previous !== null && point.at - previous > gapLimit)
      )
        flush();
      if (value !== null && Number.isFinite(value))
        segment.push(
          `${x(point.at)},${bottom - (metric === 'energy' ? value / 100 : value / peak) * (bottom - top)}`,
        );
      previous = point.at;
    }
    flush();
  }
  const distinct = events.filter(
    (e, i, a) =>
      e.at >= start &&
      e.at <= end &&
      a.findIndex((v) => v.at === e.at && v.label === e.label) === i,
  );
  const compact: Record<string, string> = {
    'Tag out suggested': 'Tag out',
    'Raid pending': 'Raid',
    'Relay confirmed': 'Covered',
    'Home confirmed': 'Home',
    'Combined alert': 'Alert',
  };
  const annotations = distinct
    .slice(-5)
    .toSorted((a, b) => a.at - b.at)
    .map((event, index) => {
      const caption = width < 900 ? (compact[event.label] ?? event.label) : event.label;
      const text = node(
        'text',
        { 'font-size': '14', visibility: 'hidden' },
        caption,
      ) as SVGTextElement;
      const measured = text.getComputedTextLength();
      text.remove();
      return { index, event, caption, anchor: x(event.at), width: Math.ceil(measured) + 2 };
    });
  const placements = placeAnnotationLabels(annotations, left, right);
  for (const annotation of annotations) {
    const { event, anchor: px } = annotation;
    const color =
      event.kind === 'privacy' ? '#ffd27c' : event.kind === 'alert' ? '#ffad87' : '#c5b4ff';
    node('line', {
      x1: String(px),
      x2: String(px),
      y1: String(top - 4),
      y2: String(bottom),
      stroke: color,
      'stroke-dasharray': '3 5',
      opacity: '.7',
    });
    const placement = placements.find((p) => p.index === annotation.index);
    if (!placement) {
      const marker = node('circle', { cx: String(px), cy: String(top - 4), r: '3', fill: color });
      const title = document.createElementNS(ns, 'title');
      title.textContent = event.label;
      marker.append(title);
      continue;
    }
    const y = 16 + placement.row * 20;
    node('path', {
      d: `M${placement.x + placement.width / 2} ${y + 5} L${px} ${top - 4}`,
      stroke: color,
      opacity: '.35',
      fill: 'none',
    });
    const label = node(
      'text',
      {
        x: String(placement.x),
        y: String(y),
        fill: color,
        'font-size': '14',
        'data-event-label': String(annotation.index),
      },
      annotation.caption,
    );
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${elapsedTime(event.at - start)} · ${event.label}`;
    label.append(title);
  }
}
export function correlationText(points: readonly TelemetryPoint[]): string | null {
  const { correlation, n } = summarizeTelemetry(points);
  return correlation === null
    ? null
    : `Energy / chat r = ${correlation.toFixed(2)} · n=${n} pairs · association, not causation`;
}
export class TelemetrySelection {
  selected: RecordedTake | null = null;
  private changed: () => void;
  constructor(select: HTMLSelectElement, changed: () => void) {
    this.changed = changed;
    select.addEventListener('change', () => {
      void this.load(select.value);
    });
    void (async () => {
      try {
        const response = await fetch('/api/review/takes');
        if (!response.ok) return;
        const takes = (await response.json()) as { id: string; label: string }[];
        for (const take of takes) {
          const option = document.createElement('option');
          option.value = take.id;
          option.textContent = `Recorded · ${take.label}`;
          select.append(option);
        }
        const requested = new URLSearchParams(location.search).get('take');
        const selected =
          requested === 'current'
            ? ''
            : (takes.find((take) => take.id === requested)?.id ?? takes[0]?.id ?? '');
        select.value = selected;
        await this.load(selected);
      } catch {
        /* Current session remains clearly labelled when no take is available. */
      }
    })();
  }
  private async load(id: string) {
    this.selected = null;
    if (id) {
      try {
        const r = await fetch(`/api/review/takes/${encodeURIComponent(id)}`);
        if (r.ok) this.selected = (await r.json()) as RecordedTake;
      } catch {
        /* No invented history on failure. */
      }
    }
    this.changed();
  }
  provenance(simulated: boolean): string {
    return this.selected
      ? `RECORDED · ${this.selected.label} · ${this.selected.simulated ? 'SIMULATED audio' : 'measured numeric data'} · ${this.selected.points.length} samples${this.selected.points.every((p) => p.chat === null) ? ' · chat not recorded' : ''}`
      : simulated
        ? 'CURRENT DEMO · SIMULATED · accelerated time'
        : 'CURRENT SESSION · numeric samples';
  }
}
