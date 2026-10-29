import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { redactChatFixture } from '../src/twitch/proof.ts';
import { DatabaseSync } from 'node:sqlite';
import { TwitchAuth } from '../src/twitch/auth.ts';
import { Helix } from '../src/twitch/helix.ts';
import { EventSubClient, subscriptions } from '../src/twitch/eventsub.ts';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('OAuth state is expiring and single-use; tokens remain in local SQLite; refresh is single-flight', async () => {
  const db = new DatabaseSync(':memory:');
  let refreshes = 0;
  const calls: URL[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url);
    if (url.pathname.endsWith('/validate')) return json({ user_id: '100', client_id: 'client', scopes: ['user:read:chat'], expires_in: 3600 });
    const body = new URLSearchParams(init?.body as string);
    if (body.get('grant_type') === 'refresh_token') refreshes++;
    return json({ access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600, scope: ['user:read:chat'] });
  };
  const auth = new TwitchAuth(db, { clientId: 'client', clientSecret: 'fake-secret', redirectUri: 'http://localhost:3210/api/twitch/callback', fetcher });
  try {
    const url = new URL(auth.authorizeUrl(0));
    assert.equal(url.hostname, 'id.twitch.tv');
    assert.equal(url.searchParams.get('response_type'), 'code');
    await assert.rejects(auth.exchange('code', 'wrong-state', 1));
    await auth.exchange('code', url.searchParams.get('state')!, 1);
    await assert.rejects(auth.exchange('code', url.searchParams.get('state')!, 2));
    assert.equal(auth.identity?.userId, '100');
    await Promise.all([auth.refresh(), auth.refresh(), auth.refresh()]);
    assert.equal(refreshes, 1);
    assert.equal(await auth.accessToken(), 'fake-access');
    assert.ok(calls.every((url) => url.protocol === 'https:'));
    const expired = new URL(auth.authorizeUrl(0));
    await assert.rejects(auth.exchange('code', expired.searchParams.get('state')!, 600_001));
  } finally { db.close(); }
});

test('Helix uses fetch with correct body/query and never turns missing message ID into clear-all', async () => {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (url, init) => { calls.push({ url: new URL(String(url)), init }); return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ data: [] }); };
  const helix = new Helix('client', async () => 'fake-access', fetcher);
  await helix.sendChat('100', '100', 'test message');
  await helix.marker('100');
  await helix.addBlockedTerm('100', '100', 'test-only phrase');
  await helix.removeBlockedTerm('100', '100', 'term-id');
  await helix.deleteMessage('100', '100', 'message-id');
  assert.throws(() => helix.deleteMessage('100', '100', ''));
  await helix.startRaid('100', 'partner');
  await helix.cancelRaid('100');
  assert.equal(calls[4]?.url.searchParams.get('message_id'), 'message-id');
  assert.equal(calls[5]?.url.searchParams.get('to_broadcaster_id'), 'partner');
  assert.equal(calls[6]?.init?.method, 'DELETE');
  assert.ok(calls.every((call) => new Headers(call.init?.headers).get('Authorization') === 'Bearer fake-access'));
  const failing = new Helix('client', async () => 'fake-access', async () => json({ message: 'private detail' }, 429));
  await assert.rejects(failing.marker('100'), (error: unknown) => error instanceof Error && !error.message.includes('private detail') && error.message.includes('429'));
});

