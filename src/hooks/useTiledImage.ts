import { useState, useEffect } from 'react';

interface TiledMetadata {
  shape: number[];
  fullUrl: string;
}

export interface UseTiledImageResult {
  array: number[][] | null;
  metadata: TiledMetadata | null;
  zIndex: number;
  setZIndex: (z: number) => void;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches image data from a Tiled metadata URL and decodes it into a 2D grayscale array.
 *
 * Flow:
 *   1. GET {metadataUrl} → extract shape + fullUrl from Tiled metadata
 *   2. GET {fullUrl}?format=image/png&slice=... → fetch PNG slice
 *   3. Decode PNG via OffscreenCanvas → number[][]
 */
export function useTiledImage(metadataUrl: string): UseTiledImageResult {
  const [array, setArray] = useState<number[][] | null>(null);
  const [metadata, setMetadata] = useState<TiledMetadata | null>(null);
  const [zIndex, setZIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset and fetch metadata whenever the URL changes
  useEffect(() => {
    if (!metadataUrl) return;
    setMetadata(null);
    setArray(null);
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
          throw new Error('Unexpected Tiled metadata format — missing shape or full link.');
        }
        setMetadata({ shape, fullUrl });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch metadata');
      }
    }

    fetchMetadata();
  }, [metadataUrl]);

  // Fetch + decode image whenever metadata or zIndex changes
  useEffect(() => {
    if (!metadata) return;

    let cancelled = false;

    async function fetchImage() {
      setLoading(true);
      setError(null);
      try {
        const is3D = metadata!.shape.length >= 3;
        // Tiled slice notation: "z,::1,::1" for a single z-plane, "::1,::1" for 2D
        const slice = is3D ? `${zIndex},::1,::1` : '::1,::1';
        const imgUrl = `${metadata!.fullUrl}?format=image/png&slice=${slice}`;

        const resp = await fetch(imgUrl);
        if (!resp.ok) throw new Error(`Image fetch failed: HTTP ${resp.status}`);
        const blob = await resp.blob();

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
            const i = (row * canvas.width + col) * 4;
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            // Luminance-weighted grayscale (matches PlotlyHeatmapTiled)
            rowData.push(0.299 * r + 0.587 * g + 0.114 * b);
          }
          result.push(rowData);
        }

        if (!cancelled) setArray(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load image');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchImage();
    return () => { cancelled = true; };
  }, [metadata, zIndex]);

  return { array, metadata, zIndex, setZIndex, loading, error };
}
