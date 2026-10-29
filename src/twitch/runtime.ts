import type { DatabaseSync } from 'node:sqlite';
import { TwitchAuth } from './auth.ts';
import type { TwitchConfig } from './auth.ts';
import { Helix } from './helix.ts';
import { EventSubClient, subscriptions } from './eventsub.ts';
import type { TwitchNotification } from './eventsub.ts';
import { chatVelocity } from '../core/chat.ts';
import type { ChatActivity } from '../core/chat.ts';

export class TwitchRuntime {
  readonly auth: TwitchAuth;
  readonly helix: Helix;
  private client: EventSubClient | null = null;
  private validation: ReturnType<typeof setInterval> | undefined;
  private chats: ChatActivity[] = [];
  private online = false;
  private status = 'authorization required';
  private connected = false;
  private closed = false;
  private activityHandler: ((id: string, at: number, userId: string) => void) | null = null;
  setActivityHandler(handler: (id: string, at: number, userId: string) => void): void { this.activityHandler = handler; }
  private chatHandler: ((id: string, message: string, at: number) => Promise<void>) | null = null;
  setChatHandler(handler: (id: string, message: string, at: number) => Promise<void>): void { this.chatHandler = handler; }
  constructor(database: DatabaseSync, config: TwitchConfig) {
    this.auth = new TwitchAuth(database, config);
    this.helix = new Helix(config.clientId, () => this.auth.accessToken(), config.fetcher);
  }
  async start(): Promise<void> {
    this.stop(); this.closed = false;
    if (!this.auth.identity) return;
    try {
      await this.auth.validate();
      const id = this.auth.identity!.userId;
      const streams = await this.helix.streams(id);
      this.online = streams.data.some((stream) => stream.user_id === id && stream.type === 'live');
      if (this.closed) return;
      this.client = new EventSubClient({
        subscribe: async (session) => { await Promise.all(subscriptions(id, id).map((subscription) => this.helix.subscribe(session, subscription))); },
        onStatus: (status) => { this.status = status; this.connected = status === 'connected'; },
        onEvent: (event) => this.receive(event),
      });
      this.client.start();
      this.validation = setInterval(() => { void this.auth.validate().catch(() => { this.status = 'authorization unavailable'; this.client?.stop(); this.connected = false; }); }, 3_600_000);
      this.validation.unref();
    } catch { this.status = 'Twitch unavailable · reconnect authorization'; this.connected = false; }
  }
  // Store activity IDs only. Raw message text stays ephemeral and never reaches logs or the dashboard.
  receive(notification: TwitchNotification): void {
    const id = this.auth.identity?.userId;
    const event = notification.event;
    if (notification.type === 'channel.chat.message' && event.broadcaster_user_id === id && typeof event.message_id === 'string' && typeof event.chatter_user_id === 'string') {
      this.activityHandler?.(event.message_id, notification.at, event.chatter_user_id);
      const content = event.message as { text?: unknown } | undefined;
      if (typeof content?.text === 'string' && this.chatHandler) void this.chatHandler(event.message_id, content.text, notification.at).catch(() => {});
      this.chats = [...this.chats.filter((chat) => notification.at - chat.at <= 60_000), { id: event.message_id, userId: event.chatter_user_id, at: notification.at }].slice(-10_000);
    }
    if (notification.type === 'stream.online' && event.broadcaster_user_id === id) this.online = true;
    if (notification.type === 'stream.offline' && event.broadcaster_user_id === id) this.online = false;
  }
  snapshot(now = Date.now()) {
    return { configured: true, connected: this.connected, status: this.status, broadcasterId: this.auth.identity?.userId ?? null, live: this.connected ? this.online : null, chat: chatVelocity(this.chats, now) };
  }
  stop(): void { this.closed = true; clearInterval(this.validation); this.client?.stop(); this.client = null; this.connected = false; }
  disconnect(): void { this.stop(); this.auth.clear(); this.chats = []; this.status = 'authorization required'; }
}
