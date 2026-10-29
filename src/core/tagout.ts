export interface Partner { id: string; live: boolean; energy: number }
export interface TagOutState {
  phase: 'idle' | 'suggested' | 'confirming' | 'raiding' | 'covered' | 'tag-back' | 'home';
  lowSince: number | null; homeId: string | null; partnerId: string | null; returning: boolean; cancelPending: boolean;
}
export type TagOutEvent = { type: 'energy'; score: number | null } | { type: 'raid_confirmed'; fromId: string; toId: string } | { type: 'approve' | 'raid_started' | 'request_back' | 'cancel' | 'raid_cancelled' | 'failed' };
export interface TagOutContext { now: number; broadcasterId: string; tokenOwnerId: string; sourceLive: boolean; crew: readonly Partner[]; recentRaids: readonly number[] }
export type RaidAction = { type: 'start_raid'; targetId: string } | { type: 'cancel_raid' };
export const initialTagOut = (): TagOutState => ({ phase: 'idle', lowSince: null, homeId: null, partnerId: null, returning: false, cancelPending: false });
export const choosePartner = (crew: readonly Partner[]): Partner | null => crew.filter((partner) => partner.live && Number.isFinite(partner.energy) && partner.energy >= 60).toSorted((a, b) => b.energy - a.energy || a.id.localeCompare(b.id))[0] ?? null;

export function transitionTagOut(previous: TagOutState, event: TagOutEvent, context: TagOutContext): { state: TagOutState; actions: RaidAction[] } {
  let state = { ...previous };
  const actions: RaidAction[] = [];
  const pending = state.phase === 'confirming' || state.phase === 'raiding';
  if (event.type === 'energy' && state.phase === 'idle') {
    if (event.score === null || !Number.isFinite(event.score) || event.score > 30) state.lowSince = null;
    else {
      state.lowSince ??= context.now;
      const partner = choosePartner(context.crew.filter((candidate) => candidate.id !== context.broadcasterId));
      if (context.now - state.lowSince >= 120_000 && partner && context.sourceLive) state = { ...state, phase: 'suggested', homeId: context.broadcasterId, partnerId: partner.id };
    }
  }
  if (event.type === 'request_back' && state.phase === 'covered') state.phase = 'tag-back';
  if (event.type === 'approve' && (state.phase === 'suggested' || state.phase === 'tag-back')) {
    const returning = state.phase === 'tag-back';
    const source = returning ? state.partnerId : state.homeId;
    const target = returning ? state.homeId : state.partnerId;
    const targetLive = context.crew.some((partner) => partner.id === target && partner.live);
    const recent = context.recentRaids.filter((at) => Number.isFinite(at) && at > context.now - 600_000 && at <= context.now);
    if (target && source === context.broadcasterId && source === context.tokenOwnerId && context.sourceLive && targetLive && recent.length < 10) {
      state = { ...state, phase: 'confirming', returning, cancelPending: false };
      actions.push({ type: 'start_raid', targetId: target });
    }
  }
  if (event.type === 'raid_started' && state.phase === 'confirming' && !state.cancelPending) state.phase = 'raiding';
  if (event.type === 'raid_confirmed' && pending) {
    const source = state.returning ? state.partnerId : state.homeId;
    const target = state.returning ? state.homeId : state.partnerId;
    if (event.fromId === source && event.toId === target) state = { ...state, phase: state.returning ? 'home' : 'covered', cancelPending: false };
  }
  if (event.type === 'cancel') {
    if (pending && !state.cancelPending) { state.cancelPending = true; actions.push({ type: 'cancel_raid' }); }
    else if (state.phase === 'suggested') state = initialTagOut();
    else if (state.phase === 'tag-back') state.phase = 'covered';
  }
  if (event.type === 'raid_cancelled' && pending) state = state.returning ? { ...state, phase: 'covered', cancelPending: false } : initialTagOut();
  if (event.type === 'failed' && pending) state = { ...state, phase: state.returning ? 'tag-back' : 'suggested', cancelPending: false };
  return { state, actions };
}
