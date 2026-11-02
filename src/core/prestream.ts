export interface PrestreamInput {
  privacy: boolean;
  unsafeCapture: boolean;
  privateBrowser: boolean;
  desktopAudio: boolean;
  cut: boolean;
  delay: boolean;
  qrEnabled: boolean;
  visionAvailable: boolean;
  qrAvailable: boolean;
  clues: readonly string[];
  qrDetected: boolean;
}
export function evaluatePrestream(input: PrestreamInput): {
  level: 'red' | 'amber' | 'green';
  findings: string[];
} {
  const red: string[] = [],
    amber: string[] = [];
  if (!input.privacy) red.push('Privacy scene missing');
  if (input.unsafeCapture) red.push('screen or window capture');
  if (input.privateBrowser) red.push('private browser source');
  if (input.desktopAudio) amber.push('desktop audio enabled');
  if (input.qrEnabled && !input.cut) amber.push('transition is not Cut');
  if (input.qrEnabled && !input.delay) amber.push('Render Delay missing');
  if (!input.visionAvailable) amber.push('analysis unavailable');
  if (!input.qrAvailable) amber.push('QR analysis unavailable');
  if (input.qrDetected) amber.push('QR code');
  for (const clue of input.clues) if (!amber.includes(clue)) amber.push(clue);
  return {
    level: red.length ? 'red' : amber.length ? 'amber' : 'green',
    findings: [...red, ...amber],
  };
}
