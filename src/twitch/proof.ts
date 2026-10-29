import { DatabaseSync } from 'node:sqlite';
import { TwitchAuth } from './auth.ts';
import type { TwitchConfig } from './auth.ts';
import { Helix } from './helix.ts';
import { EventSubClient, subscriptions } from './eventsub.ts';

/** Preserve captured field structure while replacing all identity/text strings. */
export function redactChatFixture(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => redactChatFixture(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactChatFixture(item, name)]));
  if (typeof value !== 'string') return value;
  if (key === 'text') return 'Spotter fixture message';
  if (key.endsWith('user_id')) return key.startsWith('broadcaster') ? '100' : '200';
  if (key.endsWith('user_login')) return key.startsWith('broadcaster') ? 'fixturebroadcaster' : 'fixtureviewer';
  if (key.endsWith('user_name')) return key.startsWith('broadcaster') ? 'Fixture Broadcaster' : 'Fixture Viewer';
  if (key === 'message_id') return '00000000-0000-4000-8000-000000000001';
  if (key === 'type' && ['text', 'emote', 'cheermote', 'mention'].includes(value)) return value;
  if (key === 'message_type' && ['text', 'action', 'channel_points_highlighted', 'channel_points_sub_only'].includes(value)) return value;
  if (key === 'color' && /^#[0-9a-f]{6}$/i.test(value)) return value;
  return value === '' ? '' : '[redacted]';
}

export async function twitchProof(config: TwitchConfig, databasePath: string, capture: boolean, sendTest = false) {
  const db = new DatabaseSync(databasePath);
  let client: EventSubClient | undefined;
  try {
    const auth = new TwitchAuth(db, config);
    if (!auth.identity) throw new Error('Twitch authorization required');
    await auth.validate();
    const id = auth.identity!.userId;
    const helix = new Helix(config.clientId, () => auth.accessToken(), config.fetcher);
    const user = (await helix.users(id)).data[0];
    if (!user || user.id !== id) throw new Error('Twitch identity unavailable');
    if (!capture) return { login: user.login, displayName: user.display_name, scopes: auth.identity!.scopes };
    return await new Promise<{ event: unknown; type: string }>((resolve, reject) => {
      const timer = setTimeout(() => { client?.stop(); reject(new Error('Twitch controlled-chat capture timed out')); }, 90_000);
      client = new EventSubClient({
        subscribe: async (session) => { try { await helix.subscribe(session, subscriptions(id, id)[0]!); console.log('Capture ready: send Spotter prueba fixture in your channel.'); if (sendTest) await helix.sendChat(id, id, 'Spotter prueba fixture'); } catch { clearTimeout(timer); reject(new Error('Twitch capture subscription unavailable')); } },
        onStatus: () => {},
        onEvent: (notification) => {
          if (notification.type !== 'channel.chat.message' || notification.event.broadcaster_user_id !== id) return;
          const message = notification.event.message as { text?: unknown } | undefined;
          if (message?.text !== 'Spotter prueba fixture') return;
          clearTimeout(timer); resolve({ type: notification.type, event: redactChatFixture(notification.event) });
        },
      });
      client.start();
    });
  } finally { client?.stop(); db.close(); }
}

export async function readMarkerProof(config: TwitchConfig, databasePath: string) {
  const db = new DatabaseSync(databasePath);
  try {
    const auth = new TwitchAuth(db, config);
    if (!auth.identity) throw new Error('Twitch authorization required');
    const id = auth.identity.userId;
    const helix = new Helix(config.clientId, () => auth.accessToken(), config.fetcher);
    const result = await helix.request<{ data: { videos: { markers: { id: string; created_at: string; position_seconds: number; description: string }[] }[] }[] }>('GET', 'streams/markers', { user_id: id, first: '100' });
    return result.data.flatMap((entry) => entry.videos.flatMap((video) => video.markers.filter((marker) => marker.description === 'Spotter privacy alert').map((marker) => ({ id: marker.id, createdAt: marker.created_at, positionSeconds: marker.position_seconds }))));
  } finally { db.close(); }
}

/** Three user-authorized, harmless self-channel messages; never synthetic counters. */
export async function sendSecondWindChat(config: TwitchConfig, databasePath: string) {
  const db = new DatabaseSync(databasePath);
  try {
    const auth = new TwitchAuth(db, config);
    if (!auth.identity) throw new Error('Twitch authorization required');
    const id = auth.identity.userId;
    const helix = new Helix(config.clientId, () => auth.accessToken(), config.fetcher);
    const receipts: { at: number; id: string }[] = [];
    for (let index = 1; index <= 3; index++) {
      const result = await helix.sendChat(id, id, `Spotter Second Wind test ${index}/3`) as { data: { is_sent: boolean; message_id: string }[] };
      if (!result.data[0]?.is_sent) throw new Error('Controlled chat message not accepted');
      receipts.push({ at: Date.now(), id: result.data[0].message_id });
      console.log(JSON.stringify({ message: index, sent: true }));
      if (index < 3) await new Promise((resolve) => setTimeout(resolve, 20000));
    }
    return receipts;
  } finally { db.close(); }
}
