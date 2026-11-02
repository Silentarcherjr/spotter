import '../shared/style.css';
import './style.css';
import { animateNumber, relayMarkup, renderRelay } from '../shared/motion.ts';

interface PublicHud {
  enabled: boolean;
  simulated: boolean;
  energy?: number | null;
  phase?: string;
  returning?: boolean;
  coveringFor?: string | null;
  rally?: { meter: number; celebrating: boolean };
}
const recordedInput = new URLSearchParams(window.location.search).get('recorded') === '1';
const app = document.getElementById('app')!;
document.body.dataset.page = 'overlay';
app.innerHTML = `<strong class="badge" id="simulated" hidden>SIMULATED</strong><section id="hud-content" hidden><div class="hud-stamina"><header class="hud-title"><span class="brand-mark">S</span><span>SECOND WIND<small>STAMINA RESERVE</small></span><strong id="energy">—</strong></header><div class="game-bar" aria-hidden="true"><span id="stamina-fill"></span><i></i></div><meter class="accessible-meter" id="energy-meter" min="0" max="100" value="0" aria-label="Personal energy"></meter><div class="hud-rally"><span id="rally-label">RALLY</span><div class="rally-track"><span id="rally-fill"></span></div><b id="rally-value">0%</b></div></div><div class="hud-relay"><span class="eyebrow">TAG OUT / CREW LINK</span>${relayMarkup()}<p id="raid-phase" role="status">Stand by</p></div><div class="rally-celebration" id="celebration" hidden><b>RALLY!</b><span>YOUR COMMUNITY HAS YOUR BACK</span><i>✦</i></div></section>`;
const element = (id: string) => document.getElementById(id)!;
element('simulated').hidden = !recordedInput;
async function refresh(): Promise<void> {
  try {
    const response = await fetch('/api/overlay');
    if (!response.ok) throw new Error('Unavailable');
    const state = (await response.json()) as PublicHud;
    element('simulated').hidden = !(state.simulated || recordedInput);
    element('hud-content').hidden = !state.enabled;
    if (!state.enabled) return;
    const energy =
      typeof state.energy === 'number' && Number.isFinite(state.energy)
        ? Math.max(0, Math.min(100, state.energy))
        : null;
    animateNumber(element('energy'), energy);
    (element('energy-meter') as HTMLMeterElement).value = energy ?? 0;
    element('stamina-fill').style.width = `${energy ?? 0}%`;
    element('hud-content').dataset.energy =
      energy === null ? 'unavailable' : energy <= 30 ? 'low' : 'available';
    element('rally-fill').style.width = `${state.rally?.meter ?? 0}%`;
    element('rally-value').textContent = `${state.rally?.meter ?? 0}%`;
    element('celebration').hidden = !state.rally?.celebrating;
    element('rally-label').textContent = state.rally?.celebrating ? 'RALLY COMPLETE' : 'RALLY';
    renderRelay(app.querySelector('.relay-track'), state.phase ?? 'idle', state.returning);
    const labels: Record<string, string> = {
      idle: 'Crew link ready',
      suggested: 'Ready for a handoff',
      confirming: 'Requesting handoff…',
      raiding: 'Handoff in progress…',
      covered: 'Community received',
      'tag-back': 'Return handoff ready',
      home: 'Welcome home',
    };
    element('raid-phase').textContent = state.coveringFor
      ? `Covering for ${state.coveringFor}’s community`
      : (labels[state.phase ?? 'idle'] ?? 'Crew link ready');
  } catch {
    element('hud-content').hidden = true;
  }
}
void refresh();
setInterval(() => {
  void refresh();
}, 1000);
