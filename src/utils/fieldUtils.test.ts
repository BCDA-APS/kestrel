import { describe, it, expect } from 'vitest';
import { isImageField, matchesDev, matchesToken, pickFastestChangingField, sortFields, type FieldInfo } from './fieldUtils';

const f = (name: string, shape: number[], dtype = 'float64'): FieldInfo => ({ name, shape, dtype });

describe('isImageField', () => {
  it('returns true for a 2D field with both dims > 1', () => {
    expect(isImageField(f('img', [512, 512]))).toBe(true);
  });

  it('returns true for a 3D field (nFrames × H × W)', () => {
    expect(isImageField(f('img', [10, 128, 128]))).toBe(true);
  });

  it('returns false for a 1D field', () => {
    expect(isImageField(f('x', [100]))).toBe(false);
  });

  it('returns false when last dim is 1', () => {
    expect(isImageField(f('col', [512, 1]))).toBe(false);
  });

  it('returns false when second-to-last dim is 1', () => {
    expect(isImageField(f('row', [1, 512]))).toBe(false);
  });

  it('returns false for scalar (no shape)', () => {
    expect(isImageField(f('s', []))).toBe(false);
  });
});

describe('matchesDev', () => {
  it('matches exact device name', () => {
    expect(matchesDev('det1', ['det1', 'det2'])).toBe(true);
  });

  it('matches field with device prefix', () => {
    expect(matchesDev('det1_current', ['det1'])).toBe(true);
  });

  it('does not match partial prefix without underscore', () => {
    expect(matchesDev('det10_x', ['det1'])).toBe(false);
  });

  it('returns false when no device matches', () => {
    expect(matchesDev('motor1', ['det1', 'det2'])).toBe(false);
  });
});

describe('matchesToken', () => {
  it('matches device name as the last token (psi_scan pseudo-axis case)', () => {
    expect(matchesToken('huber_euler_extras_psi', ['psi'])).toBe(true);
  });

  it('matches device name as a middle token', () => {
    expect(matchesToken('scaler1_psi_offset', ['psi'])).toBe(true);
  });

  it('matches device name as the first token', () => {
    expect(matchesToken('psi_value', ['psi'])).toBe(true);
  });

  it('does not match substring within a single token', () => {
    expect(matchesToken('parsipal', ['psi'])).toBe(false);
  });

  it('returns false when no token matches', () => {
    expect(matchesToken('huber_euler_mu', ['psi'])).toBe(false);
  });

  it('returns true if any device name matches', () => {
    expect(matchesToken('huber_euler_extras_psi', ['theta', 'psi'])).toBe(true);
  });
});

describe('pickFastestChangingField', () => {
  it('returns empty string for no candidates', async () => {
    const fetcher = async () => ({});
    expect(await pickFastestChangingField([], fetcher)).toBe('');
  });

  it('returns the only candidate without fetching', async () => {
    let called = false;
    const fetcher = async () => { called = true; return {}; };
    expect(await pickFastestChangingField(['h'], fetcher)).toBe('h');
    expect(called).toBe(false);
  });

  it('picks the candidate with the largest |last - first|', async () => {
    const fetcher = async () => ({
      huber_euler_h: [1, 1, 1, 1, 1],
      huber_euler_k: [0, 0.1, 0.2, 0.3, 0.4],
      huber_euler_l: [1, 1.5, 2, 2.5, 3],
    });
    const winner = await pickFastestChangingField(
      ['huber_euler_h', 'huber_euler_k', 'huber_euler_l'],
      fetcher,
    );
    expect(winner).toBe('huber_euler_l');
  });

  it('uses absolute value (negative-going axes count)', async () => {
    const fetcher = async () => ({
      h: [0, 0.1, 0.2],
      l: [5, 0, -5],
    });
    expect(await pickFastestChangingField(['h', 'l'], fetcher)).toBe('l');
  });

  it('returns the first candidate on ties', async () => {
    const fetcher = async () => ({
      h: [0, 1, 2],
      k: [0, 1, 2],
    });
    expect(await pickFastestChangingField(['h', 'k'], fetcher)).toBe('h');
  });

  it('skips candidates with missing or too-short data', async () => {
    const fetcher = async () => ({
      h: [],
      k: [0],
      l: [0, 0.5, 1],
    });
    expect(await pickFastestChangingField(['h', 'k', 'l'], fetcher)).toBe('l');
  });

  it('falls back to first candidate when no candidate has usable data', async () => {
    const fetcher = async () => ({ h: [], k: undefined as unknown as number[] });
    expect(await pickFastestChangingField(['h', 'k'], fetcher)).toBe('h');
  });
});

describe('sortFields', () => {
  const time = f('time', [100]);
  const motor1 = f('m1', [100]);
  const motor2 = f('m2', [100]);
  const det1 = f('d1_counts', [100]);
  const det2 = f('d2_counts', [100]);
  const other = f('other', [100]);

  it('places motors first, then area detectors, then detectors, then other — all alphabetical', () => {
    const img = f('cam', [512, 512]);
    const fields = [det2, other, motor1, time, det1, motor2, img];
    const sorted = sortFields(fields, ['m1', 'm2'], ['d1', 'd2', 'cam']);
    expect(sorted.map(fi => fi.name)).toEqual(['m1', 'm2', 'cam', 'd1_counts', 'd2_counts', 'other', 'time']);
  });

  it('sorts motors alphabetically', () => {
    const fields = [motor2, motor1];
    const sorted = sortFields(fields, ['m1', 'm2'], []);
    expect(sorted.map(fi => fi.name)).toEqual(['m1', 'm2']);
  });

  it('sorts detectors alphabetically', () => {
    const fields = [det2, det1];
    const sorted = sortFields(fields, [], ['d1', 'd2']);
    expect(sorted.map(fi => fi.name)).toEqual(['d1_counts', 'd2_counts']);
  });

  it('handles empty field list', () => {
    expect(sortFields([], ['m1'], ['d1'])).toEqual([]);
  });
});
