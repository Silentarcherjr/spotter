import { FeatureWindow } from './features.ts';

const start = document.getElementById('mic-start') as HTMLButtonElement;
const stopButton = document.getElementById('mic-stop') as HTMLButtonElement;
const status = document.getElementById('mic-status')!;
const numbers = document.getElementById('mic-features')!;
let context: AudioContext | null = null;
let stream: MediaStream | null = null;
let socket: WebSocket | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let starting = false;
function stop(): void {
  clearInterval(timer);
  stream?.getTracks().forEach((track) => track.stop()); stream = null;
  const connection = socket; socket = null; connection?.close();
  void context?.close(); context = null;
  start.disabled = false; stopButton.disabled = true;
  status.textContent = 'Stopped. No microphone is open.';
}
start.addEventListener('click', async () => {
  if (starting || stream) return;
  starting = true; start.disabled = true;
  try {
    const response = await fetch('/api/status');
    if ((await response.json() as { simulated: boolean }).simulated) throw new Error('Demo mode uses simulated numeric audio. Microphone stays closed.');
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    context = new AudioContext(); await context.resume();
    const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
    context.createMediaStreamSource(stream).connect(analyser);
    const timeData = new Float32Array(analyser.fftSize); const frequencyData = new Float32Array(analyser.frequencyBinCount);
    const features = new FeatureWindow(analyser.fftSize, context.sampleRate);
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/sensor`);
    await new Promise<void>((resolve, reject) => { const connection = socket!; connection.onopen = () => resolve(); connection.onerror = () => reject(new Error('Sensor connection unavailable')); connection.onclose = () => reject(new Error('Sensor connection closed')); });
    socket.onclose = () => { stop(); status.textContent = 'Server disconnected. Microphone stopped; click Enable to reconnect.'; };
    for (const track of stream.getAudioTracks()) track.onended = () => stop();
    let lastWindow = performance.now();
    timer = setInterval(() => {
      if (!context || context.state !== 'running' || !socket || socket.readyState !== WebSocket.OPEN) return;
      analyser.getFloatTimeDomainData(timeData); analyser.getFloatFrequencyData(frequencyData);
      const now = performance.now(); features.push(timeData, frequencyData, now);
      if (now - lastWindow >= 1000) {
        lastWindow = now;
        const packet = features.flush(Date.now());
        if (!packet) { status.textContent = 'Sensor paused or throttled. Keep this page active.'; return; }
        // Only this closed object of numeric features leaves the sensor. No PCM/recording path exists.
        socket.send(JSON.stringify(packet));
        numbers.textContent = JSON.stringify(packet, null, 2);
        status.textContent = 'Numeric features sent · raw audio stays in this browser';
      }
    }, 25);
    stopButton.disabled = false;
  } catch (error) { stop(); status.textContent = error instanceof Error ? error.message : 'Microphone unavailable'; }
  finally { starting = false; }
});
stopButton.addEventListener('click', stop);
window.addEventListener('pagehide', stop);
