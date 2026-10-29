# Twitch fixture provenance — 2026-10-29

These files replace the former hand-written chat notification and add coverage for CLI event payloads. They contain no credentials or unredacted user identities.

| Fixture | Source | Meaning |
| --- | --- | --- |
| channel.raid.json | Twitch CLI 1.1.24 event trigger | Generated mock payload; not a live raid |
| stream.online.json | Twitch CLI 1.1.24 event trigger | Generated mock payload; not a live stream |
| stream.offline.json | Twitch CLI 1.1.24 event trigger | Generated mock payload; not a live stream |
| channel.chat.message.json | Controlled live EventSub chat observation | Real event structure, all identities and message text substituted |

Regenerate the three CLI payloads with `npm run twitch:fixtures`. This executes `twitch event trigger <type> --no-config` with fixture user IDs 100/200, fixed timestamps and fixture subscription IDs. Viewer counts and some generated IDs may vary. No CLI credentials, Twitch app credentials or live channel actions are needed. The CLI returns webhook-shaped subscription/event payloads; tests explicitly wrap them in WebSocket notification metadata to exercise Spotter's decoder. Handshake/reconnect/keepalive controls remain constructed test inputs.

The installed official CLI rejects `channel.chat.message` with `Invalid event`; that event is absent from its supported list. It would be incorrect to label the chat file as CLI generated. Instead, `npm run twitch:proof -- --capture-chat` subscribes to the authorized channel for 90 seconds and accepts only the exact controlled message printed by the command. It never stores other chat. `--send-test` additionally sends that one benign message from the authorized broadcaster to their own channel. This command uses credentials/tokens internally without displaying them. The resulting fixture keeps field structure/nulls/types, substitutes identity/text strings and conservatively redacts unknown strings. It is not a raw capture or a literal transcription. Ordinary runtime chat remains ephemeral.

Offline tests read these committed sanitized fixtures and never call real Twitch. `npm run twitch:proof` without flags checks the authorized public identity and scopes only. Production tokens remain in the ignored local SQLite database.

Official references: [Twitch CLI event command](https://dev.twitch.tv/docs/cli/event-command/), [EventSub chat message](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchatmessage).
