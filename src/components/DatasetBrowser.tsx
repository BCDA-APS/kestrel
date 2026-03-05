import { Tiled } from '@blueskyproject/finch';

type DatasetBrowserProps = {
  serverUrl: string;
  initialPath?: string;
  onBack?: () => void;
  onSelectDataset: (url: string, title: string) => void;
};

export default function DatasetBrowser({ serverUrl, initialPath, onBack, onSelectDataset }: DatasetBrowserProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSelect = (item: any) => {
    const url: string = item?.links?.self ?? item?.self ?? '';
    if (!url) return;
    // Derive a human-readable title from the URL path
    const segments = url.replace(/\/+$/, '').split('/');
    const title = segments[segments.length - 1] ?? 'Dataset';
    onSelectDataset(url, title);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="text-sky-600 hover:text-sky-800 text-xs font-medium flex items-center gap-1"
          >
            ← Runs
          </button>
        )}
        <div className={onBack ? 'border-l border-gray-200 pl-2' : ''}>
          <h2 className="text-sm font-semibold text-gray-700">Dataset Browser</h2>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {/*
          The Tiled component from @blueskyproject/finch wraps @blueskyproject/tiled.
          - tiledBaseUrl: points to the Tiled REST API (e.g. http://localhost:8000/api/v1)
          - onSelectCallback: called with the selected catalog node when user clicks a dataset
        */}
        <Tiled
          tiledBaseUrl={`${serverUrl}/api/v1`}
          initialPath={initialPath}
          onSelectCallback={handleSelect}
        />
      </div>
    </div>
  );
}
