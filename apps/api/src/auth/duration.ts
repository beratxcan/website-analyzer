const UNIT_FACTORS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parses values like `15m`, `30d`, `500ms` into milliseconds. */
export function durationToMs(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: "${value}"`);
  }
  const amount = Number(match[1] ?? '');
  const unit = match[2] ?? 'ms';
  const factor = UNIT_FACTORS[unit];
  if (factor === undefined) {
    throw new Error(`Invalid duration unit: "${unit}"`);
  }
  return amount * factor;
}