import { useState, useCallback } from 'react';
import DatasetBrowser from './components/DatasetBrowser';
import VisualizationGrid from './components/VisualizationGrid';
import type { Panel } from './types';

export default function App() {
  const [serverUrl, setServerUrl] = useState('http://localhost:8000');
  const [inputUrl, setInputUrl] = useState('http://localhost:8000');
  const [panels, setPanels] = useState<Panel[]>([]);

  const handleConnect = () => setServerUrl(inputUrl);

  const addPanel = useCallback((url: string, title: string) => {
    setPanels((prev) => {
      if (prev.some((p) => p.url === url)) return prev;
      return [...prev, { id: crypto.randomUUID(), url, title }];
    });
  }, []);

  const removePanel = useCallback((id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return (
    <div className="grid grid-cols-[320px_1fr] grid-rows-[4rem_1fr] h-screen w-screen overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="col-span-2 bg-sky-950 flex items-center px-6 gap-4 shadow-md z-10">
        <h1 className="text-white text-xl font-semibold tracking-wide">Tiled Visualizer</h1>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sky-300 text-xs font-medium">Server</label>
          <input
            className="bg-sky-900 text-white text-sm px-3 py-1.5 rounded border border-sky-700 focus:outline-none focus:border-sky-400 w-72 placeholder:text-sky-500"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            placeholder="http://localhost:8000"
          />
          <button
            onClick={handleConnect}
            className="bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white text-sm px-4 py-1.5 rounded font-medium transition-colors"
          >
            Connect
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="border-r border-gray-200 bg-white overflow-y-auto flex flex-col">
        <DatasetBrowser serverUrl={serverUrl} onSelectDataset={addPanel} />
      </aside>

      {/* Main content */}
      <main className="overflow-auto p-4">
        <VisualizationGrid panels={panels} onRemovePanel={removePanel} />
      </main>
    </div>
  );
}
