import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupObs, obsSetupNames } from '../src/obs/setup.ts';
import type { SetupWire } from '../src/obs/setup.ts';
import { updateObsEnv } from '../src/obs/setup-env.ts';

type Item = {
  sourceName: string;
  sceneItemId: number;
  sceneItemEnabled: boolean;
  transform?: Record<string, unknown>;
};
class FakeObs {
  scenes = new Map<string, Item[]>();
  inputs = new Map<string, { inputKind: string; inputSettings: Record<string, unknown> }>();
  calls: string[] = [];
  disconnected = false;
  nextId = 1;
  async connect() {
    this.calls.push('connect');
  }
  async disconnect() {
    this.disconnected = true;
  }
  item(sceneName: string, sceneItemId: number) {
    return this.scenes.get(sceneName)!.find((item) => item.sceneItemId === sceneItemId)!;
  }
  async call(request: string, data: Record<string, any> = {}): Promise<any> {
    this.calls.push(request);
    switch (request) {
      case 'GetInputKindList':
        return { inputKinds: ['browser_source', 'ffmpeg_source'] };
      case 'GetVideoSettings':
        return { baseWidth: 1280, baseHeight: 720 };
      case 'GetSceneList':
        return { scenes: [...this.scenes.keys()].map((sceneName) => ({ sceneName })) };
      case 'CreateScene':
        assert.ok(!this.scenes.has(data.sceneName));
        this.scenes.set(data.sceneName, []);
        return {};
      case 'GetInputList':
        return { inputs: [...this.inputs].map(([inputName, value]) => ({ inputName, ...value })) };
      case 'CreateInput':
        assert.ok(!this.inputs.has(data.inputName));
        this.inputs.set(data.inputName, {
          inputKind: data.inputKind,
          inputSettings: { ...data.inputSettings },
        });
        return this.call('CreateSceneItem', {
          sceneName: data.sceneName,
          sourceName: data.inputName,
        });
      case 'GetInputSettings':
        return this.inputs.get(data.inputName)!;
      case 'SetInputSettings':
        Object.assign(this.inputs.get(data.inputName)!.inputSettings, data.inputSettings);
        return {};
      case 'GetSceneItemList':
        return { sceneItems: this.scenes.get(data.sceneName)! };
      case 'CreateSceneItem': {
        const item = {
          sourceName: data.sourceName,
          sceneItemId: this.nextId++,
          sceneItemEnabled: true,
        };
        this.scenes.get(data.sceneName)!.push(item);
        return { sceneItemId: item.sceneItemId };
      }
      case 'SetSceneItemEnabled':
        this.item(data.sceneName, data.sceneItemId).sceneItemEnabled = data.sceneItemEnabled;
        return {};
      case 'SetSceneItemTransform':
        this.item(data.sceneName, data.sceneItemId).transform = data.sceneItemTransform;
        return {};
      case 'SetSceneItemIndex': {
        const items = this.scenes.get(data.sceneName)!;
        const index = items.findIndex((item) => item.sceneItemId === data.sceneItemId);
        items.splice(data.sceneItemIndex, 0, items.splice(index, 1)[0]!);
        return {};
      }
      default:
        throw new Error(`Unexpected request ${request}`);
    }
  }
}
const options = {
  url: 'ws://127.0.0.1:4455',
  password: 'fake-obs-password',
  videoPath: '/tmp/owned clip.mp4',
  webOrigin: 'http://127.0.0.1:5173',
};
const wire = (fake: FakeObs) => fake as unknown as SetupWire;

test('OBS setup creates looped media, shared 1080p overlay and opaque privacy screen; rerun creates no duplicates', async () => {
  const fake = new FakeObs();
  const first = await setupObs(options, wire(fake));
  assert.equal(first.createdScenes, 2);
  assert.equal(first.createdInputs, 3);
  assert.deepEqual([...fake.scenes.keys()], ['Main', 'Privacy']);
  assert.deepEqual(
    fake.scenes.get('Main')!.map((item) => item.sourceName),
    [obsSetupNames.media, obsSetupNames.overlay],
  );
  assert.deepEqual(
    fake.scenes.get('Privacy')!.map((item) => item.sourceName),
    [obsSetupNames.privacy, obsSetupNames.overlay],
  );
  assert.deepEqual(fake.inputs.get(obsSetupNames.media)!.inputSettings, {
    is_local_file: true,
    local_file: options.videoPath,
    looping: true,
    restart_on_activate: true,
    clear_on_media_end: false,
  });
  const overlay = fake.inputs.get(obsSetupNames.overlay)!.inputSettings;
  assert.equal(overlay.width, 1920);
  assert.equal(overlay.height, 1080);
  assert.equal(overlay.url, `${options.webOrigin}/overlay/?recorded=1`);
  assert.equal(
    fake.inputs.get(obsSetupNames.privacy)!.inputSettings.url,
    `${options.webOrigin}/privacy/`,
  );
  const snapshot = JSON.stringify([...fake.scenes]);
  const second = await setupObs(options, wire(fake));
  assert.equal(second.createdScenes, 0);
  assert.equal(second.createdInputs, 0);
  assert.equal(second.createdSceneItems, 0);
  assert.equal(JSON.stringify([...fake.scenes]), snapshot);
  assert.equal(fake.scenes.get('Privacy')![0]!.transform!.boundsWidth, 1280);
  assert.equal(fake.scenes.get('Privacy')![0]!.transform!.boundsType, 'OBS_BOUNDS_STRETCH');
  assert.ok(fake.disconnected);
  assert.ok(
    !fake.calls.some((call) =>
      /Filter|CurrentProgramScene|StartStream|StartRecord|Remove/.test(call),
    ),
  );
});

