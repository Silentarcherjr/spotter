import { mockVision, mockChatClassifier } from '../ai/mock.ts';
import { clueDescriptions } from '../ai/vision-contract.ts';
import { decideExposure, dismissExposure, initialExposure, scoreFindability } from '../core/exposure.ts';
import { calibrate, scoreEnergy } from '../core/energy.ts';
import { chatVelocity, advanceCombinedAlert, correlation } from '../core/chat.ts';
import { decideModeration } from '../core/moderation.ts';
import { initialTagOut, transitionTagOut } from '../core/tagout.ts';
import type { TagOutEvent } from '../core/tagout.ts';
import type { AudioFeatures, FrameObservation } from '../core/types.ts';
import { frameSource, voiceFeatures, syntheticChat, simulatedCrew } from './sources.ts';
import { createSimEvent } from './events.ts';
import { advanceRally, initialRally } from '../core/session.ts';

export class DemoSession {
  private energyHold: ReturnType<typeof advanceCombinedAlert> | null = null;
  private step = 0;
  private now = 600_000;
  private exposure = initialExposure();
  private tagout = initialTagOut();
  private frames: FrameObservation[] = [];
  private audio: AudioFeatures[] = [];
  private chats: ReturnType<typeof syntheticChat> = [];
  private crew: ReturnType<typeof simulatedCrew>;
  private events: { kind: string; simulated: true }[] = [];
  private moderation: { id: string; action: string; simulated: true }[] = [];
  private timeline: { at: number; score: number; actions: string[]; simulated: true }[] = [];
  private curves: { at: number; energy: number; chat: number }[] = [];
  private recentRaids: number[] = [];
  private energy: number | null = 75;
  private rally = initialRally();
  private baseline;
  private energyThreshold: number;
  constructor(enabled: boolean, energyThreshold = 45) {
    this.energyThreshold = energyThreshold;
    if (!enabled) throw new Error('Simulation requires SIM=1');
    this.crew = simulatedCrew(true);
    this.chats = syntheticChat(true, -1, this.now);
    this.events = [...this.chats];
    this.baseline = calibrate(Array.from({ length: 601 }, (_, index) => voiceFeatures(true, index * 1_000, false)), this.now).baseline;
  }
  private raid(event: TagOutEvent) {
    const returning = this.tagout.phase === 'tag-back' || this.tagout.returning;
    const sourceId = returning ? this.crew.id : 'main';
    const result = transitionTagOut(this.tagout, event, {
      now: this.now, broadcasterId: sourceId, tokenOwnerId: sourceId, sourceLive: true,
      crew: returning ? [{ id: 'main', live: true, energy: 80 }] : [this.crew], recentRaids: this.recentRaids,
    });
    this.tagout = result.state;
    for (const action of result.actions) {
      this.events.push(createSimEvent(true, action.type, { at: this.now }));
      if (action.type === 'start_raid') {
        this.recentRaids.push(this.now);
        this.tagout = transitionTagOut(this.tagout, { type: 'raid_started' }, { now: this.now, broadcasterId: sourceId, tokenOwnerId: sourceId, sourceLive: true, crew: [this.crew], recentRaids: this.recentRaids }).state;
      }
    }
    return result.actions;
  }
  tick(): void {
    this.now += 30_000;
    if (this.tagout.phase === 'raiding') this.raid({ type: 'raid_confirmed', fromId: this.tagout.returning ? this.crew.id : 'main', toId: this.tagout.returning ? 'main' : this.crew.id });
    const frame = frameSource(true, this.step, this.now);
    const clues = mockVision(frame.fixture);
    const score = scoreFindability(clues, this.frames, this.now);
    const decision = decideExposure(this.exposure, score);
    this.exposure = decision.state;
    this.frames = [...this.frames.filter((item) => this.now - item.at <= 120_000), { at: this.now, clues }];
    const audio = voiceFeatures(true, this.now, this.step >= 4);
    this.audio = [...this.audio.filter((item) => this.now - item.at <= 45_000), audio];
    this.energy = scoreEnergy(this.audio, this.baseline, this.now);
    const chat = syntheticChat(true, this.step, this.now);
    this.chats = [...this.chats.filter((item) => this.now - item.at < 60_000), ...chat];
    for (const message of chat) {
      this.rally = advanceRally(this.rally, message.id, this.now);
      const action = decideModeration(mockChatClassifier(message.fixture));
      if (action === 'delete') this.moderation.push({ id: message.id, action, simulated: true });
    }
    this.raid({ type: 'energy', score: this.energy });
    this.events = [...this.events, frame, audio, ...chat, this.crew].slice(-120);
    this.timeline = [...this.timeline, { at: this.now, score, actions: decision.actions, simulated: true as const }].slice(-120);
    this.curves = [...this.curves, { at: this.now, energy: this.energy ?? 0, chat: chatVelocity(this.chats, this.now).messagesPerMinute }].slice(-120);
    this.moderation = this.moderation.slice(-120);
    // Each scripted tick represents thirty seconds of continuous simulated input.
    for (let at = this.now - 29_000; at <= this.now; at += 1000) this.energyHold = advanceCombinedAlert(this.energyHold, { now: at, energy: this.energy, exposure: this.exposure.score, available: this.exposure.analysis === 'available', threshold: this.energyThreshold });
    this.step++;
  }
  approve(): void { this.raid({ type: 'approve' }); }
  requestBack(): void { this.raid({ type: 'request_back' }); }
  cancel(): void {
    const actions = this.raid({ type: 'cancel' });
    if (actions.some((action) => action.type === 'cancel_raid')) this.raid({ type: 'raid_cancelled' });
  }
  dismiss(): void { this.exposure = dismissExposure(this.exposure); }
  snapshot() {
    return structuredClone({
      simulated: true as const, at: this.now, step: this.step, analysis: this.exposure.analysis,
      exposure: this.exposure, energy: this.energy, calibration: 1,
      clues: (this.frames.at(-1)?.clues ?? []).map((clue) => ({ ...clue, description: clueDescriptions[clue.category] })),
      chat: chatVelocity(this.chats, this.now), correlation: correlation(this.curves),
      combinedAlert: this.energyHold?.active ?? false,
      rally: { meter: this.rally.meter, celebrating: this.now < this.rally.celebratingUntil }, crew: [this.crew], tagout: this.tagout, timeline: this.timeline, curves: this.curves,
      moderation: this.moderation, events: this.events,
    });
  }
}
