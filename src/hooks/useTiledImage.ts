import { useState, useEffect } from 'react';

interface TiledMetadata {
  shape: number[];
  fullUrl: string;
  dims: string[] | null;
}

export interface UseTiledImageResult {
  array: number[][] | null;  // 2D/3D data decoded from PNG
  line: number[] | null;     // 1D data fetched as JSON
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
          // Check if this is a non-array type (table, dataframe, etc.)
          const nodeType: string = json.data?.type ?? json.data?.attributes?.structure?.family ?? '';
          if (nodeType && nodeType !== 'array') {
            throw new Error(`Cannot visualize a "${nodeType}" dataset — only array data is supported.`);
          }
          if (fullUrl && fullUrl.includes('/table/')) {
            throw new Error('Cannot visualize a table/DataFrame — only array data is supported.');
          }
          throw new Error('This dataset cannot be visualized (missing shape or data link). It may be a table or unsupported type.');
        }
        const dims: string[] | null =
          json.data?.attributes?.structure?.dims ??
          json.data?.attributes?.dims ??
          null;
        setMetadata({ shape, fullUrl, dims });
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
        if (metadata!.shape.length === 1) {
          // 1D: fetch as JSON and return flat number[]
          const resp = await fetch(`${metadata!.fullUrl}?format=application/json`);
          if (!resp.ok) throw new Error(`Data fetch failed: HTTP ${resp.status}`);
          const data = await resp.json();
          // Tiled returns the array directly; flatten in case it's nested
          const flat: number[] = Array.isArray(data[0]) ? data.flat() : data;
          if (!cancelled) setLine(flat);
        } else {
          // 2D+: build slice for any number of leading dims (handles 2D, 3D, 4D, ...)
          const leadingShape = metadata!.shape.slice(0, -2);
          const leadingIndices = flatToMultiIndex(zIndex, leadingShape);
          const slice = [...leadingIndices.map(String), '::1', '::1'].join(',');

          // Try PNG first (bandwidth efficient)
          const pngResp = await fetch(`${metadata!.fullUrl}?format=image/png&slice=${slice}`);
          if (pngResp.ok) {
            const blob = await pngResp.blob();
            const bitmap = await createImageBitmap(blob);
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not get canvas 2D context');
            ctx.drawImage(bitmap, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result: number[][] = [];
            for (let row = 0; row < canvas.height; row++) {
              const rowData: number[] = [];
              for (let col = 0; col < canvas.width; col++) {
                const idx = (row * canvas.width + col) * 4;
                const r = imageData.data[idx];
                const g = imageData.data[idx + 1];
                const b = imageData.data[idx + 2];
                rowData.push(0.299 * r + 0.587 * g + 0.114 * b);
              }
              result.push(rowData);
            }
            if (!cancelled) setArray(result);
          } else {
            // PNG failed (e.g. unsupported dtype or 4D array) – fall back to JSON
            const jsonResp = await fetch(`${metadata!.fullUrl}?format=application/json&slice=${slice}`);
            if (!jsonResp.ok) throw new Error(`Data fetch failed: HTTP ${jsonResp.status}`);
            const data = await jsonResp.json();
            // Tiled returns a 2D nested array after the leading-dim slice
            const result: number[][] = Array.isArray(data[0]) ? data : [data];
            if (!cancelled) setArray(result);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [metadata, zIndex]);

  return { array, line, metadata, zIndex, setZIndex, loading, error };
}
