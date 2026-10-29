import { NumericAudioPipeline } from './pipeline.ts';

const start = document.getElementById('mic-start') as HTMLButtonElement;
const stopButton = document.getElementById('mic-stop') as HTMLButtonElement;
const fileStart = document.getElementById('file-start') as HTMLButtonElement;
const fileInput = document.getElementById('audio-file') as HTMLInputElement;
const monitor = document.getElementById('file-monitor') as HTMLInputElement;
const progress = document.getElementById('file-progress')!;
const status = document.getElementById('mic-status')!;
const numbers = document.getElementById('mic-features')!;
let context: AudioContext | null = null;
let stream: MediaStream | null = null;
let source: AudioBufferSourceNode | MediaStreamAudioSourceNode | null = null;
let socket: WebSocket | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let generation = 0;
let starting = false;
let running = false;
function stop(message = 'Stopped. No microphone is open.'): void {
  generation++; running = false; starting = false;
  clearInterval(timer);
  if (source instanceof AudioBufferSourceNode) { source.onended = null; try { source.stop(); } catch { /* Already ended. */ } }
  source?.disconnect(); source = null;
  stream?.getTracks().forEach((track) => track.stop()); stream = null;
  const connection = socket; socket = null; if (connection) { connection.onclose = null; connection.close(); }
  void context?.close(); context = null;
  start.disabled = false; fileInput.disabled = false; fileStart.disabled = !fileInput.files?.length; stopButton.disabled = true;
  status.textContent = message;
}
async function begin(kind: 'microphone' | 'file'): Promise<void> {
  if (starting || running) return;
  starting = true; const token = ++generation;
  start.disabled = true; fileInput.disabled = true; fileStart.disabled = true;
  try {
    const response = await fetch('/api/status');
    if ((await response.json() as { simulated: boolean }).simulated) throw new Error('Scripted demo mode already supplies numeric audio. Use normal npm run dev for file or microphone input.');
    if (token !== generation) return;
    context = new AudioContext(); await context.resume();
    const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
    const output = context.createGain(); output.gain.value = kind === 'file' && monitor.checked ? 1 : 0;
    analyser.connect(output); output.connect(context.destination);
    let duration = 0;
    if (kind === 'file') {
      const file = fileInput.files?.[0];
      if (!file) throw new Error('Choose a local audio file');
      if (file.size > 512 * 1024 * 1024) throw new Error('Use a file smaller than 512MB');
      const audio = await context.decodeAudioData(await file.arrayBuffer());
      if (token !== generation || !context) return;
      duration = audio.duration;
      const player = context.createBufferSource(); player.buffer = audio; source = player;
      player.onended = () => { if (token === generation) stop('SIMULATED file finished. Calibration is saved; select your next file.'); };
    } else {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (token !== generation || !context) { acquired.getTracks().forEach((track) => track.stop()); return; }
      stream = acquired; source = context.createMediaStreamSource(stream);
      for (const track of stream.getAudioTracks()) track.onended = () => stop();
    }
    source.connect(analyser);
    const pipeline = new NumericAudioPipeline(analyser, context.sampleRate);
    const connection = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/sensor?source=${kind}`);
    socket = connection;
    await new Promise<void>((resolve, reject) => { connection.onopen = () => resolve(); connection.onerror = () => reject(new Error('Sensor connection unavailable')); connection.onclose = () => reject(new Error('Sensor connection closed')); });
    if (token !== generation || !context) { connection.close(); return; }
    connection.onclose = () => stop('Server disconnected. Audio stopped; click Play or Enable to reconnect.');
    const began = context.currentTime;
    if (source instanceof AudioBufferSourceNode) source.start();
    running = true; stopButton.disabled = false; stopButton.textContent = 'Stop audio';
    timer = setInterval(() => {
      if (!context || context.state !== 'running' || connection.readyState !== WebSocket.OPEN) return;
      const elapsed = context.currentTime - began;
      const packet = pipeline.sample(elapsed * 1000, Date.now());
      if (kind === 'file') progress.textContent = `SIMULATED · ${elapsed.toFixed(1)} / ${duration.toFixed(1)} seconds · real-time playback`;
      if (!packet) return;
      // Both sources take this exact path. No PCM, file or audio buffer crosses the socket.
      connection.send(JSON.stringify(packet)); numbers.textContent = JSON.stringify(packet, null, 2);
      status.textContent = `${kind === 'file' ? 'SIMULATED file' : 'Microphone'} · numeric features sent · raw audio stays in this browser`;
    }, 25);
  } catch (error) { if (token === generation) stop(error instanceof Error ? error.message : 'Audio unavailable'); }
  finally { if (token === generation) starting = false; }
}
fileInput.addEventListener('change', () => { fileStart.disabled = !fileInput.files?.length; progress.textContent = fileInput.files?.[0] ? 'File selected locally. Click Play file; no audio upload occurs.' : 'No file selected'; });
start.addEventListener('click', () => { void begin('microphone'); });
fileStart.addEventListener('click', () => { void begin('file'); });
stopButton.addEventListener('click', () => stop());
window.addEventListener('pagehide', () => stop());
