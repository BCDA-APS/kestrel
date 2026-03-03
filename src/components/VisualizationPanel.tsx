import { PlotlyHeatmap } from '@blueskyproject/finch';
import { useTiledImage } from '../hooks/useTiledImage';
import type { Panel } from '../types';

type VisualizationPanelProps = {
  panel: Panel;
  onRemove: (id: string) => void;
};

export default function VisualizationPanel({ panel, onRemove }: VisualizationPanelProps) {
  const { array, metadata, zIndex, setZIndex, loading, error } = useTiledImage(panel.url);
  const is3D = (metadata?.shape.length ?? 0) >= 3;
  const zMax = is3D ? (metadata!.shape[0] - 1) : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden h-full min-h-[400px]">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-sm font-medium text-gray-700 truncate"
            title={panel.title}
          >
            {panel.title}
          </span>
          {metadata && (
            <span className="text-xs text-gray-400 shrink-0">
              [{metadata.shape.join(' × ')}]
            </span>
          )}
        </div>
        <button
          onClick={() => onRemove(panel.id)}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-2 shrink-0"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      {/* Panel body */}
      <div className="flex-1 flex flex-col items-center justify-center p-2 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10">
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-sm">Loading...</span>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-sm text-red-500 font-medium">Failed to load</p>
            <p className="text-xs text-gray-400">{error}</p>
          </div>
        )}

        {array && (
          <div className="w-full h-full">
            <PlotlyHeatmap
              array={array}
              title={panel.title}
              colorScale="Viridis"
              showScale
              lockPlotHeightToParent
            />
          </div>
        )}

        {!array && !loading && !error && (
          <p className="text-sm text-gray-400">Fetching dataset...</p>
        )}
      </div>

      {/* Z-slice slider (3D datasets only) */}
      {is3D && (
        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-gray-500">Z</span>
          <input
            type="range"
            min={0}
            max={zMax}
            value={zIndex}
            onChange={(e) => setZIndex(Number(e.target.value))}
            className="flex-1 accent-sky-600"
          />
          <span className="text-xs text-gray-500 w-12 text-right">
            {zIndex} / {zMax}
          </span>
        </div>
      )}
    </div>
  );
}
