import { useState, useEffect } from 'react';

type RunRow = {
  id: string;
  scanId?: number | string;
  planName?: string;
  detectors?: string;
  date?: string;
  status?: string;
};

type RunTableProps = {
  serverUrl: string;
  catalog: string;
  page: number;
  onPageChange: (page: number) => void;
  onSelectRun: (runId: string) => void;
};

const PAGE_SIZE = 20;

function parseRun(item: Record<string, unknown>): RunRow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attrs = (item.attributes ?? {}) as Record<string, any>;
  const start = attrs.metadata?.start ?? {};
  const stop  = attrs.metadata?.stop  ?? {};
  const dets  = Array.isArray(start.detectors)
    ? start.detectors.join(', ')
    : start.detectors;
  const date = start.time
    ? new Date(start.time * 1000).toLocaleString()
    : undefined;
  return {
    id:        String(item.id ?? ''),
    scanId:    start.scan_id,
    planName:  start.plan_name,
    detectors: dets,
    date,
    status:    stop.exit_status,
  };
}

export default function RunTable({ serverUrl, catalog, page, onPageChange, onSelectRun }: RunTableProps) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!serverUrl || !catalog) { setRuns([]); setTotal(0); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // Step 1: get total count (cheap single-item fetch)
        const r1 = await fetch(`${serverUrl}/api/v1/search/${catalog}?page[limit]=1&page[offset]=0`);
        if (cancelled || !r1.ok) return;
        const j1 = await r1.json();
        const t: number = j1.meta?.count ?? j1.meta?.pagination?.count ?? 0;
        if (cancelled) return;
        setTotal(t);
        if (t === 0) { setRuns([]); return; }

        // Step 2: fetch the correct page in reverse order (most recent first)
        const lastPage = Math.max(0, Math.ceil(t / PAGE_SIZE) - 1);
        const safePage = Math.min(page, lastPage);
        // Compute offset into API's ascending order to get descending page `safePage`
        const reversedLimit = Math.min(PAGE_SIZE, t - safePage * PAGE_SIZE);
        const reversedOffset = Math.max(0, t - safePage * PAGE_SIZE - reversedLimit);
        const params = new URLSearchParams({
          'page[limit]':  String(reversedLimit),
          'page[offset]': String(reversedOffset),
        });
        const r2 = await fetch(`${serverUrl}/api/v1/search/${catalog}?${params}`);
        if (cancelled || !r2.ok) return;
        const j2 = await r2.json();
        if (cancelled) return;
        // Reverse so most recent run appears first
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setRuns([...(j2.data ?? []).map((item: any) => parseRun(item))].reverse());
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [serverUrl, catalog, page]);

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const thClass = "px-2 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 bg-gray-50 whitespace-nowrap";
  const tdClass = "px-2 py-1.5 text-xs text-gray-700 truncate max-w-[120px]";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <h2 className="text-sm font-semibold text-gray-700">Runs</h2>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading…</div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={thClass}>Scan ID</th>
                <th className={thClass}>Plan</th>
                <th className={thClass}>Detectors</th>
                <th className={thClass}>Date</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => (
                <tr
                  key={run.id}
                  onClick={() => onSelectRun(run.id)}
                  className={`cursor-pointer hover:bg-sky-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                >
                  <td className={tdClass}>{run.scanId ?? '—'}</td>
                  <td className={tdClass}>{run.planName ?? '—'}</td>
                  <td className={`${tdClass} max-w-[100px]`} title={run.detectors}>{run.detectors ?? '—'}</td>
                  <td className={tdClass}>{run.date ?? '—'}</td>
                  <td className={tdClass}>
                    {run.status ? (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        run.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {run.status}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex-none border-t border-gray-200 bg-white px-3 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-gray-500">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-1">
            {(['«', '‹', '›', '»'] as const).map((arrow) => {
              const disabled =
                (arrow === '«' || arrow === '‹') ? page === 0 :
                (arrow === '›' || arrow === '»') ? page >= lastPage : false;
              const newPage =
                arrow === '«' ? 0 :
                arrow === '‹' ? page - 1 :
                arrow === '›' ? page + 1 :
                lastPage;
              return (
                <button
                  key={arrow}
                  disabled={disabled}
                  onClick={() => onPageChange(newPage)}
                  className="px-2 py-0.5 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed font-mono"
                >
                  {arrow}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
