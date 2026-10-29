import { spawn } from 'node:child_process';

const simulated = process.argv.includes('--demo');
const env = { ...process.env, ...(simulated ? { SIM: '1' } : {}) };
const children = [
  spawn(process.execPath, ['--experimental-strip-types', '--env-file-if-exists=.env', 'src/server.ts'], { env, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { env, stdio: 'inherit' }),
];
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => { console.error(error.message); close(1); });
  child.on('exit', (code) => close(code ?? 1));
}
process.on('SIGINT', () => close());
process.on('SIGTERM', () => close());
