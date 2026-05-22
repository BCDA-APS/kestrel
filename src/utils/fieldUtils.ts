export interface FieldInfo {
  name: string;
  shape: number[];
  dtype: string;
  /** Sub-node path within the stream (e.g. 'data'). Empty string = top-level. */
  subNode?: string;
}

/** A field is a 2D image if it has ≥2 shape dimensions with the last two both > 1. */
export function isImageField(f: FieldInfo): boolean {
  return f.shape.length >= 2 && f.shape[f.shape.length - 1] > 1 && f.shape[f.shape.length - 2] > 1;
}

/**
 * Returns true if fieldName matches a device name exactly or as a prefix.
 * e.g. "tetramm1" matches "tetramm1_current1".
 */
export function matchesDev(fieldName: string, devNames: string[]): boolean {
  return devNames.some(d => fieldName === d || fieldName.startsWith(d + '_'));
}

/**
 * Token-aware fallback for matchesDev. Splits fieldName on underscores and
 * returns true if any device name is one of the tokens. Used when the metadata
 * records a short logical axis name (e.g. "psi" for psi_scan) but the recorded
 * column is namespaced under its device ("huber_euler_extras_psi"). Should be
 * tried only after matchesDev fails, since it is broader.
 */
export function matchesToken(fieldName: string, devNames: string[]): boolean {
  const tokens = fieldName.split('_');
  return devNames.some(d => tokens.includes(d));
}

/**
 * Given several motor columns that the metadata says were scanned (e.g. h/k/l
 * for an hkl_scan), return the one whose recorded values change the most over
 * the run. Used to default the X axis to the dominant axis instead of always
 * picking the first one alphabetically.
 *
 * fetchValues is injected so this stays pure and testable: it should resolve to
 * a map { fieldName: array of values } for the requested candidates.
 *
 * Falls back to candidates[0] if a candidate has no/insufficient data. Returns
 * '' if candidates is empty; returns the single candidate if there is just one.
 */
export async function pickFastestChangingField(
  candidates: string[],
  fetchValues: (names: string[]) => Promise<Record<string, number[]>>,
): Promise<string> {
  if (candidates.length === 0) return '';
  if (candidates.length === 1) return candidates[0];

  const data = await fetchValues(candidates);
  let bestName = candidates[0];
  let bestRange = -1;
  for (const name of candidates) {
    const arr = data[name];
    if (!arr || arr.length < 2) continue;
    const range = Math.abs(Number(arr[arr.length - 1]) - Number(arr[0]));
    if (range > bestRange) { bestRange = range; bestName = name; }
  }
  return bestName;
}


/**
 * Sort fields into display order: time → motors → other → detectors.
 * Within motors and detectors, order follows the device list order.
 */
export function sortFields(
  fields: FieldInfo[],
  motors: string[],
  detectors: string[],
): FieldInfo[] {
  const alpha = (a: FieldInfo, b: FieldInfo) => a.name.localeCompare(b.name);
  const motorFields = fields.filter(f => matchesDev(f.name, motors)).sort(alpha);
  const detFields = fields.filter(f => !matchesDev(f.name, motors) && matchesDev(f.name, detectors));
  const imageDetFields = detFields.filter(isImageField).sort(alpha);
  const scalarDetFields = detFields.filter(f => !isImageField(f)).sort(alpha);
  const otherFields = fields
    .filter(f => !matchesDev(f.name, motors) && !matchesDev(f.name, detectors))
    .sort(alpha);
  return [...motorFields, ...imageDetFields, ...scalarDetFields, ...otherFields];
}
