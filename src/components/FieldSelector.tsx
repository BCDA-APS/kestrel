import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { XYTrace } from '../types';

type FieldInfo = {
  name: string;
  shape: number[];
};

type FieldSelectorProps = {
  serverUrl: string;
  catalog: string;
  runId: string;
  runLabel: string;
  runDetectors: string[];
  runMotors: string[];
  onPlot: (traces: XYTrace[], title: string) => void;
  onAddTraces: ((traces: XYTrace[]) => void) | null;
};

export default function FieldSelector({
  serverUrl, catalog, runId, runLabel,
  runDetectors, runMotors,
  onPlot, onAddTraces,
}: FieldSelectorProps) {
  const [streams, setStreams] = useState<string[]>([]);
  const [selectedStream, setSelectedStream] = useState('');
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [xField, setXField] = useState('');
  const [yFields, setYFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const lastXRef = useRef('');
  const lastYRef = useRef<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  // Fetch streams for this run
  useEffect(() => {
    if (!serverUrl || !catalog || !runId) return;
    setStreams([]);
    setSelectedStream('');
    fetch(`${serverUrl}/api/v1/search/${catalog}/${runId}?page[limit]=50`)
      .then(r => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(json => {
        const names: string[] = (json.data ?? []).map((item: any) => item.id);
        setStreams(names);
        setSelectedStream(names.includes('primary') ? 'primary' : (names[0] ?? ''));
      })
      .catch(() => {});
  }, [serverUrl, catalog, runId]);

  const fetchFields = useCallback(() => {
    if (!selectedStream) return;
    setLoading(true);
    setFields([]);
    setError('');
    fetch(`${serverUrl}/api/v1/search/${catalog}/${runId}/${selectedStream}/data?page[limit]=200`)
      .then(r => r.json())
      .then(json => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fs: FieldInfo[] = (json.data ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((item: any) => item.attributes?.structure_family === 'array')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => ({
            name: item.id,
            shape: item.attributes?.structure?.shape ?? [],
          }));
        setFields(fs);
      })
      .catch(() => setError('Failed to load fields'))
      .finally(() => setLoading(false));
  }, [serverUrl, catalog, runId, selectedStream]);

  useEffect(() => { fetchFields(); }, [fetchFields]);

  // Prefix-aware classification: device names like "tetramm1" match fields "tetramm1_current1_..."
  const matchesDev = (fieldName: string, devNames: string[]) =>
    devNames.some(d => fieldName === d || fieldName.startsWith(d + '_'));

  const devSortKey = (fieldName: string, devNames: string[]) => {
    const idx = devNames.findIndex(d => fieldName === d || fieldName.startsWith(d + '_'));
    return idx === -1 ? Infinity : idx;
  };

  // Sort fields: time → motors → other → detectors
  const sortedFields = useMemo(() => {
    const timeFields = fields.filter(f => f.name === 'time');
    const motorFields = fields
      .filter(f => f.name !== 'time' && matchesDev(f.name, runMotors))
      .sort((a, b) => devSortKey(a.name, runMotors) - devSortKey(b.name, runMotors));
    const detectorFields = fields
      .filter(f => matchesDev(f.name, runDetectors))
      .sort((a, b) => devSortKey(a.name, runDetectors) - devSortKey(b.name, runDetectors));
    const otherFields = fields.filter(
      f => f.name !== 'time' && !matchesDev(f.name, runMotors) && !matchesDev(f.name, runDetectors)
    );
    return [...timeFields, ...motorFields, ...otherFields, ...detectorFields];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, runDetectors, runMotors]);

  // Auto-preselect X and Y: restore last user selection if it exists, else fall back to defaults
  useEffect(() => {
    if (sortedFields.length === 0) return;
    const fieldNames = new Set(sortedFields.map(f => f.name));

    if (lastXRef.current && fieldNames.has(lastXRef.current)) {
      setXField(lastXRef.current);
    } else {
      const firstMotor = sortedFields.find(f => f.name !== 'time' && matchesDev(f.name, runMotors));
      setXField(firstMotor?.name ?? '');
    }

    const validLastY = lastYRef.current.filter(y => fieldNames.has(y));
    if (validLastY.length > 0) {
      setYFields(validLastY);
    } else {
      const firstDet = sortedFields.find(f => matchesDev(f.name, runDetectors));
      setYFields(firstDet ? [firstDet.name] : []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedFields, runMotors, runDetectors]);

  const selectXField = (name: string) => {
    lastXRef.current = name;
    setXField(name);
  };

  const toggleYField = (name: string) => {
    setYFields(prev => {
      const next = prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name];
      lastYRef.current = next;
      return next;
    });
  };

  const fetchAllTraces = async (): Promise<XYTrace[]> => {
    const base = `${serverUrl}/api/v1/array/full/${catalog}/${runId}/${selectedStream}/data`;
    const [xResp, ...yResps] = await Promise.all([
      fetch(`${base}/${xField}?format=application/json`),
      ...yFields.map(yf => fetch(`${base}/${yf}?format=application/json`)),
    ]);
    if (!xResp.ok || yResps.some(r => !r.ok)) throw new Error('Fetch failed');
    const [xData, ...yDatas]: [number[], ...number[][]] = await Promise.all([
      xResp.json(),
      ...yResps.map(r => r.json()),
    ]);
    return yFields.map((yf, i) => ({
      x: xData, y: yDatas[i],
      xLabel: xField, yLabel: yf,
      runLabel, runId,
    }));
  };

  const handlePlot = async () => {
    if (!xField || yFields.length === 0 || adding) return;
    setAdding(true);
    setError('');
    try {
      const traces = await fetchAllTraces();
      const title = yFields.length === 1
        ? `${yFields[0]} vs ${xField}`
        : `${yFields.join(', ')} vs ${xField}`;
      onPlot(traces, title);
    } catch {
      setError('Failed to fetch data');
    } finally {
      setAdding(false);
    }
  };

  const handleAddTraces = async () => {
    if (!xField || yFields.length === 0 || adding || !onAddTraces) return;
    setAdding(true);
    setError('');
    try {
      const traces = await fetchAllTraces();
      onAddTraces(traces);
    } catch {
      setError('Failed to fetch data');
    } finally {
      setAdding(false);
    }
  };

  const thClass = 'px-2 py-1 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 bg-gray-50';
  const tdClass = 'px-2 py-1 text-xs text-gray-700';

  return (
    <div className="flex flex-col h-full overflow-hidden border-t-2 border-gray-200">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold text-gray-600">Fields</span>
          <span className="text-xs text-gray-400 truncate" title={runLabel}>{runLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedStream}
            onChange={e => setSelectedStream(e.target.value)}
            className="text-xs bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-sky-400"
          >
            {streams.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={fetchFields}
              className="p-1 text-gray-400 hover:text-gray-700 text-base leading-none"
              title="Refresh fields"
            >↻</button>
            <button
              onClick={handlePlot}
              disabled={!xField || yFields.length === 0 || adding}
              className="px-2 py-0.5 text-xs bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              title="Replace plot with selected fields"
            >{adding ? '…' : 'Plot'}</button>
            <button
              onClick={handleAddTraces}
              disabled={!xField || yFields.length === 0 || adding || !onAddTraces}
              className="px-2 py-0.5 text-xs bg-white border border-sky-600 text-sky-600 rounded hover:bg-sky-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              title={onAddTraces ? 'Add curve(s) to current plot' : 'No plot open — use Plot first'}
            >+</button>
          </div>
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-scroll">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-gray-400 text-xs">Loading…</div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={thClass}>Field</th>
                <th className={`${thClass} text-center w-8`}>X</th>
                <th className={`${thClass} text-center w-8`}>Y</th>
                <th className={`${thClass} text-right`}>Shape</th>
              </tr>
            </thead>
            <tbody>
              {sortedFields.map((f, i) => {
                const isDet = matchesDev(f.name, runDetectors);
                const isMotor = f.name !== 'time' && matchesDev(f.name, runMotors);
                const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                return (
                  <tr key={f.name} className={`cursor-pointer hover:bg-sky-50 ${rowBg}`}>
                    <td className={`${tdClass} font-mono`}>
                      {f.name}
                      {isDet && <span className="ml-1 text-[10px] text-purple-400 font-sans">det</span>}
                      {isMotor && <span className="ml-1 text-[10px] text-green-500 font-sans">mot</span>}
                    </td>
                    <td className={`${tdClass} text-center`}>
                      <input
                        type="radio"
                        name="xField"
                        checked={xField === f.name}
                        onChange={() => selectXField(f.name)}
                        className="accent-sky-600"
                      />
                    </td>
                    <td className={`${tdClass} text-center`}>
                      <input
                        type="checkbox"
                        checked={yFields.includes(f.name)}
                        onChange={() => toggleYField(f.name)}
                        className="accent-sky-600"
                      />
                    </td>
                    <td className={`${tdClass} text-right text-gray-400`}>({f.shape.join(', ')})</td>
                  </tr>
                );
              })}
              {sortedFields.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-xs text-gray-400">No fields found</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
