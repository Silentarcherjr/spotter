const tweens = new WeakMap<HTMLElement, number>();
export function animateNumber(element: HTMLElement | null, value: number | null): void {
  if (!element) return;
  if (value === null) {
    cancelAnimationFrame(tweens.get(element) ?? 0);
    element.textContent = '—';
    delete element.dataset.target;
    return;
  }
  if (element.dataset.target === String(value)) return;
  element.dataset.target = String(value);
  cancelAnimationFrame(tweens.get(element) ?? 0);
  const from = Number(element.textContent) || 0;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = String(value);
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / 650);
    element.textContent = String(Math.round(from + (value - from) * (1 - (1 - progress) ** 3)));
    if (progress < 1) tweens.set(element, requestAnimationFrame(tick));
  };
  tweens.set(element, requestAnimationFrame(tick));
}
export function relayMarkup(): string {
  return '<div class="relay-track" data-phase="idle" aria-hidden="true"><div class="relay-channel channel-home"><span>01</span><b>YOU</b><i></i></div><div class="relay-lane"><span class="lane-dash"></span><span class="baton"><i></i></span><span class="handoff-burst"></span></div><div class="relay-channel channel-crew"><span>02</span><b>CREW</b><i></i></div></div>';
}
export function renderRelay(root: HTMLElement | null, phase: string, returning = false): void {
  if (!root) return;
  root.dataset.returning = String(returning);
  if (root.dataset.phase !== phase) root.dataset.phase = phase;
}
