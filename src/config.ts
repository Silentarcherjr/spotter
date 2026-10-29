function integerSetting(value: string | number | undefined, fallback: number, min: number, max: number, name: string): number {
  const result = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`Invalid ${name}`);
  return result;
}
export const parseVisionFrameWidth = (value?: string | number): number => integerSetting(value, 1280, 128, 4096, 'VISION_FRAME_WIDTH');
export const parseAiTimeoutMs = (value?: string | number): number => integerSetting(value, 15_000, 1, 120_000, 'AI_TIMEOUT_MS');
export const parseEnergyAlertThreshold = (value?: string | number): number => integerSetting(value, 45, 1, 100, 'ENERGY_ALERT_THRESHOLD');
