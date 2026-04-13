const PREC = 1e6;
const round = (v: number) => Math.round(v * PREC);

export interface ZMatrixResult {
  zMatrix: number[][];
  slowAxis: number[];
  fastAxis: number[];
}

/**
 * Reconstruct a 2D z-matrix and axis arrays from flat column data.
 * slowMotor values become rows (sorted ascending), fastMotor values become columns.
 * Missing points are filled with NaN. Floating-point positions are rounded to 1e-6
 * precision before uniqueness comparison to avoid spurious duplicates.
 *
 * When `shape` is provided (from start.shape in Bluesky metadata), range-based
 * binning is used for both motors. For the fast motor, if a `_user_setpoint` or
 * `_setpoint` column exists in `data`, setpoint values are used for binning rather
 * than noisy encoder readings. In boustrophedon fly-scans the encoder lags the
 * setpoint by up to ~half a column width on rows immediately following a turnaround,
 * which is enough to shift data into the wrong column bin. Setpoints are exact so
 * binning against them eliminates this systematic error. When no setpoint column is
 * available, a robust range estimator (kRows-th percentile) is used to tolerate any
 * fly-scan turnaround triggers that land outside the intended setpoint range.
 */
export function buildZMatrix(
  data: Record<string, number[]>,
  zField: string,
  slowMotor: string,
  fastMotor: string,
  shape?: [number, number] | null,
): ZMatrixResult | null {
  const zFlat = data[zField];
  const m1Flat = data[slowMotor];
  const m2Flat = data[fastMotor];
  if (!zFlat || !m1Flat || !m2Flat) return null;

  // Cap n to the shortest of the three core arrays. During a live scan, columns can flush
  // at different rates and arrive with mismatched lengths; accessing beyond the shortest
  // gives undefined, which propagates to NaN indices and crashes sums[ri][ci].
  const n = Math.min(zFlat.length, m1Flat.length, m2Flat.length);

  if (shape && shape[0] > 0 && shape[1] > 0) {
    // Shape-constrained path: bin motor positions into exactly shape[0] × shape[1] cells.
    // Range-based rounding handles jitter where encoder readings differ from setpoints.
    const nR = shape[0];
    const nC = shape[1];

    let m1Min = Infinity, m1Max = -Infinity;
    for (let k = 0; k < n; k++) {
      if (m1Flat[k] < m1Min) m1Min = m1Flat[k];
      if (m1Flat[k] > m1Max) m1Max = m1Flat[k];
    }

    let m1Span = m1Max - m1Min || 1;

    // Partial-scan correction: when n < nR*nC, [m1Min, m1Max] covers only the completed
    // rows, not the full grid. Range-based binning then stretches those few rows across
    // nR slots (e.g., rows 0,1,2 of a 21-row scan land at matrix rows 20, 10, 0 instead
    // of 20, 19, 18). Fix: estimate the per-row step from the partial span, then
    // extrapolate the full expected range. Scan direction (increasing vs. decreasing motor)
    // is inferred from the first acquired data point.
    // Math.ceil: a partially-collected row still occupies a distinct slow-motor position,
    // so it must count as a row for the span estimate (Math.round would undercount by 1
    // whenever n/nC is non-integer, collapsing two rows into one matrix cell).
    const kRows = n < nR * nC ? Math.max(1, Math.ceil(n / nC)) : nR;
    if (n < nR * nC && nR > 1) {
      if (kRows >= 2) {
        const fullSpan = (m1Max - m1Min) / (kRows - 1) * (nR - 1);
        const isIncreasing = m1Flat[0] <= (m1Min + m1Max) / 2;
        if (isIncreasing) {
          // m1Min is the scan start; the far end of the range hasn't been reached yet.
          m1Span = fullSpan;
        } else {
          // m1Max is the scan start; shift m1Min to the extrapolated full minimum.
          m1Min = m1Max - fullSpan;
          m1Span = fullSpan;
        }
      }
    }

    // Fast motor: prefer setpoint values for binning over noisy encoder readings.
    // In boustrophedon fly-scans the encoder lags the setpoint by up to ~half a column
    // width on rows that immediately follow a turnaround; that lag shifts data into the
    // wrong bin. Setpoints are exact so binning against them is always correct.
    const m2SpKey = (`${fastMotor}_user_setpoint` in data)
      ? `${fastMotor}_user_setpoint`
      : (`${fastMotor}_setpoint` in data ? `${fastMotor}_setpoint` : null);
    const m2ForBin: number[] = (m2SpKey ? data[m2SpKey] : null) ?? m2Flat;
    const loopN = Math.min(n, m2ForBin.length); // setpoint column may be shorter than encoder

    // When setpoints are available the range is exact and needs no outlier trimming.
    // When falling back to encoder readings, use the kRows-th percentile to tolerate
    // fly-scan turnaround triggers that land slightly outside the intended range.
    const m2Sorted = [...m2ForBin].sort((a, b) => a - b);
    const skip = (!m2SpKey && n >= nR * nC) ? Math.max(0, kRows - 1) : 0;
    const m2Min = m2Sorted[Math.min(skip, loopN - 1)];
    const m2Max = m2Sorted[Math.max(0, loopN - 1 - skip)];
    const m2Span = m2Max - m2Min || 1;

    const sums:   number[][] = Array.from({ length: nR }, () => new Array(nC).fill(0));
    const counts: number[][] = Array.from({ length: nR }, () => new Array(nC).fill(0));
    for (let k = 0; k < loopN; k++) {
      const ri = nR === 1 ? 0 : Math.min(nR - 1, Math.max(0, Math.round(((m1Flat[k] - m1Min) / m1Span) * (nR - 1))));
      const ci = nC === 1 ? 0 : Math.min(nC - 1, Math.max(0, Math.round(((m2ForBin[k] - m2Min) / m2Span) * (nC - 1))));
      sums[ri][ci]   += zFlat[k];
      counts[ri][ci] += 1;
    }
    const rows = sums.map((row, ri) =>
      row.map((s, ci) => counts[ri][ci] > 0 ? s / counts[ri][ci] : NaN)
    );

    const slowAxis = Array.from({ length: nR }, (_, i) => m1Min + (i / Math.max(1, nR - 1)) * m1Span);
    const fastAxis = Array.from({ length: nC }, (_, i) => m2Min + (i / Math.max(1, nC - 1)) * m2Span);
    return { zMatrix: rows, slowAxis, fastAxis };
  }

  // Original path: find unique positions via Set + rounding.
  const m1Unique = [...new Set(m1Flat.map(round))].sort((a, b) => a - b);
  const m2Unique = [...new Set(m2Flat.map(round))].sort((a, b) => a - b);
  const m1Idx = new Map(m1Unique.map((v, i) => [v, i]));
  const m2Idx = new Map(m2Unique.map((v, i) => [v, i]));
  const nR = m1Unique.length;
  const nC = m2Unique.length;
  const rows: number[][] = Array.from({ length: nR }, () => new Array(nC).fill(NaN));
  for (let k = 0; k < n; k++) {
    const ri = m1Idx.get(round(m1Flat[k]));
    const ci = m2Idx.get(round(m2Flat[k]));
    if (ri !== undefined && ci !== undefined) rows[ri][ci] = zFlat[k];
  }
  return {
    zMatrix: rows,
    slowAxis: m1Unique.map(v => v / PREC),
    fastAxis: m2Unique.map(v => v / PREC),
  };
}

/** Min and max of all finite values in a 2D matrix. */
export function matrixRange(mat: number[][]): { min: number; max: number } {
  let mn = Infinity, mx = -Infinity;
  for (const row of mat) for (const v of row) {
    if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
  }
  return { min: mn, max: mx };
}
