import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { decideModeration } from '../src/core/moderation.ts';
import { ChatGuard } from '../src/modules/offthemap/chat-guard.ts';
import { parseChatAutoDelete } from '../src/config.ts';
test('moderation defaults to flag with unchanged confidence, deletion requires explicit policy', () => {
  const observation = { guessing: true, confidence: 0.95 };
  assert.equal(decideModeration(observation), 'flag');
  assert.equal(decideModeration(observation, { autoDelete: true }), 'delete');
  for (const confidence of [0.79, NaN, Infinity, -1, 1.1])
    assert.equal(decideModeration({ guessing: true, confidence }), 'none');
  assert.equal(decideModeration(null, { autoDelete: true }), 'none');
  assert.equal(decideModeration({ guessing: false, confidence: 1 }), 'none');
  assert.equal(parseChatAutoDelete(), false);
  assert.equal(parseChatAutoDelete('1'), true);
  assert.equal(parseChatAutoDelete('0'), false);
  assert.throws(() => parseChatAutoDelete('yes'));
});
test('default Chat Guard flags once, notifies mods and never removes or retains text', async () => {
  const db = new DatabaseSync(':memory:');
  let notices = 0;
  let removals = 0;
  const guard = new ChatGuard(db, {
    classify: async () => ({ guessing: true, confidence: 0.95 }),
    remove: async () => {
      removals++;
    },
    notify: async () => {
      notices++;
    },
  });
  try {
    await guard.check('test-message', 'untrusted private text', 1);
    await guard.check('test-message', 'untrusted private text', 2);
    assert.equal(removals, 0);
    assert.equal(notices, 1);
    assert.equal(guard.snapshot().entries[0]?.action, 'flag');
    assert.doesNotMatch(JSON.stringify(guard.snapshot()), /untrusted private text/);
  } finally {
    db.close();
  }
});
test('opt-in deletes with audit; failed notifications remain visible without deleting by default', async () => {
  for (const autoDelete of [false, true]) {
    const db = new DatabaseSync(':memory:');
    let removals = 0;
    const guard = new ChatGuard(
      db,
      {
        classify: async () => ({ guessing: true, confidence: 1 }),
        remove: async () => {
          removals++;
        },
        notify: async () => {
          throw Error('notice failed');
        },
      },
      { autoDelete },
    );
    try {
      await guard.check('test-message', 'test-only', 1);
      assert.equal(removals, autoDelete ? 1 : 0);
      assert.equal(guard.snapshot().status, 'mod notice unavailable');
      assert.equal(guard.snapshot().entries[0]?.action, autoDelete ? 'delete' : 'flag');
    } finally {
      db.close();
    }
  }
});
