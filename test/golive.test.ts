import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePrestream } from '../src/core/prestream.ts';
const clean = {
  privacy: true,
  unsafeCapture: false,
  privateBrowser: false,
  desktopAudio: false,
  cut: true,
  delay: true,
  qrEnabled: true,
  visionAvailable: true,
  qrAvailable: true,
  clues: [] as string[],
  qrDetected: false,
};
test('pre-stream returns green only when all checks are available and clear', () => {
  assert.equal(evaluatePrestream(clean).level, 'green');
  assert.equal(evaluatePrestream({ ...clean, visionAvailable: false }).level, 'amber');
  assert.ok(
    evaluatePrestream({ ...clean, visionAvailable: false }).findings.includes(
      'analysis unavailable',
    ),
  );
  assert.equal(evaluatePrestream({ ...clean, qrAvailable: false }).level, 'amber');
});
test('capture, private browser and missing Privacy are red; warnings and generic clues are amber', () => {
  for (const value of [{ unsafeCapture: true }, { privateBrowser: true }, { privacy: false }])
    assert.equal(evaluatePrestream({ ...clean, ...value }).level, 'red');
  for (const value of [
    { desktopAudio: true },
    { cut: false },
    { delay: false },
    { qrDetected: true },
    { clues: ['readable_document'] },
  ])
    assert.equal(evaluatePrestream({ ...clean, ...value }).level, 'amber');
  assert.equal(
    evaluatePrestream({ ...clean, qrEnabled: false, cut: false, delay: false }).level,
    'green',
  );
});
test('OBS inspection traverses enabled nested scenes and ignores disabled items', async () => {
  const { inspectPrestream } = await import('../src/obs/prestream.ts');
  const calls: string[] = [];
  const wire = {
    async call(n: string, a: Record<string, unknown> = {}) {
      calls.push(n);
      if (n === 'GetSceneList')
        return {
          scenes: [{ sceneName: 'Main' }, { sceneName: 'Nested' }, { sceneName: 'Privacy' }],
          currentProgramSceneName: 'Main',
        };
      if (n === 'GetSceneItemList')
        return {
          sceneItems:
            a.sceneName === 'Main'
              ? [
                  { sourceName: 'Nested', sceneItemEnabled: true },
                  { sourceName: 'Disabled', sceneItemEnabled: false },
                ]
              : a.sceneName === 'Nested'
                ? [{ sourceName: 'Window', sceneItemEnabled: true }]
                : [],
        };
      if (n === 'GetInputList')
        return {
          inputs: [
            { inputName: 'Window', inputKind: 'window_capture' },
            { inputName: 'Disabled', inputKind: 'screen_capture' },
          ],
        };
      if (n === 'GetCurrentSceneTransition') return { transitionKind: 'cut_transition' };
      if (n === 'GetSpecialInputs') return {};
      if (n === 'GetSourceFilterList')
        return {
          filters: [
            { filterKind: 'gpu_delay', filterEnabled: true, filterSettings: { delay_ms: 500 } },
          ],
        };
      throw Error(n);
    },
  };
  const result = await inspectPrestream(wire as never, true);
  assert.equal(result.unsafeCapture, true);
  assert.ok(calls.every((c) => c.startsWith('Get')));
});
test('pre-stream vision schema includes generic objects without location fields', async () => {
  const { prestreamSchema, parsePrestreamVision } = await import('../src/ai/prestream-contract.ts');
  for (const name of ['readable_document', 'package_label', 'street_view_window'])
    assert.ok(prestreamSchema.properties.clues.items.properties.category.enum.includes(name));
  assert.doesNotMatch(JSON.stringify(prestreamSchema), /coordinates|address|location/i);
  assert.deepEqual(
    parsePrestreamVision({
      clues: [
        {
          category: 'readable_document',
          description: 'Readable document',
          severity: 3,
          confidence: 0.8,
        },
      ],
    }),
    [{ description: 'Readable document', confidence: 0.8 }],
  );
});
test('pre-stream fails soft on missing observation and never sends QR frames to AI', async () => {
  const { runPrestream } = await import('../src/modules/prestream.ts');
  let calls = 0;
  const configuration = { ...clean, scene: 'Main' };
  const result = await runPrestream(
    {
      inspect: async () => configuration,
      capture: async () => Buffer.from('x'),
      detect: () => ({ detected: true }),
      vision: async () => {
        calls++;
        return [];
      },
    },
    true,
  );
  assert.equal(calls, 0);
  assert.equal(result.level, 'amber');
  assert.ok(result.findings.includes('QR code'));
  assert.ok(result.findings.includes('analysis unavailable'));
  const missing = await runPrestream(
    {
      inspect: async () => {
        throw Error('unavailable');
      },
      capture: async () => Buffer.from(''),
      detect: () => ({ detected: false }),
      vision: async () => [],
    },
    true,
  );
  assert.equal(missing.level, 'amber');
  assert.ok(missing.findings.includes('OBS inspection unavailable'));
});
test('inspection detects every capture type, private sources, audio and missing protections without exposing URLs', async () => {
  const { inspectPrestream } = await import('../src/obs/prestream.ts');
  for (const kind of [
    'screen_capture',
    'display_capture',
    'window_capture',
    'monitor_capture',
    'game_capture',
    'xshm_input',
    'pipewire-desktop-capture-source',
    'syphon-input',
  ]) {
    const wire = {
      async call(n: string) {
        if (n === 'GetSceneList')
          return { scenes: [{ sceneName: 'Main' }], currentProgramSceneName: 'Main' };
        if (n === 'GetSceneItemList')
          return {
            sceneItems: [
              { sourceName: 'Capture', sceneItemEnabled: true },
              { sourceName: 'Browser', sceneItemEnabled: true },
            ],
          };
        if (n === 'GetInputList')
          return {
            inputs: [
              { inputName: 'Capture', inputKind: kind },
              { inputName: 'Browser', inputKind: 'browser_source' },
            ],
          };
        if (n === 'GetInputSettings')
          return {
            inputSettings: { url: 'http://localhost:3210/api/private/frame?secret=do-not-expose' },
          };
        if (n === 'GetCurrentSceneTransition') return { transitionKind: 'fade_transition' };
        if (n === 'GetSpecialInputs') return { desktop1: 'Desktop' };
        if (n === 'GetInputMute') return { inputMuted: false };
        if (n === 'GetInputVolume') return { inputVolumeMul: 1 };
        if (n === 'GetSourceFilterList') return { filters: [] };
        throw Error(n);
      },
    };
    const value = await inspectPrestream(wire as never, true);
    assert.equal(value.unsafeCapture, true);
    assert.equal(value.privateBrowser, true);
    assert.equal(value.privacy, false);
    assert.equal(value.desktopAudio, true);
    assert.equal(value.cut, false);
    assert.equal(value.delay, false);
    assert.doesNotMatch(JSON.stringify(value), /secret|localhost/);
  }
});
test('disabled unsafe sources are ignored and group cycles terminate', async () => {
  const { inspectPrestream } = await import('../src/obs/prestream.ts');
  const wire = {
    async call(n: string) {
      if (n === 'GetSceneList')
        return {
          scenes: [{ sceneName: 'Main' }, { sceneName: 'Privacy' }],
          currentProgramSceneName: 'Main',
        };
      if (n === 'GetSceneItemList')
        return {
          sceneItems: [
            { sourceName: 'Group', sceneItemEnabled: true, isGroup: true },
            { sourceName: 'Window', sceneItemEnabled: false },
          ],
        };
      if (n === 'GetGroupSceneItemList')
        return { sceneItems: [{ sourceName: 'Group', sceneItemEnabled: true, isGroup: true }] };
      if (n === 'GetInputList')
        return { inputs: [{ inputName: 'Window', inputKind: 'window_capture' }] };
      if (n === 'GetCurrentSceneTransition') return { transitionKind: 'cut_transition' };
      if (n === 'GetSpecialInputs') return {};
      if (n === 'GetSourceFilterList') return { filters: [] };
      throw Error(n);
    },
  };
  const value = await inspectPrestream(wire as never, false);
  assert.equal(value.unsafeCapture, false);
  assert.equal(value.privacy, true);
});
test('private pre-stream endpoint fails soft in demo without contacting integrations', async () => {
  const { createApp } = await import('../src/app.ts');
  const app = createApp({ databasePath: ':memory:', simulated: true });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/prestream' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().level, 'amber');
    assert.equal(response.json().simulated, true);
    assert.ok(response.json().findings.includes('analysis unavailable'));
  } finally {
    await app.close();
  }
});
test('confidence threshold includes the boundary and amber permits a reviewed start', async () => {
  const { filterPrestreamClues, prestreamExitCode, parsePrestreamConfidence } =
    await import('../src/core/prestream.ts');
  const clues = [
    { description: 'Low', confidence: 0.7999 },
    { description: 'Boundary', confidence: 0.8 },
    { description: 'High', confidence: 0.9 },
  ];
  assert.deepEqual(filterPrestreamClues(clues, 0.8), ['Boundary', 'High']);
  assert.deepEqual(filterPrestreamClues(clues, 0.9), ['High']);
  assert.equal(parsePrestreamConfidence(undefined), 0.8);
  assert.throws(() => parsePrestreamConfidence('1.01'));
  assert.equal(prestreamExitCode('amber'), 0);
  assert.equal(prestreamExitCode('green'), 0);
  assert.equal(prestreamExitCode('red'), 1);
  assert.equal(prestreamExitCode('unknown'), 1);
});
test('pre-stream model is isolated from Off the Map and threshold controls output', async () => {
  const { createApp } = await import('../src/app.ts');
  const { PNG } = await import('pngjs');
  const png = new PNG({ width: 32, height: 18 });
  png.data.fill(255);
  const models: string[] = [];
  const wire = {
    on() {},
    async connect() {},
    async disconnect() {},
    async call(n: string) {
      if (n === 'GetSceneList')
        return {
          scenes: [{ sceneName: 'Main' }, { sceneName: 'Privacy' }],
          currentProgramSceneName: 'Main',
        };
      if (n === 'GetSceneItemList') return { sceneItems: [] };
      if (n === 'GetInputList') return { inputs: [] };
      if (n === 'GetCurrentSceneTransition') return { transitionKind: 'cut_transition' };
      if (n === 'GetSpecialInputs') return {};
      if (n === 'GetSourceScreenshot')
        return { imageData: 'data:image/png;base64,' + PNG.sync.write(png).toString('base64') };
      throw Error(n);
    },
  };
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    models.push(body.model);
    return new Response(
      JSON.stringify({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  clues: [
                    {
                      category: 'readable_document',
                      description: 'Readable document',
                      severity: 3,
                      confidence: 0.79,
                    },
                    {
                      category: 'package_label',
                      description: 'Mail or package label',
                      severity: 3,
                      confidence: 0.8,
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
      { status: 200 },
    );
  };
  const { parseQrConfig } = await import('../src/core/qr.ts');
  const app = createApp({
    databasePath: ':memory:',
    simulated: false,
    qr: parseQrConfig({ QR_GUARD: '0' }),
    obs: { url: 'ws://mock', password: '', privacyScene: 'Privacy' },
    obsWire: wire as never,
    ai: { key: 'fake', model: 'original', fetcher },
    prestreamModel: 'different',
    prestreamConfidence: 0.8,
  });
  try {
    await app.ready();
    const response = await app.inject({ method: 'POST', url: '/api/prestream' });
    assert.equal(response.json().level, 'amber');
    assert.deepEqual(response.json().findings, ['Mail or package label']);
    assert.deepEqual(models, ['different']);
  } finally {
    await app.close();
  }
});
