import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFindability, decideExposure, dismissExposure, initialExposure } from '../src/core/exposure.ts';
import { calibrate, scoreEnergy } from '../src/core/energy.ts';
import { chatVelocity, correlation, advanceCombinedAlert } from '../src/core/chat.ts';
import { initialTagOut, transitionTagOut, choosePartner } from '../src/core/tagout.ts';
import type { Clue, AudioFeatures } from '../src/core/types.ts';

const clue = (category: Clue['category'], severity = 3, confidence = 1): Clue => ({ category, severity, confidence });
const audio = (at: number, rms = .2, pitchRange = 50, speechRate = 3): AudioFeatures => ({ at, rms, pitchMedian: 150, pitchRange, spectralSlope: -2, voicedRatio: .7, pauseLength: .2, speechRate });

test('findability combines distinct clues over frames and decays without mutating history', () => {
  const history = [{ at: 0, clues: [clue('storefront')] }];
  const original = structuredClone(history);
  const alone = scoreFindability([clue('transit')], [], 4_000);
  const combined = scoreFindability([clue('transit')], history, 4_000);
  assert.ok(combined > alone);
  assert.ok(scoreFindability([], history, 30_000) < scoreFindability([], history, 0));
  assert.equal(scoreFindability([], history, 121_000), 0);
  assert.deepEqual(history, original);
});

test('findability deduplicates categories, clamps, excludes future and invalid observations', () => {
  assert.equal(scoreFindability([clue('storefront'), clue('storefront')], [], 0), scoreFindability([clue('storefront')], [], 0));
  assert.equal(scoreFindability([clue('storefront', 5), clue('transit', 5), clue('reflection', 5)], [], 0), 100);
  assert.equal(scoreFindability([clue('transit', 5, Number.NaN)], [{ at: 20, clues: [clue('storefront')] }], 0), 0);
  assert.equal(scoreFindability([clue('transit', 9)], [], 0), 0);
});

test('exposure thresholds are inclusive; unavailable keeps score and never acts', () => {
  const warning = decideExposure(initialExposure(), 60);
  assert.deepEqual(warning.actions, ['warn']);
  const acting = decideExposure(warning.state, 80);
  assert.deepEqual(acting.actions, ['privacy', 'marker']);
  assert.deepEqual(decideExposure(acting.state, 90).actions, []);
  const missing = decideExposure(acting.state, null);
  assert.equal(missing.state.score, 80);
  assert.equal(missing.state.analysis, 'analysis unavailable');
  assert.deepEqual(missing.actions, []);
  assert.deepEqual(decideExposure(initialExposure(), Number.NaN).actions, []);
  const dismissed = dismissExposure(acting.state);
  assert.equal(dismissed.active, false);
  assert.deepEqual(decideExposure(dismissed, 100).actions, []);
  const recovered = decideExposure(dismissed, 10).state;
  assert.deepEqual(decideExposure(recovered, 80).actions, ['privacy', 'marker']);
  assert.throws(() => decideExposure(initialExposure(), 80, { warn: 90, act: 60 }));
});

test('energy calibrates against ten minutes of personal samples and smooths recent observations', () => {
  assert.equal(calibrate([audio(0), audio(500_000)], 500_000).baseline, null);
  const calibration = calibrate(Array.from({ length: 601 }, (_, index) => audio(index * 1000)), 600_000);
  assert.equal(calibration.progress, 1);
  assert.ok(calibration.baseline);
  const baseline = calibration.baseline;
  const normal = scoreEnergy([audio(610_000)], baseline, 610_000);
  const low = scoreEnergy([audio(610_000, .08, 10, .5)], baseline, 610_000);
  const smoothed = scoreEnergy([audio(600_000), audio(610_000, .08, 10, .5)], baseline, 610_000);
  assert.equal(normal, 75);
  assert.ok(low !== null && smoothed !== null && normal !== null && low < smoothed && smoothed < normal);
  assert.equal(scoreEnergy([audio(0)], baseline, 700_000), null);
  assert.equal(scoreEnergy([audio(610_000)], null, 610_000), null);
  assert.equal(scoreEnergy([audio(610_000, Number.NaN)], baseline, 610_000), null);
});

