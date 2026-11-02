import { prestreamExitCode } from '../src/core/prestream.ts';
const port = Number(process.env.PORT ?? 3210);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid port');
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/prestream`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error();
  const data = (await response.json()) as {
    level: string;
    findings: string[];
    simulated?: boolean;
  };
  const level = typeof data.level === 'string' ? data.level : 'unknown';
  console.log(`${level.toUpperCase()}${data.simulated ? ' · SIMULATED' : ''}`);
  for (const finding of data.findings) console.log(`- ${finding}`);
  process.exitCode = prestreamExitCode(level);
} catch {
  console.log('AMBER\n- analysis unavailable');
  process.exitCode = 0;
}
