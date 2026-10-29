import './style.css';
import type { DemoSession } from '../src/sim/session.ts';

type Snapshot = ReturnType<DemoSession['snapshot']>;
const app = document.querySelector<HTMLElement>('#app')!;
const page = window.location.pathname.split('/')[1] ?? 'dashboard';
document.body.dataset.page = page;
const badge = '<strong class="badge" id="simulated" hidden>SIMULATED</strong>';
const links = '<nav><a href="/dashboard/">Dashboard</a><a href="/sensor/">Sensor</a><a href="/overlay/" target="_blank">OBS overlay ↗</a></nav>';
if (page === 'dashboard') {
  app.innerHTML = `<header><div><span class="eyebrow">YOUR STREAM. YOUR BACKUP.</span><h1>Spotter<span class="dot">●</span></h1></div>${links}${badge}</header>
    <div class="intro"><div><h2>A little backup goes a long way.</h2><p>Private signals for the person behind the stream.</p></div><span id="connection" class="connection">Connecting…</span></div>
    <div class="demo-controls"><button id="reset" hidden>Replay simulated session</button></div><p id="error" role="status" hidden></p><div id="combined" class="alert" role="alert" hidden>Low energy + high exposure. Consider moving or taking a break.</div>
    <section class="grid">
      <article class="card"><span class="eyebrow">01 / OFF THE MAP</span><h2>Know what’s showing.</h2><div class="score"><b id="exposure">—</b><span>/ 100<br>findability</span></div><meter id="exposure-meter" min="0" max="100" value="0"></meter><p id="analysis">analysis unavailable</p><ul id="clues"></ul><button id="dismiss" hidden>Dismiss privacy action</button></article>
      <article class="card"><span class="eyebrow">02 / SECOND WIND</span><h2>Check your reserve.</h2><div class="score"><b id="energy">—</b><span>/ 100<br>personal energy</span></div><meter id="energy-meter" min="0" max="100" value="0"></meter><p id="calibration">Waiting for numeric audio features</p><p id="chat">Chat activity unavailable</p><p id="correlation">Correlation needs paired stream samples.</p></article>
      <article class="card crew"><span class="eyebrow">03 / TAG OUT</span><h2>Your crew has you.</h2><div class="avatar">↗</div><h3 id="partner">No crew connected</h3><p id="raid-phase">idle</p><div class="actions"><button id="approve" hidden>Approve simulated raid</button><button id="cancel" hidden>Cancel raid</button><button id="back" hidden>Request tag back</button></div><p class="muted">Every raid needs a click from its broadcaster.</p></article>
    </section>
    <section id="scene-panel" class="card" hidden><span class="eyebrow">SYNTHETIC SCENE / MOCK VISION · SIMULATED</span><img id="scene" alt="Synthetic street illustration for the mock demo"/><p>Illustrative fixture. Mock clues follow the script; no model interprets these pixels.</p></section><section class="lower"><article class="card"><span class="eyebrow">THIS SESSION</span><h2>Energy meets community.</h2><svg id="curves" viewBox="0 0 600 180" role="img" aria-label="Energy and chat activity over time"><path d="M0 160H600 M0 90H600 M0 20H600" stroke="#334039" fill="none"/></svg><p class="legend"><span>● Energy</span><span>● Chat activity, scaled to session peak</span></p></article>
      <article class="card"><span class="eyebrow">EXPOSURE REPLAY</span><h2>The clues, without the place.</h2><ol id="timeline"></ol><p id="moderation" class="muted">No moderated messages.</p></article></section>
    <footer><label><input type="checkbox" id="hud"> Opt in to the public stamina HUD</label><p>Frames aren’t saved. Audio stays local. No location is ever produced.</p></footer>`;
} else if (page === 'overlay') {
  app.innerHTML = `${badge}<section id="hud-content" hidden><span class="eyebrow">SPOTTER / SECOND WIND</span><meter id="energy-meter" min="0" max="100" value="0"></meter><p id="raid-phase"></p></section>`;
} else {
  app.innerHTML = `<header><h1>Spotter<span class="dot">●</span></h1>${links}${badge}</header><article class="card"><span class="eyebrow">LOCAL AUDIO SENSOR</span><h2>Your voice stays here.</h2><p>The microphone sensor will be connected in phase 5. This demo uses simulated numeric features and never opens your microphone.</p><p id="error" role="status"></p></article>`;
}
const element = (id: string) => document.getElementById(id);
const text = (id: string, value: string) => { const target = element(id); if (target) target.textContent = value; };
const hidden = (id: string, value: boolean) => { const target = element(id); if (target) target.hidden = value; };
const meter = (id: string, value: number) => { const target = element(id) as HTMLMeterElement | null; if (target) target.value = value; };
let busy = false;
async function post(path: string, payload?: unknown): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const response = await fetch(path, { method: 'POST', ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) });
    if (!response.ok) throw new Error('Action unavailable');
    await refresh();
  } catch { text('error', 'Action unavailable. Try again.'); hidden('error', false); }
  finally { busy = false; }
}
for (const [id, action] of [['approve', 'approve'], ['cancel', 'cancel'], ['back', 'requestBack'], ['dismiss', 'dismiss'], ['reset', 'reset']]) {
  if (id && action) element(id)?.addEventListener('click', () => { void post(`/api/demo/${action}`); });
}
element('hud')?.addEventListener('change', (event) => { void post('/api/hud', { enabled: (event.target as HTMLInputElement).checked }); });
function chart(state: Snapshot): void {
  const svg = element('curves');
  if (!svg) return;
  svg.querySelectorAll('polyline').forEach((line) => line.remove());
  const peak = Math.max(1, ...state.curves.map((point) => point.chat));
  for (const metric of ['energy', 'chat'] as const) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', state.curves.map((point, index) => `${index / Math.max(1, state.curves.length - 1) * 600},${160 - (metric === 'energy' ? point.energy / 100 : point.chat / peak) * 140}`).join(' '));
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', metric === 'energy' ? '#b6ef89' : '#adadf4'); line.setAttribute('stroke-width', '3');
    svg.append(line);
  }
}
function render(state: Snapshot): void {
  hidden('reset', false);
  hidden('scene-panel', false);
  const scene = element('scene');
  if (scene) scene.style.filter = state.exposure.active ? 'blur(12px)' : 'none';
  text('exposure', String(state.exposure.score)); meter('exposure-meter', state.exposure.score);
  text('energy', state.energy === null ? '—' : String(state.energy)); meter('energy-meter', state.energy ?? 0);
  text('analysis', state.exposure.active ? 'Privacy action active · simulated' : state.exposure.score < 60 ? 'no obvious clues detected' : 'Identifying clues detected');
  text('calibration', 'Simulated personal baseline · accelerated time');
  text('chat', `${state.chat.messagesPerMinute} messages/min · ${state.chat.uniqueChattersPerMinute} unique chatters/min`);
  text('correlation', state.correlation === null ? 'Correlation needs paired stream samples.' : `Energy / chat correlation: ${state.correlation.toFixed(2)} · association, not causation`);
  text('partner', state.crew[0] ? `Crew partner · ${state.crew[0].energy}% energy` : 'No crew connected');
  text('raid-phase', state.tagout.phase === 'raiding' ? 'Simulated countdown · waiting for raid event' : state.tagout.phase);
  hidden('combined', !state.combinedAlert); hidden('dismiss', !state.exposure.active);
  hidden('approve', !['suggested', 'tag-back'].includes(state.tagout.phase));
  text('approve', state.tagout.phase === 'tag-back' ? 'Partner: approve simulated tag back' : 'Approve simulated raid');
  hidden('cancel', !['suggested', 'confirming', 'raiding', 'tag-back'].includes(state.tagout.phase)); hidden('back', state.tagout.phase !== 'covered');
  const clues = element('clues');
  clues?.replaceChildren(...state.clues.map((clue) => { const li = document.createElement('li'); li.textContent = `${clue.description} · ${Math.round(clue.confidence * 100)}%`; return li; }));
  const timeline = element('timeline');
  timeline?.replaceChildren(...state.timeline.filter((entry) => entry.actions.length > 0).slice(-5).map((entry) => { const li = document.createElement('li'); li.textContent = `${Math.floor(entry.at / 60_000)}:00 · score ${entry.score} · ${entry.actions.join(' + ')} · SIMULATED`; return li; }));
  text('moderation', `${state.moderation.length} simulated guessing message(s) removed · IDs: ${state.moderation.map((entry) => entry.id).join(', ') || 'none'}`);
  chart(state);
}
async function refresh(): Promise<void> {
  try {
    const response = await fetch(page === 'overlay' ? '/api/overlay' : '/api/status');
    if (!response.ok) throw new Error('Unavailable');
    const state = await response.json() as Snapshot & { enabled?: boolean; phase?: string };
    hidden('simulated', !state.simulated);
    if (page === 'overlay') {
      hidden('hud-content', !state.enabled); meter('energy-meter', state.energy ?? 0); text('raid-phase', state.phase ?? '');
    } else {
      text('connection', state.simulated ? '● Demo session · accelerated time' : '● Local session · integrations disconnected');
      if (state.simulated && page === 'dashboard') {
        render(state);
        const scene = element('scene') as HTMLImageElement | null;
        if (scene) {
          const frameResponse = await fetch('/api/demo/frame');
          if (frameResponse.ok) { const frame = await frameResponse.json() as { image: string }; scene.src = frame.image; }
        }
      }
      hidden('error', true);
    }
  } catch { text('error', 'analysis unavailable · server disconnected'); hidden('error', false); text('connection', '● Disconnected'); }
}
void refresh();
setInterval(() => { void refresh(); }, 1_000);