test('chat velocity deduplicates event IDs and measures unique chatters in a sliding minute', () => {
  assert.deepEqual(chatVelocity([
    { id: 'a', userId: 'one', at: 10_000 }, { id: 'a', userId: 'one', at: 10_000 },
    { id: 'b', userId: 'one', at: 20_000 }, { id: 'c', userId: 'two', at: 30_000 },
    { id: 'old', userId: 'three', at: 0 }, { id: 'future', userId: 'four', at: 90_000 },
  ], 65_000), { messagesPerMinute: 3, uniqueChattersPerMinute: 2 });
});

test('correlation requires paired nonconstant data and combined alerts require available readings', () => {
  assert.equal(correlation([{ energy: 10, chat: 10 }, { energy: 20, chat: 20 }]), null);
  assert.equal(correlation([{ energy: 10, chat: 10 }, { energy: 20, chat: 20 }, { energy: 30, chat: 30 }]), 1);
  assert.equal(correlation([{ energy: 10, chat: 1 }, { energy: 20, chat: 1 }, { energy: 30, chat: 1 }]), null);

});

const crew = [{ id: 'partner', live: true, energy: 90 }, { id: 'offline', live: false, energy: 100 }];
const context = { now: 200_000, broadcasterId: 'main', tokenOwnerId: 'main', sourceLive: true, crew, recentRaids: [] as number[] };
const step = (state: ReturnType<typeof initialTagOut>, event: Parameters<typeof transitionTagOut>[1], extra = {}) => transitionTagOut(state, event, { ...context, ...extra });

test('Tag Out selects a live partner after sustained low energy; no automatic raid', () => {
  assert.equal(choosePartner(crew)?.id, 'partner');
  const first = step(initialTagOut(), { type: 'energy', score: 20 });
  assert.equal(first.state.phase, 'idle');
  const second = step(first.state, { type: 'energy', score: 20 }, { now: 321_000 });
  assert.equal(second.state.phase, 'suggested');
  assert.deepEqual(second.actions, []);
  assert.equal(step(second.state, { type: 'raid_started' }).state.phase, 'suggested');
});

function suggested() {
  return step(step(initialTagOut(), { type: 'energy', score: 20 }).state, { type: 'energy', score: 20 }, { now: 321_000 }).state;
}

test('Tag Out requires approval, validates raid limits and confirms matching EventSub direction', () => {
  const suggestion = suggested();
  assert.deepEqual(step(suggestion, { type: 'approve' }, { tokenOwnerId: 'other' }).actions, []);
  assert.deepEqual(step(suggestion, { type: 'approve' }, { sourceLive: false }).actions, []);
  assert.deepEqual(step(suggestion, { type: 'approve' }, { crew: [] }).actions, []);
  assert.deepEqual(step(suggestion, { type: 'approve' }, { recentRaids: Array(10).fill(190_000) }).actions, []);
  const approved = step(suggestion, { type: 'approve' });
  assert.equal(approved.state.phase, 'confirming');
  assert.deepEqual(approved.actions, [{ type: 'start_raid', targetId: 'partner' }]);
  const raiding = step(approved.state, { type: 'raid_started' });
  assert.equal(raiding.state.phase, 'raiding');
  assert.deepEqual(step(raiding.state, { type: 'approve' }).actions, []);
  assert.equal(step(raiding.state, { type: 'raid_confirmed', fromId: 'stranger', toId: 'partner' }).state.phase, 'raiding');
  const covered = step(raiding.state, { type: 'raid_confirmed', fromId: 'main', toId: 'partner' });
  assert.equal(covered.state.phase, 'covered');
  const returning = step(covered.state, { type: 'request_back' });
  assert.equal(returning.state.phase, 'tag-back');
  assert.deepEqual(step(returning.state, { type: 'approve' }).actions, []);
  const partnerContext = { broadcasterId: 'partner', tokenOwnerId: 'partner', crew: [{ id: 'main', live: true, energy: 80 }] };
  const back = step(returning.state, { type: 'approve' }, partnerContext);
  assert.deepEqual(back.actions, [{ type: 'start_raid', targetId: 'main' }]);
  const home = step(back.state, { type: 'raid_confirmed', fromId: 'partner', toId: 'main' }, partnerContext);
  assert.equal(home.state.phase, 'home');
});

