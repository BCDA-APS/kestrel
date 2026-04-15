import { useState, useEffect } from 'react';

type Props = {
  serverUrl: string;
  catalog: string | null;
  runId: string;
};

const catSeg = (c: string | null) => c ? `/${c}` : '';

type TableSource = {
  tableUrl: string;
  // Base path for fetching individual arrays if table/full returns 404
  arrayBase: string | null;
};

// Probe a stream to find the correct table URL, mirroring FieldSelector logic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveTableSource(serverUrl: string, catalog: string | null, runId: string, stream: string): Promise<TableSource | null> {
  const cs = catSeg(catalog);
  const searchUrl = `${serverUrl}/api/v1/search${cs}/${runId}/${stream}?page[limit]=200`;
  const r = await fetch(searchUrl);
  if (!r.ok) return null;
  const json = await r.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = json.data ?? [];

  // Case 1: table node directly under stream (PostgreSQL adapter)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableItem = items.find((item: any) => item.attributes?.structure_family === 'table');
  if (tableItem) {
    return { tableUrl: `${serverUrl}/api/v1/table/full${cs}/${runId}/${stream}/${tableItem.id}?format=application/json`, arrayBase: null };
  }

  // Case 2: arrays directly under stream — try fetching stream as a table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasArrays = items.some((item: any) => item.attributes?.structure_family === 'array');
  if (hasArrays) {
    return {
      tableUrl: `${serverUrl}/api/v1/table/full${cs}/${runId}/${stream}?format=application/json`,
      arrayBase: `${serverUrl}/api/v1/array/full${cs}/${runId}/${stream}`,
    };
  }

  // Case 3: sub-nodes (MongoDB adapter: primary/data or primary/internal)
  for (const sub of ['data', 'internal']) {
    const subPath = `${cs}/${runId}/${stream}/${sub}`;
    const firstR = await fetch(`${serverUrl}/api/v1/search${subPath}?page[limit]=200&page[offset]=0`);
    if (firstR.ok) {
      const firstJson = await firstR.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let allItems: any[] = firstJson.data ?? [];
      const total: number = firstJson.meta?.count ?? allItems.length;
      // Paginate if there are more than 200 columns (e.g. MongoDB adapter with large baseline)
      let offset = allItems.length;
      while (offset < total) {
        const pageR = await fetch(`${serverUrl}/api/v1/search${subPath}?page[limit]=200&page[offset]=${offset}`);
        if (!pageR.ok) break;
        const pageJson = await pageR.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chunk: any[] = pageJson.data ?? [];
        if (chunk.length === 0) break;
        allItems = allItems.concat(chunk);
        offset += chunk.length;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arrayItems: any[] = allItems.filter((item: any) => item.attributes?.structure_family === 'array');
      if (arrayItems.length > 0) {
        return {
          tableUrl: `${serverUrl}/api/v1/table/full${subPath}?format=application/json`,
          arrayBase: `${serverUrl}/api/v1/array/full${subPath}`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...{ columns: arrayItems.map((item: any) => item.id) },
        } as TableSource & { columns: string[] };
      }
    }
  }

  return null;
}

// Fetch each column individually and assemble into a table record.
async function fetchColumnarData(arrayBase: string, columns: string[]): Promise<Record<string, unknown[]>> {
  const entries = await Promise.all(
    columns.map(async col => {
      const r = await fetch(`${arrayBase}/${col}?format=application/json`);
      if (!r.ok) return [col, []] as [string, unknown[]];
      const data = await r.json();
      return [col, Array.isArray(data) ? data : []] as [string, unknown[]];
    })
  );
  return Object.fromEntries(entries);
}

