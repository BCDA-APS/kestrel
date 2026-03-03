import VisualizationPanel from './VisualizationPanel';
import type { Panel } from '../types';

type VisualizationGridProps = {
  panels: Panel[];
  onRemovePanel: (id: string) => void;
};

function gridCols(count: number): string {
  if (count === 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-2';
  return 'grid-cols-2 xl:grid-cols-3';
}

export default function VisualizationGrid({ panels, onRemovePanel }: VisualizationGridProps) {
  if (panels.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 select-none">
        <svg className="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        <p className="text-base font-medium">No datasets open</p>
        <p className="text-sm mt-1 text-gray-400">
          Browse the catalog on the left and click a dataset to visualize it here
        </p>
      </div>
    );
  }

  return (
    <div className={`grid ${gridCols(panels.length)} gap-4 auto-rows-[minmax(400px,1fr)]`}>
      {panels.map((panel) => (
        <VisualizationPanel
          key={panel.id}
          panel={panel}
          onRemove={onRemovePanel}
        />
      ))}
    </div>
  );
}
