export function subscriptions(broadcasterId: string, userId: string) {
  return [
    {
      type: 'channel.chat.message',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId, user_id: userId },
    },
    { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: broadcasterId } },
    { type: 'channel.raid', version: '1', condition: { from_broadcaster_user_id: broadcasterId } },
    { type: 'stream.online', version: '1', condition: { broadcaster_user_id: broadcasterId } },
    { type: 'stream.offline', version: '1', condition: { broadcaster_user_id: broadcasterId } },
  ] as { type: string; version: string; condition: Record<string, string> }[];
}
export interface TwitchNotification {
  type: string;
  at: number;
  event: Record<string, unknown>;
}
interface Socket {
  addEventListener: EventTarget['addEventListener'];
  close(): void;
}
interface Options {
  subscribe: (session: string) => Promise<void>;
  onEvent: (event: TwitchNotification) => void;
  onStatus: (status: 'connected' | 'disconnected' | 'revoked') => void;
  createSocket?: (url: string) => Socket;
  now?: () => number;
}
export class EventSubClient {
  private options: Options;
  private current: Socket | null = null;
  private pending: Socket | null = null;
  private stopped = true;
  private lastReceived = 0;
  private keepalive = 10_000;
  private welcomed = false;
  private seen = new Map<string, number>();
  private retry: ReturnType<typeof setTimeout> | undefined;
  private watch: ReturnType<typeof setInterval> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;
  constructor(options: Options) {
    this.options = options;
  }
  private now() {
    return (this.options.now ?? Date.now)();
  }
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect('wss://eventsub.wss.twitch.tv/ws', false);
    this.watch = setInterval(() => this.checkHealth(), 1_000);
    this.watch.unref();
  }
  stop(): void {
    this.stopped = true;
    clearTimeout(this.retry);
    clearTimeout(this.deadline);
    clearInterval(this.watch);
    const sockets = [this.current, this.pending];
    this.current = null;
    this.pending = null;
    sockets.forEach((socket) => socket?.close());
  }
  private connect(url: string, migrating: boolean): void {
    if (this.stopped) return;
    let socket: Socket;
    try {
      socket = (this.options.createSocket ?? ((url) => new WebSocket(url)))(url);
    } catch {
      this.schedule();
      return;
    }
    if (migrating) this.pending = socket;
    else {
      this.current = socket;
      this.welcomed = false;
      this.lastReceived = this.now();
    }
    clearTimeout(this.deadline);
    this.deadline = setTimeout(
      () => {
        if (migrating && this.pending === socket) {
          this.pending = null;
          socket.close();
          this.disconnect();
        } else if (!this.welcomed) this.disconnect();
      },
      migrating ? 25_000 : 15_000,
    );
    this.deadline.unref();
    socket.addEventListener('message', (event) => {
      void this.receive(socket, (event as MessageEvent).data, migrating).catch(() =>
        this.disconnect(),
      );
    });
    socket.addEventListener('error', () => {
      if (socket === this.current || socket === this.pending) this.disconnect();
    });
    socket.addEventListener('close', () => {
      if (socket === this.current || socket === this.pending) this.disconnect();
    });
  }
  private async receive(socket: Socket, data: unknown, migrating: boolean): Promise<void> {
    if (socket !== this.current && socket !== this.pending) return;
    if (typeof data !== 'string' || data.length > 1_000_000) return;
    let message: {
      metadata?: { message_id?: string; message_type?: string; message_timestamp?: string };
      payload?: {
        session?: { id?: string; keepalive_timeout_seconds?: number; reconnect_url?: string };
        subscription?: { type?: string };
        event?: Record<string, unknown>;
      };
    };
    try {
      message = JSON.parse(data) as typeof message;
    } catch {
      return;
    }
    const type = message.metadata?.message_type;
    if (!type) return;
    const now = this.now();
    const id = message.metadata?.message_id;
    for (const [key, at] of this.seen) if (now - at > 600_000) this.seen.delete(key);
    if (id && this.seen.has(id)) return;
    if (id) {
      this.seen.set(id, now);
      if (this.seen.size > 10_000) this.seen.delete(this.seen.keys().next().value!);
    }
    this.lastReceived = now;
    if (type === 'session_welcome') {
      const session = message.payload?.session;
      if (!session?.id) return;
      if (migrating) {
        const old = this.current;
        this.current = socket;
        this.pending = null;
        old?.close();
      }
      this.welcomed = true;
      this.keepalive = Math.max(
        10_000,
        Math.min(600_000, (session.keepalive_timeout_seconds ?? 10) * 1_000),
      );
      clearTimeout(this.deadline);
      if (!migrating) await this.options.subscribe(session.id);
      if (this.stopped || socket !== this.current) return;
      this.retries = 0;
      this.options.onStatus('connected');
    } else if (type === 'session_reconnect') {
      const candidate = message.payload?.session?.reconnect_url;
      if (!candidate || this.pending) return;
      let target: URL;
      try {
        target = new URL(candidate);
      } catch {
        return;
      }
      if (
        target.protocol !== 'wss:' ||
        target.hostname !== 'eventsub.wss.twitch.tv' ||
        target.username ||
        target.password ||
        target.port
      )
        return;
      this.connect(candidate, true);
    } else if (
      type === 'notification' &&
      message.payload?.subscription?.type &&
      message.payload.event
    ) {
      const timestamp = Date.parse(message.metadata?.message_timestamp ?? '');
      this.options.onEvent({
        type: message.payload.subscription.type,
        at: Number.isFinite(timestamp) ? timestamp : now,
        event: message.payload.event,
      });
    } else if (type === 'revocation') this.options.onStatus('revoked');
  }
  checkHealth(): void {
    if (
      !this.stopped &&
      this.now() - this.lastReceived > (this.welcomed ? this.keepalive + 1_000 : 15_000)
    )
      this.disconnect();
  }
  private disconnect(): void {
    const sockets = [this.current, this.pending];
    this.current = null;
    this.pending = null;
    sockets.forEach((socket) => socket?.close());
    this.options.onStatus('disconnected');
    clearTimeout(this.deadline);
    this.schedule();
  }
  private schedule(): void {
    if (this.stopped || this.retry) return;
    this.retry = setTimeout(
      () => {
        this.retry = undefined;
        this.connect('wss://eventsub.wss.twitch.tv/ws', false);
      },
      Math.min(30_000, 1_000 * 2 ** this.retries++),
    );
    this.retry.unref();
  }
}