test('Tag Out supports cancellation and failure without stuck approval or accidental retry', () => {
  assert.equal(step(suggested(), { type: 'cancel' }).state.phase, 'idle');
  const pending = step(suggested(), { type: 'approve' }).state;
  const canceled = step(pending, { type: 'cancel' });
  assert.equal(canceled.state.phase, 'confirming');
  assert.deepEqual(canceled.actions, [{ type: 'cancel_raid' }]);
  assert.equal(step(canceled.state, { type: 'raid_cancelled' }).state.phase, 'idle');
  assert.deepEqual(step(canceled.state, { type: 'approve' }).actions, []);
  assert.equal(step(pending, { type: 'failed' }).state.phase, 'suggested');
});

test('moderation acts only on available high-confidence observations', async () => {
  const { decideModeration } = await import('../src/core/moderation.ts');
  assert.equal(decideModeration(null), 'none');
  assert.equal(decideModeration({ guessing: true, confidence: .79 }), 'none');
  assert.equal(decideModeration({ guessing: true, confidence: .95 }), 'delete');
  assert.equal(decideModeration({ guessing: false, confidence: 1 }), 'none');
});

test('receiving partner recognizes a configured incoming raid and home recognizes tag back', () => {
  const partnerContext = { broadcasterId: 'partner', tokenOwnerId: 'partner', sourceLive: true, crew: [{ id: 'main', live: true, energy: 20 }] };
  const receiving = step(initialTagOut(), { type: 'raid_confirmed', fromId: 'main', toId: 'partner' }, partnerContext);
  assert.equal(receiving.state.phase, 'covered');
  assert.equal(receiving.state.homeId, 'main');
  assert.equal(step(initialTagOut(), { type: 'raid_confirmed', fromId: 'unknown', toId: 'partner' }, partnerContext).state.phase, 'idle');
  const pending = step(suggested(), { type: 'approve' }).state;
  const covered = step(pending, { type: 'raid_confirmed', fromId: 'main', toId: 'partner' }).state;
  assert.equal(step(covered, { type: 'raid_confirmed', fromId: 'partner', toId: 'main' }).state.phase, 'home');
  const cancel = step(pending, { type: 'cancel' }).state;
  const retry = step(cancel, { type: 'cancel_failed' });
  assert.equal(retry.state.phase, 'confirming');
  assert.equal(retry.state.cancelPending, false);
  assert.deepEqual(step(retry.state, { type: 'cancel' }).actions, [{ type: 'cancel_raid' }]);
});

test('outbound relay revalidates partner energy before accepting approval', () => {
  const suggestion = suggested();
  assert.deepEqual(step(suggestion, { type: 'approve' }, { crew: [{ id: 'partner', live: true, energy: 10 }] }).actions, []);
});

