import { useState, useCallback, useEffect } from 'react';
import DatasetBrowser from './components/DatasetBrowser';
import VisualizationGrid from './components/VisualizationGrid';
import type { Panel } from './types';

export default function App() {
  const [serverUrl, setServerUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [panels, setPanels] = useState<Panel[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [catalogs, setCatalogs] = useState<string[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState('');

  const toProxyUrl = (url: string) =>
    url.replace(/^(https?):\/\//, `${window.location.origin}/tiled-proxy/$1/`);

  const handleConnect = () => {
    setSelectedCatalog('');
    setServerUrl(toProxyUrl(inputUrl));
  };

  // Fetch top-level catalog names whenever the server changes
  useEffect(() => {
    if (!serverUrl) return;
    setCatalogs([]);
    fetch(`${serverUrl}/api/v1/search/`)
      .then((r) => r.json())
      .then((json) => {
        const names: string[] = (json.data ?? []).map((item: { id: string }) => item.id);
        setCatalogs(names);
      })
      .catch(() => {});
  }, [serverUrl]);

  const addPanel = useCallback((url: string, title: string) => {
    setPanels((prev) => {
      if (prev.some((p) => p.url === url)) return prev;
      return [...prev, { id: crypto.randomUUID(), url, title }];
    });
  }, []);

  const removePanel = useCallback((id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(150, Math.min(800, startWidth + e.clientX - startX));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="flex-none h-16 bg-sky-950 flex items-center px-6 gap-4 shadow-md z-10">
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

          {catalogs.length > 0 && (
            <>
              <div className="w-px h-6 bg-sky-700 mx-1" />
              <label className="text-sky-300 text-xs font-medium">Catalog</label>
              <select
                value={selectedCatalog}
                onChange={(e) => setSelectedCatalog(e.target.value)}
                className="bg-sky-900 text-white text-sm px-3 py-1.5 rounded border border-sky-700 focus:outline-none focus:border-sky-400"
              >
                <option value="">— root —</option>
                {catalogs.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="flex-none bg-white overflow-y-auto flex flex-col"
          style={{ width: sidebarWidth }}
        >
          <DatasetBrowser
            key={serverUrl + selectedCatalog}
            serverUrl={serverUrl}
            initialPath={selectedCatalog}
            onSelectDataset={addPanel}
          />
        </aside>

        {/* Drag handle */}
        <div
          className="flex-none w-1 cursor-col-resize bg-gray-200 hover:bg-sky-400 transition-colors"
          onMouseDown={handleDividerMouseDown}
        />

        {/* Main content */}
        <main className="flex-1 overflow-auto p-4">
          <VisualizationGrid panels={panels} onRemovePanel={removePanel} />
        </main>
      </div>
    </div>
  );
}