export default function RunDataTab({ serverUrl, catalog, runId }: Props) {
  const [streams, setStreams] = useState<string[]>([]);
  const [activeStream, setActiveStream] = useState('');
  const [data, setData] = useState<Record<string, unknown[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanId, setScanId] = useState<number | null>(null);
useEffect(() => {
    setScanId(null);
    if (!serverUrl || !runId) return;
    fetch(`${serverUrl}/api/v1/metadata${catSeg(catalog)}/${runId}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const id = j?.data?.attributes?.metadata?.start?.scan_id;
        if (typeof id === 'number') setScanId(id);
      })
      .catch(() => {});
  }, [serverUrl, catalog, runId]);

  // Fetch available streams for the run
  useEffect(() => {
    if (!serverUrl || catalog === null || !runId) { setStreams([]); setActiveStream(''); return; }
    fetch(`${serverUrl}/api/v1/search${catSeg(catalog)}/${runId}?page[limit]=50`)
      .then(r => r.json())
      .then(j => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const names: string[] = (j.data ?? []).map((d: any) => d.id);
        setStreams(names);
        setActiveStream(names.includes('primary') ? 'primary' : names[0] ?? '');
      })
      .catch(() => setStreams([]));
  }, [serverUrl, catalog, runId]);

  // Resolve the correct table URL then fetch data
  useEffect(() => {
    if (!activeStream) { setData({}); return; }
    let cancelled = false;
    setLoading(true);
    setError('');
    setData({});

    (async () => {
      try {
        const source = await resolveTableSource(serverUrl, catalog, runId, activeStream);
        if (cancelled) return;
        if (!source) { setError('No tabular data found in this stream'); return; }

        const r = await fetch(source.tableUrl);
        if (cancelled) return;

        if (r.ok) {
          let d = await r.json();
          // Also fetch any external-file arrays (e.g. MCA detectors) not included in table/full
          if (source.arrayBase) {
            const searchUrl = `${source.arrayBase.replace('/api/v1/array/full', '/api/v1/search')}?page[limit]=200`;
            const sj = await fetch(searchUrl).then(sr => sr.ok ? sr.json() : { data: [] });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const extCols: string[] = (sj.data ?? [])
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((i: any) => i.attributes?.structure_family === 'array')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((i: any) => i.id)
              .filter((id: string) => !(id in d));
            if (!cancelled && extCols.length > 0) {
              const extData = await fetchColumnarData(source.arrayBase, extCols);
              d = { ...d, ...extData };
            }
          }
          if (!cancelled) setData(d);
        } else if (r.status === 404 && source.arrayBase) {
          // Older servers (MongoDB adapter) may not support table/full — fetch columns individually
          const cols: string[] = (source as TableSource & { columns?: string[] }).columns
            ?? await fetch(`${source.arrayBase.replace('/api/v1/array/full', '/api/v1/search')}?page[limit]=200`)
              .then(sr => sr.json())
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .then(sj => (sj.data ?? []).filter((i: any) => i.attributes?.structure_family === 'array').map((i: any) => i.id));
          if (cancelled) return;
          const d = await fetchColumnarData(source.arrayBase, cols);
          if (!cancelled) setData(d);
        } else {
          throw new Error(`HTTP ${r.status}`);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [serverUrl, catalog, runId, activeStream]);

  if (!runId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Select a run to view data
      </div>
    );
  }

  const columns = Object.keys(data);
  const nRows = columns.length > 0 ? (data[columns[0]] as unknown[]).length : 0;
  const sortKey = ['seq_num', 'time'].find(k => columns.includes(k));
  const rowOrder = sortKey
    ? Array.from({ length: nRows }, (_, i) => i)
        .sort((a, b) => (data[sortKey] as number[])[a] - (data[sortKey] as number[])[b])
    : Array.from({ length: nRows }, (_, i) => i);
  const thCls = 'sticky top-0 z-10 px-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200 whitespace-nowrap';
  const tdCls = 'px-3 py-1 text-xs text-gray-700 border-b border-gray-100 whitespace-nowrap font-mono';

  const isTransposed = activeStream === 'baseline';

  const formatCell = (col: string, v: unknown) =>
    col === 'time' && typeof v === 'number'
      ? new Date(v * 1000).toLocaleString(undefined, { timeZoneName: 'short' })
      : typeof v === 'number'
        ? (Number.isInteger(v) ? String(v) : v.toPrecision(6))
        : String(v ?? '');

  const handleExportCsv = () => {
    const escape = (s: string) =>
      s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    let csv: string;
    if (isTransposed) {
      const colHeaders = rowOrder.length === 1 ? ['Start'] : ['Start', 'Stop'];
      const header = ['Field', ...colHeaders].map(escape).join(',');
      const rows = columns.map(col =>
        [col, ...rowOrder.map(ri => formatCell(col, (data[col] as unknown[])[ri]))].map(escape).join(',')
      );
      csv = [header, ...rows].join('\n');
    } else {
      const header = columns.map(escape).join(',');
      const rows = rowOrder.map(i =>
        columns.map(col => escape(formatCell(col, (data[col] as unknown[])[i]))).join(',')
      );
      csv = [header, ...rows].join('\n');
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${scanId != null ? `scan${scanId}_` : ''}${runId.slice(0, 8)}_${activeStream}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Stream selector */}
      {streams.length > 1 && (
        <div className="flex-none flex gap-1 px-1 py-1.5 border-b border-gray-200 bg-gray-50">
          {streams.map(s => (
            <button
              key={s}
              onClick={() => setActiveStream(s)}
              className={`px-2.5 py-0.5 text-xs rounded font-medium transition-colors ${
                s === activeStream
                  ? 'bg-sky-600 text-white'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading…</div>
        )}
        {error && !loading && (
          <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
        )}
        {!loading && !error && columns.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            {activeStream ? 'No tabular data in this stream' : 'No streams available'}
          </div>
        )}
        {!loading && !error && columns.length > 0 && (
          <>
            <div className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-gray-100 sticky top-0 z-20">
              <span className="text-xs text-gray-400">
                {isTransposed ? `${columns.length} fields` : `${nRows} rows · ${columns.length} columns`}
              </span>
              <button
                onClick={handleExportCsv}
                className="text-xs bg-sky-600 hover:bg-sky-500 text-white px-3 py-1 rounded font-medium transition-colors"
              >Export CSV</button>
            </div>
            {isTransposed ? (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={thCls}>Field</th>
                    {rowOrder.map((_, i) => (
                      <th key={i} className={thCls}>{i === 0 ? 'Start' : 'Stop'}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, i) => (
                    <tr key={col} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className={`${tdCls} text-gray-500`}>{col}</td>
                      {rowOrder.map(ri => (
                        <td key={ri} className={tdCls}>{formatCell(col, (data[col] as unknown[])[ri])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={thCls}>#</th>
                    {columns.map(col => (
                      <th key={col} className={thCls}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowOrder.map((ri, i) => (
                    <tr key={ri} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className={`${tdCls} text-gray-400`}>{i + 1}</td>
                      {columns.map(col => (
                        <td key={col} className={tdCls}>{formatCell(col, (data[col] as unknown[])[ri])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