test('combined alert requires thirty continuous seconds strictly below configurable threshold', () => {
  const step = (state: ReturnType<typeof advanceCombinedAlert> | null, now: number, energy: number | null, exposure = 80, available = true, threshold = 45) => advanceCombinedAlert(state, { now, energy, exposure, available, threshold });
  let state = step(null, 1000, 44);
  assert.equal(state.active, false);
  for (let now = 2000; now <= 30000; now += 1000) state = step(state, now, 44);
  assert.equal(state.active, false);
  state = step(state, 31000, 44); assert.equal(state.active, true);
  assert.equal(step(state, 32000, 45).active, false);
  assert.equal(step(state, 32000, 44, 59).active, false);
  assert.equal(step(state, 32000, 44, 80, false).active, false);
  assert.equal(step(state, 32000, null).belowSince, null);
  assert.equal(step(state, 32000, NaN).belowSince, null);
  assert.equal(step(state, 32000, 44, 80, true, 40).belowSince, null);
  assert.equal(step(state, 40000, 44).active, false); // Missing samples break continuity.
  assert.equal(step(state, 0, 44).active, false); // Clock reversal starts a fresh episode.
  assert.throws(() => step(state, 32000, 44, 80, true, NaN));
});

test('Tag Out defaults to strictly below45 for60s and resets on recovery or missing energy', () => {
  let state = initialTagOut();
  const update = (score: number | null, now: number) => { state = transitionTagOut(state, { type: 'energy', score }, { ...context, now }).state; };
  update(44, 0); update(44, 59_999); assert.equal(state.phase, 'idle');
  update(45, 60_000); assert.equal(state.lowSince, null);
  update(44, 61_000); update(null, 120_000); assert.equal(state.lowSince, null);
  update(44, 121_000); update(44, 181_000); assert.equal(state.phase, 'suggested');
});

test('Tag Out configurable energy and sustain policy preserves high-energy partner and approval gates', () => {
  const policy = { energyThreshold: 50, sustainMs: 90_000 };
  const start = transitionTagOut(initialTagOut(), { type: 'energy', score: 49 }, { ...context, now: 0, policy });
  assert.equal(transitionTagOut(start.state, { type: 'energy', score: 49 }, { ...context, now: 89_999, policy }).state.phase, 'idle');
  const suggested = transitionTagOut(start.state, { type: 'energy', score: 49 }, { ...context, now: 90_000, policy });
  assert.equal(suggested.state.phase, 'suggested'); assert.deepEqual(suggested.actions, []);
  assert.throws(() => transitionTagOut(initialTagOut(), { type: 'energy', score: 20 }, { ...context, policy: { energyThreshold: 101, sustainMs: 1000 } }));
});

test('manual relay request bypasses personal energy only and never starts a raid', () => {
  const requested = transitionTagOut(initialTagOut(), { type: 'request' }, context);
  assert.equal(requested.state.phase, 'suggested'); assert.deepEqual(requested.actions, []);
  assert.equal(transitionTagOut(initialTagOut(), { type: 'request' }, { ...context, sourceLive: false }).state.phase, 'idle');
  assert.equal(transitionTagOut(initialTagOut(), { type: 'request' }, { ...context, crew: [{ id: 'partner', live: true, energy: 59 }] }).state.phase, 'idle');
  const home = { ...initialTagOut(), phase: 'home' as const };
  assert.equal(transitionTagOut(home, { type: 'request' }, context).state.phase, 'suggested');
});

test('explicitly abandoning an offline owned relay resets to idle without fabricating home or raid actions', () => {
  const covered = { ...initialTagOut(), phase: 'covered' as const, homeId: 'main', partnerId: 'partner' };
  const offline = { ...context, sourceLive: false };
  const result = transitionTagOut(covered, { type: 'abandon' }, offline);
  assert.deepEqual(result.state, initialTagOut()); assert.deepEqual(result.actions, []);
  assert.equal(transitionTagOut(covered, { type: 'abandon' }, context).state.phase, 'covered');
  assert.equal(transitionTagOut(covered, { type: 'abandon' }, { ...offline, broadcasterId: 'stranger', tokenOwnerId: 'stranger' }).state.phase, 'covered');
  for (const phase of ['confirming', 'raiding'] as const) assert.equal(transitionTagOut({ ...covered, phase }, { type: 'abandon' }, offline).state.phase, phase);
});
