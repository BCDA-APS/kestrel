import { Tiled } from '@blueskyproject/finch';

type DatasetBrowserProps = {
  serverUrl: string;
  onSelectDataset: (url: string, title: string) => void;
};

export default function DatasetBrowser({ serverUrl, onSelectDataset }: DatasetBrowserProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSelect = (item: any) => {
    const url: string = item?.links?.self ?? '';
    if (!url) return;
    // Derive a human-readable title from the URL path
    const segments = url.replace(/\/+$/, '').split('/');
    const title = segments[segments.length - 1] ?? 'Dataset';
    onSelectDataset(url, title);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Dataset Browser</h2>
        <p className="text-xs text-gray-400 mt-0.5">Select a dataset to add it to the view</p>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {/*
          The Tiled component from @blueskyproject/finch wraps @blueskyproject/tiled.
          - tiledBaseUrl: points to the Tiled REST API (e.g. http://localhost:8000/api/v1)
          - onSelectCallback: called with the selected catalog node when user clicks a dataset
        */}
        <Tiled
          tiledBaseUrl={`${serverUrl}/api/v1`}
          onSelectCallback={handleSelect}
        />
      </div>
    </div>
  );
}
