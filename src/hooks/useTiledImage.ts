import { useState, useEffect } from 'react';

interface TiledMetadata {
  shape: number[];
  chunks: number[][] | null;  // chunks[dim] = list of chunk sizes along that dim
  fullUrl: string;
  blockUrlTemplate: string | null;  // e.g. "...?block={0},{1},{2},{3}"
  dims: string[] | null;
}

export interface UseTiledImageResult {
  array: number[][] | null;
  line: number[] | null;
  metadata: TiledMetadata | null;
  zIndex: number;
  setZIndex: (z: number) => void;
  loading: boolean;
  error: string | null;
}

function flatToMultiIndex(flat: number, shape: number[]): number[] {
  const indices: number[] = new Array(shape.length).fill(0);
  let rem = flat;
  for (let i = shape.length - 1; i >= 0; i--) {
    indices[i] = rem % shape[i];
    rem = Math.floor(rem / shape[i]);
  }
  return indices;
}

/** Replace {0},{1},... placeholders in a Tiled block URL template with actual indices. */
function buildBlockUrl(template: string, blockIndices: number[], format: string): string {
  const withIndices = template.replace(/\{(\d+)\}/g, (_, i) => String(blockIndices[parseInt(i)]));
  return `${withIndices}&format=${format}`;
}

async function decodePng(blob: Blob): Promise<number[][]> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result: number[][] = [];
  for (let row = 0; row < canvas.height; row++) {
    const rowData: number[] = [];
    for (let col = 0; col < canvas.width; col++) {
      const idx = (row * canvas.width + col) * 4;
      rowData.push(
        0.299 * imageData.data[idx] +
        0.587 * imageData.data[idx + 1] +
        0.114 * imageData.data[idx + 2],
      );
    }
    result.push(rowData);
  }
  return result;
}

const TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  // Chain with any external signal
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
  }
}

export function useTiledImage(metadataUrl: string): UseTiledImageResult {
  const [array, setArray] = useState<number[][] | null>(null);
  const [line, setLine] = useState<number[] | null>(null);
  const [metadata, setMetadata] = useState<TiledMetadata | null>(null);
  const [zIndex, setZIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!metadataUrl) return;
    setMetadata(null);
    setArray(null);
    setLine(null);
    setZIndex(0);
    setError(null);

    async function fetchMetadata() {
      try {
        const resp = await fetch(metadataUrl);
        if (!resp.ok) throw new Error(`Metadata fetch failed: HTTP ${resp.status}`);
        const json = await resp.json();
        const shape: number[] | undefined = json.data?.attributes?.structure?.shape;
        const fullUrl: string | undefined = json.data?.links?.full;
        if (!shape || !fullUrl) {
          const nodeType: string = json.data?.type ?? json.data?.attributes?.structure?.family ?? '';
          if (nodeType && nodeType !== 'array') {
            throw new Error(`Cannot visualize a "${nodeType}" dataset — only array data is supported.`);
          }
          throw new Error('This dataset cannot be visualized (missing shape or data link).');
        }
        const dims: string[] | null =
          json.data?.attributes?.structure?.dims ??
          json.data?.attributes?.dims ??
          null;
        const chunks: number[][] | null = json.data?.attributes?.structure?.chunks ?? null;
        const blockUrlTemplate: string | null = json.data?.links?.block ?? null;
        setMetadata({ shape, chunks, fullUrl, blockUrlTemplate, dims });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch metadata');
      }
    }

    fetchMetadata();
  }, [metadataUrl]);

  useEffect(() => {
    if (!metadata) return;

    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const { shape, fullUrl, blockUrlTemplate } = metadata!;

        if (shape.length === 1) {
          // 1D → line chart via JSON
          const resp = await fetchWithTimeout(`${fullUrl}?format=application/json`);
          if (!resp.ok) throw new Error(`Data fetch failed: HTTP ${resp.status}`);
          const data = await resp.json();
          const flat: number[] = Array.isArray(data[0]) ? data.flat() : data;
          if (!cancelled) setLine(flat);
          return;
        }

        // 2D+: compute leading (non-spatial) indices from zIndex
        const leadingShape = shape.slice(0, -2);
        const leadingIndices = flatToMultiIndex(zIndex, leadingShape);

        // Prefer block endpoint (what Tiled/finch uses natively)
        if (blockUrlTemplate) {
          // Leading dims: map element index → block index using chunk sizes.
          // Spatial dims: always block 0 (single chunk spans the full image plane).
          const simpleBlockIndices = [
            ...leadingIndices,
            ...shape.slice(-2).map(() => 0),
          ];

          const pngUrl = buildBlockUrl(blockUrlTemplate, simpleBlockIndices, 'image/png');
          try {
            const pngResp = await fetchWithTimeout(pngUrl);
            if (pngResp.ok) {
              const result = await decodePng(await pngResp.blob());
              if (!cancelled) setArray(result);
              return;
            }
          } catch { /* fall through to JSON */ }

          const jsonUrl = buildBlockUrl(blockUrlTemplate, simpleBlockIndices, 'application/json');
          const jsonResp = await fetchWithTimeout(jsonUrl);
          if (!jsonResp.ok) throw new Error(`Data fetch failed: HTTP ${jsonResp.status}`);
          const data = await jsonResp.json();
          // Block response may be N-dimensional; flatten to 2D
          const flat2d: number[][] = Array.isArray(data[0])
            ? (Array.isArray(data[0][0]) ? data.flat(shape.length - 2) : data)
            : [data];
          if (!cancelled) setArray(flat2d);
          return;
        }

        // Fallback: full endpoint with explicit slice notation
        const sliceParts = [...leadingIndices.map(String), ...shape.slice(-2).map(() => ':')];
        const sliceParam = sliceParts.length > 0 ? `&slice=${sliceParts.join(',')}` : '';

        if (shape.length === 2) {
          try {
            const pngResp = await fetchWithTimeout(`${fullUrl}?format=image/png${sliceParam}`);
            if (pngResp.ok) {
              const result = await decodePng(await pngResp.blob());
              if (!cancelled) setArray(result);
              return;
            }
          } catch { /* fall through */ }
        }

        const jsonResp = await fetchWithTimeout(`${fullUrl}?format=application/json${sliceParam}`);
        if (!jsonResp.ok) throw new Error(`Data fetch failed: HTTP ${jsonResp.status}`);
        const data = await jsonResp.json();
        const result: number[][] = Array.isArray(data[0]) ? data : [data];
        if (!cancelled) setArray(result);

      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof DOMException && e.name === 'AbortError'
            ? 'Request timed out — server took too long.'
            : e instanceof Error ? e.message : 'Failed to load data';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [metadata, zIndex]);

  return { array, line, metadata, zIndex, setZIndex, loading, error };
}
