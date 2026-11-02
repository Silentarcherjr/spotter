export function distribution(values: readonly number[]) {
  if (values.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error('Invalid duration');
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    n,
    medianMs: n ? (sorted[Math.floor((n - 1) / 2)]! + sorted[Math.floor(n / 2)]!) / 2 : null,
    p95Ms: n ? sorted[Math.ceil(n * 0.95) - 1]! : null,
  };
}
export function confusion(rows: readonly { expected: boolean; predicted: boolean | null }[]) {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0,
    unavailable = 0;
  for (const row of rows) {
    if (row.predicted === null) unavailable++;
    else if (row.expected) {
      if (row.predicted) tp++;
      else fn++;
    } else if (row.predicted) fp++;
    else tn++;
  }
  return {
    tp,
    fp,
    fn,
    tn,
    unavailable,
    n: rows.length,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
  };
}
