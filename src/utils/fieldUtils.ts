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
