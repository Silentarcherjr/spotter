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
  console.log(`${data.level.toUpperCase()}${data.simulated ? ' · SIMULATED' : ''}`);
  for (const finding of data.findings) console.log(`- ${finding}`);
  if (data.level !== 'green') process.exitCode = 1;
} catch {
  console.log('AMBER\n- analysis unavailable');
  process.exitCode = 1;
}
