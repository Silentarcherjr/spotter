import './style.css';
import { chatSeriesState } from '../src/presentation/chart-layout.ts';
import { drawTelemetry, summarizeTelemetry, elapsedTime, correlationText, TelemetrySelection } from './telemetry.ts';
import type { TelemetryPoint, TelemetryEvent } from './telemetry.ts';
document.body.dataset.page = 'report';
if (new URLSearchParams(location.search).get('record') === '1') document.body.classList.add('recording');
const app = document.getElementById('app')!;
app.innerHTML = `<header class="report-header"><div><span class="eyebrow">SPOTTER / SESSION DEBRIEF</span><h1>Your second wind.</h1></div><a href="/dashboard/?record=1">Back to dashboard</a><strong id="simulated" class="badge" hidden>SIMULATED</strong></header><section class="report-tools"><label class="telemetry-source">Chart source <select id="take-select"><option value="">Current session</option></select></label><p id="source" class="data-provenance"></p></section><section class="report-metrics" id="metrics"></section><article class="card report-chart"><div class="card-top"><h2>The shape of your session.</h2><span class="mini-tag">ENERGY × COMMUNITY</span></div><svg id="curves" aria-label="Measured energy and chat over elapsed time, with recorded event annotations" role="img"></svg><p class="legend"><span>● Energy / 100</span><span data-chat-legend>chat not recorded</span><span>Elapsed time · mm:ss</span></p><p id="correlation"></p></article><article class="card report-moments"><span class="eyebrow">MOMENTS THAT MATTER</span><ul id="moments"></ul></article><footer><p id="summary">Loading numeric session data…</p><p>Relative to your baseline. Association is not causation.</p></footer>`;
let current: { curves: TelemetryPoint[]; presentationEvents: TelemetryEvent[]; simulated: boolean } = { curves: [], presentationEvents: [], simulated: false };
const selection = new TelemetrySelection(document.getElementById('take-select') as HTMLSelectElement, render);
function render(): void {
  const take = selection.selected; const points = take?.points ?? current.curves; const events = take?.events ?? current.presentationEvents;
  const summary = summarizeTelemetry(points); const sim = take?.simulated ?? current.simulated;
  document.getElementById('simulated')!.hidden = !sim;
  document.getElementById('source')!.textContent = selection.provenance(current.simulated);
  const change = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(0)}%`;
  const metrics = [ ['PEAK ENERGY', summary.peak ? `${summary.peak.energy}` : '—', summary.peak ? elapsedTime(summary.peak.at - summary.start) : 'No samples'], ['LOWEST ENERGY', summary.low ? `${summary.low.energy}` : '—', summary.low ? elapsedTime(summary.low.at - summary.start) : 'No samples'], ['ENERGY CHANGE', change(summary.energyChangePercent), 'First → last measured sample'], ['CHAT CHANGE', change(summary.chatChangePercent), 'Messages/min · no inferred traffic'] ];
  document.getElementById('metrics')!.replaceChildren(...metrics.map(([label, value, detail]) => { const card = document.createElement('article'); card.className = 'card metric-card'; const title = document.createElement('span'); title.className = 'eyebrow'; title.textContent = label!; const number = document.createElement('b'); number.textContent = value!; const note = document.createElement('p'); note.textContent = detail!; card.append(title, number, note); return card; }));
  drawTelemetry(document.getElementById('curves') as unknown as SVGSVGElement, points, events);
  const correlation = correlationText(points); const target = document.getElementById('correlation')!; target.hidden = correlation === null; target.textContent = correlation;
  const moments = [...events];
  if (summary.peak) moments.unshift({ at: summary.peak.at, label: 'Peak energy', kind: 'alert' });
  if (summary.low) moments.push({ at: summary.low.at, label: 'Lowest energy', kind: 'alert' });
  document.getElementById('moments')!.replaceChildren(...moments.toSorted((a, b) => a.at - b.at).slice(-7).map(event => { const li = document.createElement('li'); const time = document.createElement('b'); time.textContent = elapsedTime(event.at - summary.start); const label = document.createElement('span'); label.textContent = event.label; li.append(time, label); return li; }));
  document.getElementById('summary')!.textContent = `${points.length} numeric observations · ${chatSeriesState(points).visible ? `${summary.n} valid energy/chat pairs` : 'chat not recorded'} · ${elapsedTime(summary.end - summary.start)} measured span`;
}
try { const response = await fetch('/api/report'); if (!response.ok) throw new Error('Unavailable'); current = await response.json() as typeof current; current.presentationEvents ??= []; render(); }
catch { document.getElementById('summary')!.textContent = 'Report unavailable. Check the local server.'; }
