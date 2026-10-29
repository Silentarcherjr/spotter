import './style.css';
import type { sessionReport } from '../src/core/session.ts';
const app = document.getElementById('app')!;
app.innerHTML = '<header><h1>Spotter · Session report</h1><a href="/dashboard/">Back to dashboard</a><strong id="simulated" class="badge" hidden>SIMULATED</strong></header><article class="card"><h2>Your session, at a glance.</h2><p id="summary">Loading…</p><p id="peak"></p><p id="low"></p><p id="changes"></p><p id="correlation"></p><svg id="curves" viewBox="0 0 600 180" aria-label="Energy and chat curves" role="img"></svg><p class="legend"><span>● Energy</span><span>● Chat, scaled to session peak</span></p><p>Energy is relative to your personal baseline. Correlation describes this session; it does not establish cause.</p></article>';
const text = (id: string, value: string) => { document.getElementById(id)!.textContent = value; };
try {
  const response = await fetch('/api/report');
  if (!response.ok) throw new Error('Unavailable');
  const report = await response.json() as ReturnType<typeof sessionReport> & { simulated: boolean };
  document.getElementById('simulated')!.hidden = !report.simulated;
  text('summary', report.samples ? `${report.samples} numeric session samples` : 'No calibrated energy samples yet. Enable the sensor and complete calibration first.');
  text('peak', report.peak ? `Peak energy: ${report.peak.energy}/100` : '');
  text('low', report.low ? `Lowest energy: ${report.low.energy}/100` : '');
  text('changes', report.energyChangePercent !== null ? `Energy change: ${report.energyChangePercent.toFixed(0)}% · Chat change: ${report.chatChangePercent?.toFixed(0) ?? '—'}%` : '');
  text('correlation', report.correlation !== null ? `Energy/chat correlation: ${report.correlation.toFixed(2)}` : 'Not enough variation for a correlation.');
  const peak = Math.max(1, ...report.curves.map((point) => point.chat));
  for (const metric of ['energy', 'chat'] as const) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', report.curves.map((point, index) => `${index / Math.max(1, report.curves.length - 1) * 600},${160 - (metric === 'energy' ? point.energy / 100 : point.chat / peak) * 140}`).join(' '));
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', metric === 'energy' ? '#b6ef89' : '#adadf4'); line.setAttribute('stroke-width', '3');
    document.getElementById('curves')!.append(line);
  }
} catch { text('summary', 'Report unavailable. Check the local server.'); }