class Socket extends EventTarget {
  closed = false;
  close() { this.closed = true; this.dispatchEvent(new Event('close')); }
  message(value: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
}
const welcome = (id: string) => ({ metadata: { message_id: `welcome-${id}`, message_type: 'session_welcome' }, payload: { session: { id, keepalive_timeout_seconds: 10 } } });
const fixture = async (name: string) => JSON.parse(await readFile(new URL(`./fixtures/twitch/${name}.json`, import.meta.url), 'utf8'));
const chatFixture = await fixture('channel.chat.message');
const notification = { metadata: { message_id: 'chat-event', message_type: 'notification', subscription_type: chatFixture.type }, payload: { subscription: { type: chatFixture.type }, event: chatFixture.event } };
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test('EventSub immediately subscribes, dedupes and migrates reconnects without resubscribing', async () => {
  const sockets: Socket[] = [];
  const urls: string[] = [];
  const sessions: string[] = [];
  const events: unknown[] = [];
  const client = new EventSubClient({
    subscribe: async (session) => { sessions.push(session); },
    onEvent: (event) => { events.push(event); },
    onStatus: () => {},
    createSocket: (url) => { urls.push(url); const socket = new Socket(); sockets.push(socket); return socket; },
  });
  client.start();
  sockets[0]!.message(welcome('one')); await settle();
  assert.deepEqual(sessions, ['one']);
  sockets[0]!.message(notification); sockets[0]!.message(notification); await settle();
  assert.equal(events.length, 1);
  sockets[0]!.message({ metadata: { message_id: 'reconnect', message_type: 'session_reconnect' }, payload: { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?session=next' } } });
  sockets[1]!.message(welcome('two')); await settle();
  assert.deepEqual(sessions, ['one']);
  assert.equal(sockets[0]!.closed, true);
  assert.equal(urls.length, 2);
  assert.equal(subscriptions('100', '100').length, 5);
  assert.equal(subscriptions('100', '100').filter((subscription) => subscription.type === 'channel.raid').length, 2);
  client.stop();
});

test('EventSub rejects foreign reconnect URLs and recovers after keepalive timeout', async () => {
  let now = 0;
  const sockets: Socket[] = [];
  const statuses: string[] = [];
  const client = new EventSubClient({ subscribe: async () => {}, onEvent: () => {}, onStatus: (status) => { statuses.push(status); }, now: () => now,
    createSocket: () => { const socket = new Socket(); sockets.push(socket); return socket; },
  });
  client.start(); sockets[0]!.message(welcome('one')); await settle();
  sockets[0]!.message({ metadata: { message_id: 'bad', message_type: 'session_reconnect' }, payload: { session: { reconnect_url: 'wss://untrusted.example/ws' } } });
  assert.equal(sockets.length, 1);
  now = 12_000;
  client.checkHealth();
  assert.equal(sockets[0]!.closed, true);
  assert.ok(statuses.includes('disconnected'));
  client.stop();
});

test('live runtime reduces chat to IDs and aggregates without retaining message text', async () => {
  const { TwitchRuntime } = await import('../src/twitch/runtime.ts');
  const db = new DatabaseSync(':memory:');
  const runtime = new TwitchRuntime(db, { clientId: 'client', clientSecret: 'fake-secret', redirectUri: 'http://localhost/callback' });
  try {
    // Authorize through a mocked exchange so the runtime has a verified channel identity.
    const auth = runtime.auth;
    const configFetcher: typeof fetch = async (input) => String(input).endsWith('/validate') ? json({ client_id: 'client', user_id: '100', scopes: ['user:read:chat'] }) : json({ access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600 });
    const authWithMock = new TwitchAuth(db, { clientId: 'client', clientSecret: 'fake-secret', redirectUri: 'http://localhost/callback', fetcher: configFetcher });
    const url = new URL(authWithMock.authorizeUrl());
    await authWithMock.exchange('code', url.searchParams.get('state')!);
    const ready = new TwitchRuntime(db, { clientId: 'client', clientSecret: 'fake-secret', redirectUri: 'http://localhost/callback' });
    ready.receive({ type: 'channel.chat.message', at: 1_000, event: notification.payload.event });
    ready.receive({ type: 'channel.chat.message', at: 1_000, event: notification.payload.event });
    assert.equal(ready.snapshot(1_001).chat.messagesPerMinute, 1);
    assert.ok(!JSON.stringify(ready.snapshot()).includes('Spotter fixture message'));
    ready.disconnect();
    assert.equal(ready.snapshot(1_001).chat.messagesPerMinute, 0);
    assert.equal(auth.identity, null);
  } finally { runtime.stop(); db.close(); }
});

test('CLI-generated raid and online/offline payloads pass through the WebSocket decoder', async () => {
  const socket = new Socket(); const events: { type: string; event: Record<string, unknown> }[] = [];
  const client = new EventSubClient({ subscribe: async () => {}, onStatus: () => {}, onEvent: (event) => { events.push(event); }, createSocket: () => socket });
  try {
    client.start(); socket.message(welcome('cli-fixtures')); await settle();
    for (const type of ['channel.raid', 'stream.online', 'stream.offline']) {
      const payload = await fixture(type);
      socket.message({ metadata: { message_id: `cli-${type}`, message_type: 'notification', message_timestamp: payload.subscription.created_at }, payload });
    }
    await settle();
    assert.deepEqual(events.map((event) => event.type), ['channel.raid', 'stream.online', 'stream.offline']);
    assert.equal(events[0]!.event.from_broadcaster_user_id, '200');
    assert.equal(events[0]!.event.to_broadcaster_user_id, '100');
    assert.equal(events[1]!.event.type, 'live');
    assert.equal(events[2]!.event.broadcaster_user_id, '100');
  } finally { client.stop(); }
});

test('captured chat fixture redaction preserves structure and never retains raw identity/text strings', () => {
  const captured = { broadcaster_user_id: 'private-id', broadcaster_user_login: 'private-login', chatter_user_name: 'private-name', message_id: 'private-message-id', message: { text: 'private message', fragments: [{ type: 'text', text: 'private message', mention: null }] }, extra: 'private-extra', reply: null };
  const redacted = redactChatFixture(captured) as typeof captured;
  assert.deepEqual(Object.keys(redacted), Object.keys(captured));
  assert.doesNotMatch(JSON.stringify(redacted), /private/);
  assert.equal(redacted.broadcaster_user_id, '100');
  assert.equal(redacted.message.fragments[0]!.type, 'text');
  assert.equal(redacted.message.text, 'Spotter fixture message');
  assert.equal(redacted.reply, null);
});