test('OBS setup repairs partial setup, reuses detached inputs and keeps unrelated sources below privacy backdrop', async () => {
  const fake = new FakeObs();
  await setupObs(options, wire(fake));
  fake.scenes
    .get('Privacy')!
    .unshift({ sourceName: 'Unrelated camera', sceneItemId: 99, sceneItemEnabled: true });
  fake.scenes.get('Main')!.splice(0, 1);
  fake.scenes.get('Privacy')!.at(-1)!.sceneItemEnabled = false;
  fake.inputs.get(obsSetupNames.media)!.inputSettings.looping = false;
  const result = await setupObs({ ...options, webOrigin: 'http://127.0.0.1:5190' }, wire(fake));
  assert.equal(result.createdInputs, 0);
  assert.equal(result.createdSceneItems, 1);
  assert.equal(fake.inputs.get(obsSetupNames.media)!.inputSettings.looping, true);
  assert.deepEqual(
    fake.scenes.get('Privacy')!.map((item) => item.sourceName),
    ['Unrelated camera', obsSetupNames.privacy, obsSetupNames.overlay],
  );
  assert.ok(fake.scenes.get('Privacy')!.every((item) => item.sceneItemEnabled));
  assert.match(String(fake.inputs.get(obsSetupNames.overlay)!.inputSettings.url), /:5190/);
});

test('OBS setup rejects incompatible source-name collisions before mutating scenes', async () => {
  const fake = new FakeObs();
  fake.inputs.set(obsSetupNames.overlay, { inputKind: 'video_capture', inputSettings: {} });
  await assert.rejects(setupObs(options, wire(fake)), /incompatible input/);
  assert.equal(fake.scenes.size, 0);
  assert.ok(fake.disconnected);
});

test('OBS setup sanitizes connection failures and disconnects without leaking credentials', async () => {
  const fake = new FakeObs();
  fake.connect = async () => {
    throw Object.assign(new Error(options.password), { code: 4009 });
  };
  await assert.rejects(setupObs(options, wire(fake)), (error: unknown) => {
    assert.match((error as Error).message, /OBS connection unavailable.*4009/);
    assert.doesNotMatch((error as Error).message, /fake-obs-password/);
    return true;
  });
  assert.ok(fake.disconnected);
});

test('OBS setup fails on missing browser support before creating anything', async () => {
  const fake = new FakeObs();
  const call = fake.call.bind(fake);
  fake.call = async (request, data) =>
    request === 'GetInputKindList' ? { inputKinds: ['ffmpeg_source'] } : call(request, data);
  await assert.rejects(setupObs(options, wire(fake)), /browser_source/);
  assert.equal(fake.scenes.size, 0);
});

test('OBS env updates preserve secret lines and unrelated settings, clear blur and normalize duplicate settings', () => {
  const before =
    '# local config\nOPENAI_API_KEY="fake-key-never-changed"\nOBS_WEBSOCKET_PASSWORD="fake-password"\nexport OBS_SOURCE=Old\nOBS_SOURCE=Duplicate\nOBS_BLUR_FILTER=Blur\nSIM=0\n';
  const after = updateObsEnv(before);
  assert.match(
    after,
    /OPENAI_API_KEY="fake-key-never-changed"\nOBS_WEBSOCKET_PASSWORD="fake-password"/,
  );
  assert.match(after, /SIM=0/);
  assert.match(after, /OBS_PRIVACY_SCENE="Privacy"/);
  assert.match(after, /OBS_SOURCE="Spotter IRL"/);
  assert.match(after, /OBS_BLUR_FILTER=""/);
  assert.equal((after.match(/^OBS_SOURCE=/gm) ?? []).length, 1);
  assert.equal(updateObsEnv(after), after);
});
