import './style.css';
import { animateNumber, relayMarkup, renderRelay } from './motion.ts';
import type { DemoSession } from '../src/sim/session.ts';

type Snapshot = ReturnType<DemoSession['snapshot']>;
const app = document.querySelector<HTMLElement>('#app')!;
const page = window.location.pathname.split('/')[1] ?? 'dashboard';
document.body.dataset.page = page;
const badge = '<strong class="badge" id="simulated" hidden>SIMULATED</strong>';
const links = '<nav><a href="/dashboard/">Dashboard</a><a href="/dashboard/report.html">Report</a><a href="/sensor/">Sensor</a><a href="/overlay/" target="_blank">OBS overlay ↗</a></nav>';
if (page === 'dashboard') {
  app.innerHTML = `<header class="masthead"><a class="wordmark" href="/dashboard/"><span class="brand-mark">S</span>spotter<span class="dot">●</span></a>${links}<span class="private-pill">◉ PRIVATE CONTROL ROOM</span>${badge}</header>
    <section class="intro"><div><span class="eyebrow">THE PERSON BEHIND THE STREAM COMES FIRST.</span><h1>On your <em>six.</em></h1><p>You run the show. We watch your back.</p></div><div class="session-meta"><span id="connection" class="connection">Connecting…</span><div class="demo-controls"><a id="twitch-connect" href="/api/twitch/connect" hidden>Connect with Twitch ↗</a><button id="reset" class="secondary" hidden>↻ Replay demo</button></div></div></section>
    <div id="rally-alert" class="alert rally-alert" role="status" hidden><b>RALLY COMPLETE</b> Your community has your back.</div><p id="error" role="status" hidden></p><div id="combined" class="alert" role="alert" hidden><b>CHECK YOUR RESERVE</b> Low energy + high exposure. Consider moving or taking a break.</div>
    <section class="grid">
      <article class="card exposure-card"><div class="card-top"><span class="eyebrow">01 / OFF THE MAP</span><span class="mini-tag">PRIVATE SIGNAL</span></div><h2>Stay hard to find.</h2><div class="exposure-instrument"><div class="exposure-dial"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="dial-ticks" cx="110" cy="110" r="103"/><circle class="dial-track" cx="110" cy="110" r="87"/><circle id="exposure-ring" class="dial-value" cx="110" cy="110" r="87" pathLength="100"/></svg><div class="dial-label"><b id="exposure">—</b><span>EXPOSURE / 100</span></div><i class="radar-sweep"></i></div><div class="exposure-copy"><span class="signal-dot"></span><p id="analysis">analysis unavailable</p><span class="muted">Generic clues.<br>Never a location.</span><div class="privacy-state" id="privacy-state" hidden><span>◈</span> PRIVACY ACTIVE</div></div></div><meter class="accessible-meter" id="exposure-meter" min="0" max="100" value="0" aria-label="Private exposure score"></meter><div class="chips-title"><span class="eyebrow">CLUE STACK</span><span class="muted">visible evidence only</span></div><ul id="clues" class="clue-chips" aria-label="Generic identifying clues"></ul><button id="dismiss" class="secondary" hidden>Dismiss privacy action ↗</button><div class="privacy-flash" id="privacy-flash" aria-hidden="true"><span>◈</span><b>PRIVACY<br>ENGAGED</b></div></article>
      <article class="card stamina-card"><div class="card-top"><span class="eyebrow">02 / SECOND WIND</span><span class="mini-tag">PERSONAL BASELINE</span></div><h2>Keep some in the tank.</h2><div class="stamina-readout"><b id="energy">—</b><span>%<small>STAMINA RESERVE</small></span><i class="power-icon">ϟ</i></div><div class="game-bar" aria-hidden="true"><span id="stamina-fill"></span><i></i></div><meter class="accessible-meter" id="energy-meter" min="0" max="100" value="0" aria-label="Personal energy"></meter><div class="rally-header"><span>✦ COMMUNITY RALLY</span><b id="rally-value">0%</b></div><div class="rally-track"><span id="rally-fill"></span></div><p id="calibration" class="muted">Waiting for numeric audio features</p><p id="chat">Chat activity unavailable</p><p id="correlation" class="muted">Correlation needs paired stream samples.</p><button id="recalibrate" class="secondary" hidden>Recalibrate personal baseline</button></article>
      <article class="card crew-card"><div class="card-top"><span class="eyebrow">03 / TAG OUT</span><span class="mini-tag">CREW LINK</span></div><h2>Nobody streams alone.</h2>${relayMarkup()}<div class="relay-phase"><span class="signal-dot"></span><p id="raid-phase">idle</p></div><h3 id="partner">No crew connected</h3><p id="relay-status" class="muted"></p><div class="actions"><button id="request-relay" class="secondary">Pedir relevo</button><button id="approve" hidden>Approve simulated raid ↗</button><button id="cancel" class="secondary" hidden>Cancel raid</button><button id="back" hidden>Request tag back ↗</button></div><p class="muted approval-note">ONE CLICK. YOUR CALL.<br>Every raid needs its broadcaster’s approval.</p></article>
    </section>
    <section class="lower"><article id="scene-panel" class="card scene-card" hidden><div class="card-top"><span class="eyebrow">FRAME MONITOR</span><span class="mini-tag">SIMULATED / MOCK VISION</span></div><div class="scene-window"><img id="scene" alt="Demo frame fixture"/><div class="scene-corners" aria-hidden="true"></div><div class="scene-shield"><span>◈</span><b>FRAME SHIELDED</b><small>PRIVACY CONTROL ACTIVE</small></div></div><p class="muted">Illustrative fixture. Mock clues follow the script; no model interprets these pixels.</p></article><article class="card chart-card"><div class="card-top"><span class="eyebrow">SESSION TELEMETRY</span><span class="mini-tag">ENERGY × COMMUNITY</span></div><h2>Find your second wind.</h2><svg id="curves" viewBox="0 0 600 150" role="img" aria-label="Energy and chat activity over time"><path d="M0 140H600 M0 80H600 M0 20H600" stroke="#ffffff12" fill="none"/></svg><p class="legend"><span>● Energy</span><span>● Chat, scaled to session peak</span></p></article><article class="card replay-card"><span class="eyebrow">EXPOSURE REPLAY / PRIVATE</span><h2>What raised the signal.</h2><ol id="timeline"></ol><p id="moderation" class="muted">No moderated messages.</p></article></section>
    <section id="terms-panel" class="card" hidden><span class="eyebrow">PRIVATE CHAT GUARD</span><h2>Blocked terms, without the guesswork.</h2><form id="terms-form"><label>Private sensitive term <input id="term" required minlength="2" maxlength="500" autocomplete="off"></label><button>Add to Twitch blocked terms</button></form><ul id="terms"></ul><p>Terms go to Twitch and are not saved in Spotter. Keep the returned ID to remove a term later.</p></section><footer><label class="hud-toggle"><input type="checkbox" id="hud"><span>Public stamina HUD</span><small>OPT IN</small></label><p>YOUR DATA. YOUR CONTROL. <span>Frames aren’t saved · audio stays local · no location output</span></p></footer>`;
} else {
  app.innerHTML = `<header><a class="wordmark" href="/dashboard/">spotter<span class="dot">●</span></a>${links}${badge}</header><article class="card"><span class="eyebrow">LOCAL AUDIO SENSOR</span><h1>Your voice stays here.</h1><p>Raw audio stays in this browser. Only numeric features are sent to the local server. Demo mode keeps the microphone closed.</p><button id="mic-start">Enable local microphone</button> <button id="mic-stop" class="secondary" disabled>Stop microphone</button><p id="mic-status" role="status">Stopped. No microphone is open.</p><pre id="mic-features"></pre><hr><h2>Local audio file <span class="badge">SIMULATED</span></h2><p>The file uses the microphone extractor. Audio stays in this browser; only numeric features are sent. Calibrate with your 10–12 minute reference, then play the demo.</p><input type="file" id="audio-file" accept="audio/*"><button id="file-start" disabled>Play file</button><label><input id="file-monitor" type="checkbox"> Hear file locally</label><p id="file-progress">No file selected</p><p id="error" role="status"></p></article>`;
}
if (page === 'sensor') void import('../sensor/main.ts');
const element = (id: string) => document.getElementById(id);
const text = (id: string, value: string) => { const target = element(id); if (target) target.textContent = value; };
const hidden = (id: string, value: boolean) => { const target = element(id); if (target) target.hidden = value; };
const meter = (id: string, value: number) => { const target = element(id) as HTMLMeterElement | null; if (target) target.value = value; };
let busy = false;
let isSimulated = false;
async function post(path: string, payload?: unknown, method = 'POST'): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const response = await fetch(path, { method, ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) });
    if (!response.ok) throw new Error('Action unavailable');
    await refresh();
  } catch { text('error', 'Action unavailable. Try again.'); hidden('error', false); }
  finally { busy = false; }
}
for (const [id, action] of [['request-relay', 'request'], ['approve', 'approve'], ['cancel', 'cancel'], ['back', 'requestBack'], ['dismiss', 'dismiss'], ['reset', 'reset']]) {
  if (id && action) element(id)?.addEventListener('click', () => { void post(isSimulated ? `/api/demo/${action}` : action === 'dismiss' ? '/api/privacy/dismiss' : `/api/relay/${action}`); });
}
element('recalibrate')?.addEventListener('click', () => { void post('/api/calibration/reset'); });
element('hud')?.addEventListener('change', (event) => { void post('/api/hud', { enabled: (event.target as HTMLInputElement).checked }); });
element('terms-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = element('term') as HTMLInputElement;
  try {
    const response = await fetch('/api/terms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ term: input.value }) });
    if (!response.ok) throw new Error('Unavailable');
    const value = await response.json() as { id: string };
    input.value = '';
    const li = document.createElement('li'); li.textContent = `Blocked term ID: ${value.id} `;
    const remove = document.createElement('button'); remove.textContent = 'Remove term';
    remove.addEventListener('click', async () => {
      const response = await fetch(`/api/terms/${encodeURIComponent(value.id)}`, { method: 'DELETE' });
      if (response.ok) li.remove(); else { text('error', 'Term removal unavailable'); hidden('error', false); }
    });
    li.append(remove); element('terms')?.append(li);
  } catch { text('error', 'Blocked term unavailable. Check Twitch authorization.'); hidden('error', false); }
});
function chart(state: Snapshot): void {
  const svg = element('curves');
  if (!svg) return;
  svg.querySelectorAll('polyline').forEach((line) => line.remove());
  const peak = Math.max(1, ...state.curves.map((point) => point.chat));
  for (const metric of ['energy', 'chat'] as const) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', state.curves.map((point, index) => `${index / Math.max(1, state.curves.length - 1) * 600},${140 - (metric === 'energy' ? point.energy / 100 : point.chat / peak) * 120}`).join(' '));
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', metric === 'energy' ? '#c5ff6b' : '#b5a0ff'); line.setAttribute('stroke-width', '3');
    svg.append(line);
  }
}
function render(state: Snapshot): void {
  hidden('reset', !state.simulated);
  hidden('scene-panel', !state.simulated);
  hidden('terms-panel', state.simulated);
  hidden('recalibrate', state.simulated);
  const scene = element('scene');
  if (scene) scene.style.filter = state.exposure.active ? 'blur(15px) saturate(.3)' : 'none';
  animateNumber(element('exposure'), state.exposure.score);
  const ring = element('exposure-ring');
  if (ring) ring.style.strokeDashoffset = String(100 - state.exposure.score); meter('exposure-meter', state.exposure.score);
  animateNumber(element('energy'), state.energy);
  const fill = element('stamina-fill');
  if (fill) fill.style.width = `${state.energy ?? 0}%`;
  document.body.dataset.energy = state.energy === null ? 'unavailable' : state.energy <= 30 ? 'low' : 'available';
  const rally = element('rally-fill');
  if (rally) rally.style.width = `${state.rally?.meter ?? 0}%`;
  text('rally-value', `${state.rally?.meter ?? 0}%`);
  renderRelay(app.querySelector('.relay-track'), state.tagout.phase, state.tagout.returning);
  const privacy = state.simulated ? state.exposure.active : !!(state as unknown as { privacyActive: boolean }).privacyActive;
  hidden('privacy-state', !privacy);
  if (document.body.dataset.privacy !== String(privacy)) {
    document.body.dataset.privacy = String(privacy);
    if (privacy && !matchMedia('(prefers-reduced-motion: reduce)').matches) element('privacy-flash')?.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)', offset: .2 }, { opacity: 1, offset: .7 }, { opacity: 0 }], { duration: 1600, easing: 'ease-out' });
  } meter('energy-meter', state.energy ?? 0);
  text('analysis', state.analysis !== 'available' ? 'analysis unavailable' : state.exposure.active ? state.simulated ? 'Privacy action active · simulated' : (state as unknown as { actionStatus: string }).actionStatus : state.exposure.score < 60 ? 'no obvious clues detected' : 'Identifying clues detected');
  text('calibration', state.simulated ? 'Simulated personal baseline · accelerated time' : `${(state as unknown as { audioSimulated?: boolean }).audioSimulated ? 'SIMULATED file · ' : ''}Personal baseline: ${Math.round(state.calibration * 100)}% · ${(state as unknown as { sensorStatus: string }).sensorStatus ?? 'sensor unavailable'}`);
  text('chat', `${state.chat.messagesPerMinute} messages/min · ${state.chat.uniqueChattersPerMinute} unique chatters/min`);
  text('correlation', state.correlation === null ? 'Correlation needs paired stream samples.' : `Energy / chat correlation: ${state.correlation.toFixed(2)} · association, not causation`);
  const partner = state.crew.find((peer) => peer.id === state.tagout.partnerId) ?? state.crew.toSorted((a, b) => b.energy - a.energy)[0];
  text('partner', partner ? `${state.simulated ? 'Crew partner' : partner.id} · ${partner.energy}% energy` : 'No crew connected');
  text('relay-status', state.simulated ? 'Scripted partner · SIMULATED' : (state as unknown as { status?: string }).status ?? '');
  text('raid-phase', state.tagout.phase === 'raiding' ? state.simulated ? 'Simulated countdown · waiting for raid event' : `${(state as unknown as { countdownSeconds: number }).countdownSeconds}s · waiting for Twitch raid event` : state.tagout.phase);
  hidden('rally-alert', !state.rally?.celebrating);
  hidden('combined', !state.combinedAlert); hidden('dismiss', !state.exposure.active && !(state as unknown as { privacyActive?: boolean }).privacyActive);
  hidden('request-relay', !['idle', 'home'].includes(state.tagout.phase));
  hidden('approve', !['suggested', 'tag-back'].includes(state.tagout.phase) || (!state.simulated && !(state as unknown as { canApprove: boolean }).canApprove));
  text('approve', state.tagout.phase === 'tag-back' ? state.simulated ? 'Partner: approve simulated tag back' : 'Approve tag back from this channel' : state.simulated ? 'Approve simulated raid' : 'Approve raid from this channel');
  hidden('cancel', !['suggested', 'confirming', 'raiding', 'tag-back'].includes(state.tagout.phase)); hidden('back', state.tagout.phase !== 'covered' || (!state.simulated && !(state as unknown as { coveringFor: string | null }).coveringFor));
  const clues = element('clues');
  if (clues) {
    const keys = new Set(state.clues.map((clue) => clue.category));
    for (const child of clues.querySelectorAll<HTMLElement>('[data-clue]')) if (!keys.has(child.dataset.clue as Snapshot['clues'][number]['category'])) child.remove();
    for (const [index, clue] of state.clues.entries()) {
      let chip = clues.querySelector<HTMLElement>(`[data-clue="${clue.category}"]`);
      if (!chip) {
        chip = document.createElement('li'); chip.dataset.clue = clue.category; chip.style.animationDelay = `${index * 90}ms`;
        const icon = document.createElement('i'); icon.textContent = '⌁';
        const label = document.createElement('span'); label.textContent = clue.description;
        const confidence = document.createElement('b'); chip.append(icon, label, confidence); clues.append(chip);
      }
      chip.querySelector('b')!.textContent = `${Math.round(clue.confidence * 100)}%`;
    }
  }
  const timeline = element('timeline');
  timeline?.replaceChildren(...state.timeline.filter((entry) => entry.actions.length > 0).slice(-5).map((entry) => { const li = document.createElement('li'); li.textContent = `${state.simulated ? `${Math.floor(entry.at / 60_000)}:00` : new Date(entry.at).toLocaleTimeString()} · score ${entry.score} · ${entry.actions.join(' + ')}${state.simulated ? ' · SIMULATED' : ''}`; return li; }));
  text('moderation', `${state.moderation.length} ${state.simulated ? 'simulated ' : ''}moderation record(s) · IDs: ${state.moderation.map((entry) => entry.id).join(', ') || 'none'}`);
  chart(state);
}
async function refresh(): Promise<void> {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('Unavailable');
    const state = await response.json() as Snapshot & { enabled?: boolean; phase?: string; coveringFor?: string | null; hudEnabled?: boolean };
    isSimulated = state.simulated;
    const hud = element('hud') as HTMLInputElement | null;
    if (hud && !busy) hud.checked = state.hudEnabled ?? false;
    hidden('simulated', !(state.simulated || (state as unknown as { audioSimulated?: boolean }).audioSimulated));
    {
      text('connection', state.simulated ? '● Demo session · accelerated time' : '● Local session · integrations disconnected');
      hidden('twitch-connect', state.simulated);
      if (!state.simulated && page === 'dashboard') {
        render(state);
        const live = state as unknown as { twitch: { connected: boolean; status: string }; chat: { messagesPerMinute: number; uniqueChattersPerMinute: number } };
        text('connection', `● Twitch: ${live.twitch.status}`);
        text('chat', live.twitch.connected ? `${live.chat.messagesPerMinute} messages/min · ${live.chat.uniqueChattersPerMinute} unique chatters/min` : 'Chat activity unavailable');
      }
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
