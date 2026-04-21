import { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import type { XYTrace } from '../types';

type FieldInfo = {
  name: string;
  shape: number[];
  dtype: string;
  subNode?: string;
};

type FieldSelectorProps = {
  serverUrl: string;
  catalog: string | null;
  runId: string;
  runLabel: string;
  runDetectors: string[];
  runHintsDetectors?: string[];
  detectorDefault?: 'smart' | 'hints' | 'last';
  runMotors: string[];
  runAcquiring: boolean;
  onPlot: (traces: XYTrace[], title: string) => void;
  onAddTraces: ((traces: XYTrace[]) => void) | null;
  onAddTracesRight: ((traces: XYTrace[]) => void) | null;
  onLivePlot: ((traces: XYTrace[], title: string, stream: string, dataSubNode: string, dataNodeFamily: 'array' | 'table') => void) | null;
  onRemoveRunTraces?: (runId: string) => void;
  /** When provided, switches to single-select Z mode for heatmap field selection */
  onZSelect?: (field: string) => void;
  /** Called when the user clicks "Plot grid" in z-mode */
  onGridPlot?: (stream: string) => void;
  /** Called when the user clicks "Plot 1D" in z-mode */
  onGrid1DPlot?: (stream: string) => void;
  /** When provided, image fields (shape ≥ 2D) show a View button instead of X/Y controls */
  onImageOpen?: (fieldName: string, stream: string, dataSubNode: string, shape: number[]) => void;
  /** Dichro mode: when true, auto-selects dichro_monitor stream and dichro_xmcd detector whenever available */
  dichroMode?: boolean;
};

export type FieldSelectorHandle = { schedulePlot: () => void; scheduleLive: () => void; removeY: (yLabel: string) => void; scheduleImageOpen: () => void; schedulePlotOnLoad: (runId: string) => void; scheduleGridPlot: (runId: string) => void };

const catSeg = (c: string | null) => c ? `/${c}` : '';

const FieldSelector = forwardRef<FieldSelectorHandle, FieldSelectorProps>(function FieldSelector({
  serverUrl, catalog, runId, runLabel,
  runDetectors, runHintsDetectors = [], detectorDefault = 'smart', runMotors, runAcquiring,
  onPlot, onAddTraces, onAddTracesRight, onLivePlot, onRemoveRunTraces, onZSelect, onGridPlot, onGrid1DPlot, onImageOpen,
  dichroMode = true,
}, ref) {
  const zMode = !!onZSelect;
  // A field is a 2D image if it has ≥2 shape dimensions with the last two both > 1
  const isImageField = (f: FieldInfo) =>
    f.shape.length >= 2 && f.shape[f.shape.length - 1] > 1 && f.shape[f.shape.length - 2] > 1;
  const [streams, setStreams] = useState<string[]>([]);
  const [selectedStream, setSelectedStream] = useState('');
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [xField, setXField] = useState('');
  const [yFields, setYFields] = useState<string[]>([]);
  const [i0Field, setI0Field] = useState('');
  const [loading, setLoading] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const lastXRef = useRef('');
  const lastXWasMotorRef = useRef(false);
  const lastYRef = useRef<string[]>([]);
  const lastManualStreamRef = useRef('');
  // Tracks which runId the current `fields` were loaded for; prevents stale-fields auto-select
  const fieldsRunIdRef = useRef('');
  // Ref so fetchFields can read the latest runId without having it as a useCallback dep.
  // This prevents fetchFields from firing with a stale selectedStream when runId changes:
  // the stream-loading effect resets selectedStream, so fetchFields must only re-run after
  // selectedStream is properly resolved — not the moment runId changes.
  const runIdRef = useRef(runId);
  runIdRef.current = runId;
  // True after we removed traces via onRemoveRunTraces, so the next Y check re-creates the panel
  const removedTracesRef = useRef(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<'plot' | 'live' | null>(null);
  const [dataSubNode, setDataSubNode] = useState('');
  const [dataNodeFamily, setDataNodeFamily] = useState<'array' | 'table'>('array');
  const [livePointCount, setLivePointCount] = useState<number | null>(null);
  const [imageYField, setImageYField] = useState<string | null>(null);
  // Remembers the last manually-chosen image field across run changes
  const lastImageFieldRef = useRef<string | null>(null);
  // Set to true on run change so fields-load auto-select fires exactly once per run
  const autoSelectImagePending = useRef(false);
  // Set to true when scheduleImageOpen is called before fields have loaded
  const pendingImageOpenRef = useRef(false);
  // Set to a runId when schedulePlotOnLoad is called; fires handlePlot once fields load for that run
  const pendingPlotOnLoadRef = useRef<string | null>(null);
  // Set to a runId when scheduleGridPlot is called; fires onGridPlot once zMode+fields are ready for that run
  const [pendingGridPlot, setPendingGridPlot] = useState<string | null>(null);
  // Set to true when user explicitly deselects the image radio; prevents auto-reselect on run change
  const imageUserDismissed = useRef(false);

  // Reset removedTracesRef when the run changes so it doesn't bleed into the next run
  useEffect(() => {
    removedTracesRef.current = false;
    setImageYField(null);
    autoSelectImagePending.current = true;
  }, [runId]);

  // Auto-select image field once per run when fields finish loading
  useEffect(() => {
    if (!onImageOpen || !autoSelectImagePending.current) return;
    const imageFields = fields.filter(isImageField);
    if (imageFields.length === 0) {
      // No image fields — if a deferred image open was requested, fall back to plot
      if (pendingImageOpenRef.current) { pendingImageOpenRef.current = false; setPendingAction('plot'); }
      return;
    }
    autoSelectImagePending.current = false;
    // If hints point to a non-image scalar, don't pre-select the image field
    const hintsDets = runHintsDetectors.length > 0 ? runHintsDetectors : runDetectors;
    const hintsHasScalar = fields.some(f => !isImageField(f) && matchesDev(f.name, hintsDets));
    if (hintsHasScalar) return;
    const remembered = lastImageFieldRef.current;
    const match = remembered ? imageFields.find(f => f.name === remembered) : null;
    const chosen = match ? match : imageFields[0];
    if (!imageUserDismissed.current) {
      setImageYField(chosen.name);
      if (pendingImageOpenRef.current) {
        pendingImageOpenRef.current = false;
        const imgSubNode = chosen.subNode !== undefined ? chosen.subNode : dataSubNode;
        onImageOpen(chosen.name, selectedStream, imgSubNode, chosen.shape);
      }
    } else {
      pendingImageOpenRef.current = false;
    }
  }, [fields, onImageOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch streams for this run
  useEffect(() => {
    if (!serverUrl || catalog === null || !runId) return;
    setStreams([]);
    setSelectedStream('');
    fieldsRunIdRef.current = '';
    let cancelled = false;
    fetch(`${serverUrl}/api/v1/search${catSeg(catalog)}/${runId}?page[limit]=50`)
      .then(r => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(json => {
        if (cancelled) return;
        const names: string[] = (json.data ?? []).map((item: any) => item.id);
        const nonBaseline = names.filter(n => n !== 'baseline');
        setStreams(nonBaseline);
        // Dichro mode: always prefer dichro_monitor when available, regardless of last manual choice
        if (dichroMode && nonBaseline.includes('dichro_monitor')) {
          setSelectedStream('dichro_monitor');
          return;
        }
        const preferred = lastManualStreamRef.current;
        const streamRestored = !!preferred && nonBaseline.includes(preferred);
        if (preferred && !streamRestored) {
          // The preferred stream isn't on this run; clear X memory so auto-pick uses a motor from
          // the current stream. Leave lastYRef intact — validLastY filtering (fieldNames.has) in the
          // auto-select effect already handles fields that don't exist here, so the detector is
          // remembered when the user returns to a run that does have the preferred stream.
          lastXRef.current = '';
        }
        setSelectedStream(streamRestored ? preferred : nonBaseline.includes('primary') ? 'primary' : (nonBaseline[0] ?? ''));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serverUrl, catalog, runId, dichroMode]);

  const fetchFields = useCallback(() => {
    if (!selectedStream) return;
    // Capture runId at call time so that async completions below don't race against
    // a subsequent runId change that kicked off a newer fetch.
    const runId = runIdRef.current;
    fieldsRunIdRef.current = '';
    setLoading(true);
    setFields([]);
    setError('');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseArrayItems = (json: any): FieldInfo[] =>
      (json.data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((item: any) => item.attributes?.structure_family === 'array')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => ({ name: item.id, shape: item.attributes?.structure?.shape ?? [], dtype: item.attributes?.structure?.data_type?.kind ?? '' }));

    const fetchUrl = (url: string) =>
      fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error('http')));

    // Fetch all pages from a search URL, handling server-side page size caps.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchAllPages = async (baseUrl: string): Promise<any> => {
      const PAGE = 200;
      const first = await fetchUrl(`${baseUrl}?page[limit]=${PAGE}&page[offset]=0`);
      const total: number = first?.meta?.count ?? (first?.data ?? []).length;
      let data = first?.data ?? [];
      let offset = data.length;
      while (offset < total) {
        const page = await fetchUrl(`${baseUrl}?page[limit]=${PAGE}&page[offset]=${offset}`);
        const chunk = page?.data ?? [];
        if (chunk.length === 0) break;
        data = [...data, ...chunk];
        offset += chunk.length;
      }
      return { ...first, data };
    };

    // Get column names via table/full. Returns {exists, cols} to distinguish
    // "table endpoint not found" (404 → not a table scan) from "table exists but
    // has no rows yet" (200 with {} → table scan that hasn't produced data yet).
    const fetchTableStatus = async (tablePath: string): Promise<{ exists: boolean; cols: string[] }> => {
      try {
        const r = await fetch(`${serverUrl}/api/v1/table/full${tablePath}?format=application/json`);
        if (!r.ok) return { exists: false, cols: [] };
        const data = await r.json();
        // Guard against servers that return 200 with {"detail": "..."} for unsupported structure
        if ('detail' in data) return { exists: false, cols: [] };
        return { exists: true, cols: Object.keys(data) };
      } catch { return { exists: false, cols: [] }; }
    };

    const streamBase = `${serverUrl}/api/v1/search${catSeg(catalog)}/${runId}/${selectedStream}`;
    const streamPath = `${catSeg(catalog)}/${runId}/${selectedStream}`;

    // Try fetching arrays from a sub-node. Returns {exists, fields} to distinguish
    // "sub-node not found" (404) from "sub-node exists but has no arrays yet".
    const trySubNodeArrays = async (sub: string): Promise<{ exists: boolean; fields: FieldInfo[] }> => {
      try {
        const j = await fetchAllPages(`${serverUrl}/api/v1/search${catSeg(catalog)}/${runId}/${selectedStream}/${sub}`);
        return { exists: true, fields: parseArrayItems(j) };
      } catch { return { exists: false, fields: [] }; }
    };

    fetchAllPages(streamBase)
      .then(async json => {
        // Get shape/dtype info from search results (includes image field detection)
        const searchArrays = parseArrayItems(json);
        const searchByName = new Map(searchArrays.map(f => [f.name, f]));

        // Try table/full first — it may expose fields not individually listed in search
        // (e.g. 1D scan data when MCA arrays dominate the search results)
        const tableStatus = await fetchTableStatus(streamPath);

        // Probe: fetch stream metadata — Bluesky descriptors may list all fields via data_keys
        const metaUrl = `${serverUrl}/api/v1/metadata${streamPath}`;
        const metaR = await fetch(metaUrl);
        const metaJson = metaR.ok ? await metaR.json() : null;
        const metaDataKeys: Record<string, unknown> = metaJson?.data?.attributes?.metadata?.data_keys ?? {};
        const uniqueDataKeys = Object.keys(metaDataKeys);

        if (tableStatus.exists && tableStatus.cols.length > 0) {
          // Use table columns as the field list (cross-reference search for shape info)
          const tableFields: FieldInfo[] = tableStatus.cols.map(col =>
            searchByName.get(col) ?? { name: col, shape: [], dtype: '' }
          );
          // Also add image-only fields from search not exposed via table (e.g. 3D MCA arrays)
          const tableColSet = new Set(tableStatus.cols);
          const imageExtras = searchArrays.filter(f => !tableColSet.has(f.name) && isImageField(f));
          setDataSubNode(''); setDataNodeFamily('table');
          fieldsRunIdRef.current = runId;
          setFields([...tableFields, ...imageExtras]); return;
        }

        if (tableStatus.exists) {
          // Table endpoint exists but has no rows yet (live scan hasn't produced data).
          // Lock in table format and leave fields empty so the retry loop keeps polling.
          setDataSubNode(''); setDataNodeFamily('table');
          setFields([]); return;
        }

        // Sub-node discovery: for MongoDB/container adapters, arrays live under primary/data
        // or primary/internal. Discover the sub-node BEFORE the data_keys fallback so that
        // fetchAllTraces always builds URLs with the correct sub-node path.
        const subData     = await trySubNodeArrays('data');
        const subInternal = subData.exists ? { exists: false, fields: [] as FieldInfo[] }
                                           : await trySubNodeArrays('internal');
        const subArrays   = subData.fields.length > 0 ? subData.fields : subInternal.fields;
        // Keep the sub-node name even when the container exists but has no arrays yet
        // (live scan that hasn't emitted events), so data_keys fields get the right URL.
        const subNode = subData.fields.length > 0   ? 'data'
                      : subInternal.fields.length > 0 ? 'internal'
                      : subData.exists               ? 'data'
                      : subInternal.exists           ? 'internal'
                      : '';

        if (searchArrays.length > 0 || subArrays.length > 0) {
          const knownNames = new Set(searchArrays.map(f => f.name));
          const taggedSub = subArrays
            .filter(f => !knownNames.has(f.name))
            .map(f => ({ ...f, subNode }));
          setDataSubNode(subNode || ''); setDataNodeFamily('array');
          fieldsRunIdRef.current = runId;
          setFields([...searchArrays, ...taggedSub]); return;
        }

        // PostgreSQL table node: table is a sub-node of the stream container.
        // Must be checked before data_keys so the correct URL is used.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tableItem = (json.data ?? []).find((item: any) => item.attributes?.structure_family === 'table');
        if (tableItem) {
          const columns: string[] = tableItem.attributes?.structure?.columns ?? [];
          const tableColSet = new Set(columns);
          // Image arrays live directly under the stream, not inside the table sub-node.
          // Tag them with subNode='' so onImageOpen builds the right array/full URL.
          const imageExtras = searchArrays
            .filter(f => !tableColSet.has(f.name) && isImageField(f))
            .map(f => ({ ...f, subNode: '' }));
          setDataSubNode(tableItem.id); setDataNodeFamily('table');
          fieldsRunIdRef.current = runId;
          setFields([...columns.map((col: string) => ({ name: col, shape: [], dtype: 'number' })), ...imageExtras]);
          return;
        }

        // Use metadata data_keys for field names, with the sub-node discovered above so that
        // fetchAllTraces builds the correct array/full URL (e.g. primary/data/fieldName).
        if (uniqueDataKeys.length > 0) {
          const knownNames = new Set(searchArrays.map(f => f.name));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const metaFields: FieldInfo[] = uniqueDataKeys.map(key => {
            if (searchByName.has(key)) return searchByName.get(key)!;
            const dk = metaDataKeys[key] as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            const shape: number[] = dk?.shape ?? [];
            return { name: key, shape, dtype: dk?.dtype ?? '' };
          });
          // Add image fields from search not in data_keys (e.g. 3D MCA arrays stored externally)
          const imageExtras = searchArrays.filter(f => !knownNames.has(f.name) || isImageField(f))
            .filter(f => !uniqueDataKeys.includes(f.name));
          setDataSubNode(subNode); setDataNodeFamily('array');
          fieldsRunIdRef.current = runId;
          setFields([...metaFields, ...imageExtras]); return;
        }

        setError('No fields found');
      })
      .catch(() => setError('Failed to load fields'))
      .finally(() => setLoading(false));
  }, [serverUrl, catalog, selectedStream]); // runId intentionally omitted: accessed via runIdRef so fetchFields only re-fires when selectedStream changes (not on every runId change with a stale stream)

  useEffect(() => { fetchFields(); }, [fetchFields]);

  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (prevLoadingRef.current && !loading && fields.length > 0) {
      setFlashSuccess(true);
      const t = setTimeout(() => setFlashSuccess(false), 1000);
      return () => clearTimeout(t);
    }
    prevLoadingRef.current = loading;
  }, [loading, fields.length]);

  // Prefix-aware classification: device names like "tetramm1" match fields "tetramm1_current1_..."
  const matchesDev = (fieldName: string, devNames: string[]) =>
    devNames.some(d => fieldName === d || fieldName.startsWith(d + '_'));

// Sort fields: time → motors → area detectors → other, each group alphabetical
  const sortedFields = useMemo(() => {
    const alpha = (a: FieldInfo, b: FieldInfo) => a.name.localeCompare(b.name);
    const timeField = fields.filter(f => f.name === 'time');
    const motorFields = fields.filter(f => f.name !== 'time' && matchesDev(f.name, runMotors)).sort(alpha);
    const imageFields = fields.filter(f => f.name !== 'time' && !matchesDev(f.name, runMotors) && isImageField(f)).sort(alpha);
    const otherFields = fields
      .filter(f => f.name !== 'time' && !matchesDev(f.name, runMotors) && !isImageField(f))
      .sort(alpha);
    return [...timeField, ...motorFields, ...imageFields, ...otherFields];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, runDetectors, runMotors]);

  // Auto-preselect X and Y: restore last user selection if it exists, else fall back to defaults
  useEffect(() => {
    if (fieldsRunIdRef.current !== runId) { setYFields([]); setXField(''); return; }
    if (sortedFields.length === 0) return;
    const fieldNames = new Set(sortedFields.map(f => f.name));

    // Dichro mode: when dichro_monitor is active, always default to dichro_positioner1 (X) + dichro fields (Y/Z)
    // In z-mode (grid): xmcd first so it becomes the Z field; in 1D: xas first, both shown
    if (dichroMode && selectedStream === 'dichro_monitor' && fieldNames.has('dichro_xmcd')) {
      if (fieldNames.has('dichro_positioner1')) setXField('dichro_positioner1');
      const order = zMode
        ? (['dichro_xmcd', 'dichro_xas'] as const)
        : (['dichro_xas', 'dichro_xmcd'] as const);
      setYFields(order.filter(f => fieldNames.has(f)));
      return;
    }

    if (lastXRef.current && fieldNames.has(lastXRef.current) &&
        (!lastXWasMotorRef.current || matchesDev(lastXRef.current, runMotors))) {
      setXField(lastXRef.current);
    } else {
      const firstMotor = sortedFields.find(f => f.name !== 'time' && matchesDev(f.name, runMotors));
      setXField(firstMotor?.name ?? '');
    }

    const validLastY = lastYRef.current.filter(y => fieldNames.has(y));
    const hasImageFields = sortedFields.some(isImageField);
    const isNumeric = (f: FieldInfo) => !['S', 'U', 'string'].includes(f.dtype);

    if (detectorDefault === 'last' && validLastY.length > 0) {
      setYFields(validLastY);
    } else if (detectorDefault === 'hints' || (detectorDefault === 'smart' && validLastY.length === 0)) {
      // Prefer hints detectors; fall back to full detector list
      const hintsDets = runHintsDetectors.length > 0 ? runHintsDetectors : runDetectors;
      const hintsNonImageDet = sortedFields.find(f => !isImageField(f) && isNumeric(f) && matchesDev(f.name, hintsDets) && !matchesDev(f.name, runMotors));
      // Only suppress Y auto-select when image fields exist AND hints don't point to a non-image scalar
      const firstDet = (hasImageFields && !hintsNonImageDet) ? undefined :
        hintsNonImageDet ??
        sortedFields.find(f => !isImageField(f) && isNumeric(f) && matchesDev(f.name, runDetectors) && !matchesDev(f.name, runMotors)) ??
        sortedFields.find(f => matchesDev(f.name, runDetectors));
      setYFields(firstDet ? [firstDet.name] : []);
    } else if (validLastY.length > 0) {
      setYFields(validLastY);
    } else {
      // last mode with no prior selection: fall back to first available detector
      const firstDet = hasImageFields ? undefined :
        sortedFields.find(f => !isImageField(f) && isNumeric(f) && matchesDev(f.name, runDetectors) && !matchesDev(f.name, runMotors)) ??
        sortedFields.find(f => matchesDev(f.name, runDetectors) && !matchesDev(f.name, runMotors) && isNumeric(f)) ??
        sortedFields.find(f => matchesDev(f.name, runDetectors));
      setYFields(firstDet ? [firstDet.name] : []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedFields, runMotors, runDetectors, runHintsDetectors, detectorDefault, runId, dichroMode, selectedStream, zMode]);

  // In z-mode, emit the selected field whenever yFields[0] changes (auto-select or user click)
  useEffect(() => {
    if (zMode && yFields.length > 0) onZSelect?.(yFields[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zMode, yFields]);

  const selectXField = (name: string) => {
    lastXRef.current = name;
    lastXWasMotorRef.current = matchesDev(name, runMotors);
    setXField(name);
    if (onAddTraces) handlePlot(name, yFields);
  };

  const toggleYField = (name: string) => {
    const next = yFields.includes(name) ? yFields.filter(n => n !== name) : [...yFields, name];
    lastYRef.current = next;
    setYFields(next);
    if (runAcquiring && onLivePlot) {
      // During live acquisition: re-trigger live plot with new selection; never remove traces
      if (next.length > 0) setPendingAction('live');
    } else if (onAddTraces || removedTracesRef.current) {
      if (next.length > 0) {
        removedTracesRef.current = false;
        handlePlot(xField, next);
      } else {
        removedTracesRef.current = true;
        onRemoveRunTraces?.(runId);
      }
    }
  };

  const applyI0 = (y: number[], i0: number[]): number[] =>
    y.map((v, i) => (i0[i] !== 0 && i0[i] != null ? v / i0[i] : v));

  const fetchAllTraces = async (x: string, ys: string[], i0 = i0Field): Promise<XYTrace[]> => {
    const subPath = dataSubNode ? `/${dataSubNode}` : '';
    if (dataNodeFamily === 'table') {
      const resp = await fetch(`${serverUrl}/api/v1/table/full${catSeg(catalog)}/${runId}/${selectedStream}${subPath}?format=application/json`);
      if (resp.ok) {
        const table = await resp.json();
        const seqNums: number[] = table.seq_num ?? [];
        const nRows = seqNums.length > 0 ? (seqNums.findIndex(s => s === 0) === -1 ? seqNums.length : seqNums.findIndex(s => s === 0)) : undefined;
        const i0Data: number[] = i0 ? (nRows !== undefined ? (table[i0] ?? []).slice(0, nRows) : (table[i0] ?? [])) : [];
        return ys.map(yf => {
          let yArr: number[] = nRows !== undefined ? (table[yf] ?? []).slice(0, nRows) : (table[yf] ?? []);
          const xArr = nRows !== undefined ? (table[x] ?? []).slice(0, nRows) : (table[x] ?? []);
          if (i0 && i0Data.length > 0) yArr = applyI0(yArr, i0Data);
          return { x: xArr, y: yArr, xLabel: x, yLabel: i0 ? `${yf}/I0` : yf, ...(i0 ? { rawYLabel: yf, i0Label: i0 } : {}), runLabel, runId };
        });
      }
      // table/full failed — fall through to per-column array fetches
    }
    // Build a lookup: field name → base fetch URL (accounts for per-field subNode overrides)
    const fieldNodeMap = new Map(fields.map(f => {
      const node = f.subNode !== undefined ? f.subNode : dataSubNode;
      const sp = node ? `/${node}` : '';
      return [f.name, `${serverUrl}/api/v1/array/full${catSeg(catalog)}/${runId}/${selectedStream}${sp}`];
    }));
    const baseDefault = `${serverUrl}/api/v1/array/full${catSeg(catalog)}/${runId}/${selectedStream}${subPath}`;
    const baseFor = (name: string) => fieldNodeMap.get(name) ?? baseDefault;

    const yResps = await Promise.all(ys.map(yf => fetch(`${baseFor(yf)}/${yf}?format=application/json`)));
    if (yResps.some(r => !r.ok)) throw new Error('Fetch failed');
    const yDatas: number[][] = await Promise.all(yResps.map(r => r.json()));
    const xResp = await fetch(`${baseFor(x)}/${x}?format=application/json`);
    if (!xResp.ok) throw new Error('Fetch failed');
    const xData: number[] = await xResp.json();
    let i0Data: number[] = [];
    if (i0) {
      const i0Resp = await fetch(`${baseFor(i0)}/${i0}?format=application/json`);
      if (i0Resp.ok) i0Data = await i0Resp.json();
    }
    return ys.map((yf, idx) => {
      const y = i0 && i0Data.length > 0 ? applyI0(yDatas[idx], i0Data) : yDatas[idx];
      return { x: xData, y, xLabel: x, yLabel: i0 ? `${yf}/I0` : yf, ...(i0 ? { rawYLabel: yf, i0Label: i0 } : {}), runLabel, runId };
    });
  };

  const handlePlot = async (x = xField, ys = yFields, i0 = i0Field) => {
    if (!x || ys.length === 0 || adding) return;
    setAdding(true);
    setError('');
    try {
      const traces = await fetchAllTraces(x, ys, i0);
      const title = ys.length === 1 ? `${ys[0]} vs ${x}` : `${ys.join(', ')} vs ${x}`;
      onPlot(traces, title);
    } catch (e) {
      console.error('Plot failed:', e);
      setError('Failed to fetch data');
    } finally {
      setAdding(false);
    }
  };

  // Auto-schedule live plot when selecting an acquiring run; clear when switching to non-acquiring
  useEffect(() => {
    setPendingAction(runAcquiring && !!onLivePlot ? 'live' : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // When waiting for live and the target stream hasn't appeared yet, poll for it
  useEffect(() => {
    // In dichro mode the auto-selected stream is dichro_monitor; use it as the target
    // instead of falling back to primary (which is what lastManualStreamRef defaults to
    // when the stream was auto-selected rather than manually chosen).
    const targetStream = dichroMode ? 'dichro_monitor' : (lastManualStreamRef.current || 'primary');
    if (pendingAction !== 'live' || selectedStream === targetStream) return;
    const poll = () =>
      fetch(`${serverUrl}/api/v1/search${catSeg(catalog)}/${runId}?page[limit]=50`)
        .then(r => r.json())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(json => {
          const names: string[] = (json.data ?? []).map((item: any) => item.id);
          if (names.includes(targetStream)) { setStreams(names); setSelectedStream(targetStream); }
          else if (names.includes('primary')) {
            // Target stream not available on this run — fall back to primary and clear preference
            if (!dichroMode) lastManualStreamRef.current = '';
            setStreams(names); setSelectedStream('primary');
          }
        })
        .catch(() => {});
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, selectedStream, serverUrl, catalog, runId, dichroMode]);

  // Retry fetchFields every 2s while waiting for data to appear on the target stream
  useEffect(() => {
    const targetStream = dichroMode ? 'dichro_monitor' : (lastManualStreamRef.current || 'primary');
    if (pendingAction !== 'live' || loading || fields.length > 0 || selectedStream !== targetStream) return;
    const id = setInterval(fetchFields, 2000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, loading, fields.length, selectedStream, dichroMode]);

  // Fire plot/live once fields are ready; guard live against non-primary stream
  useEffect(() => {
    if (!loading && xField && yFields.length > 0) {
      if (pendingGridPlot && pendingGridPlot === runId && zMode && onGridPlot) {
        // Grid plot: fires after zMode=true so auto-select has picked the right field order.
        // Emit the current Z field before opening so gridZField is set correctly.
        onZSelect?.(yFields[0]);
        setPendingGridPlot(null);
        onGridPlot(selectedStream);
      } else if (pendingAction) {
        const action = pendingAction;
        setPendingAction(null);
        pendingPlotOnLoadRef.current = null;
        if (action === 'live') handleLivePlot();
        else handlePlot();
      } else if (pendingPlotOnLoadRef.current === runId) {
        pendingPlotOnLoadRef.current = null;
        handlePlot();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGridPlot, pendingAction, loading, xField, yFields, selectedStream, zMode]);

  useImperativeHandle(ref, () => ({
    schedulePlot: () => setPendingAction('plot'),
    scheduleLive: () => setPendingAction('live'),
    schedulePlotOnLoad: (id: string) => { pendingPlotOnLoadRef.current = id; },
    scheduleGridPlot: (id: string) => { setPendingGridPlot(id); },
    removeY: (yLabel: string) => {
      setYFields(prev => {
        const next = prev.filter(y => y !== yLabel);
        lastYRef.current = next;
        return next;
      });
    },
    scheduleImageOpen: () => {
      if (!onImageOpen) { setPendingAction('plot'); return; }
      // If hints point to a non-image scalar, plot that instead of opening the image
      const hintsDets = runHintsDetectors.length > 0 ? runHintsDetectors : runDetectors;
      const hintsHasScalar = fields.some(f => !isImageField(f) && matchesDev(f.name, hintsDets));
      if (hintsHasScalar) { setPendingAction('plot'); return; }
      // If image field already selected and stream is ready, open immediately
      const f = fields.find(fi => fi.name === imageYField);
      if (imageYField && f && selectedStream) {
        const imgSubNode = f.subNode !== undefined ? f.subNode : dataSubNode;
        onImageOpen(imageYField, selectedStream, imgSubNode, f.shape);
      } else {
        // Defer: auto-select will fire and then open
        pendingImageOpenRef.current = true;
        autoSelectImagePending.current = true;
      }
    },
  }), [onImageOpen, imageYField, fields, selectedStream, dataSubNode, runHintsDetectors, runDetectors]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch table row count for shape display — polls every 2s while acquiring, once when completed
  useEffect(() => {
    if (dataNodeFamily !== 'table' || !dataSubNode || selectedStream !== 'primary' || fields.length === 0 || pendingAction !== null) {
      setLivePointCount(null);
      return;
    }
    const subPath = `/${dataSubNode}`;
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const resp = await fetch(`${serverUrl}/api/v1/table/full${catSeg(catalog)}/${runId}/${selectedStream}${subPath}?format=application/json`);
        if (!resp.ok || cancelled) return;
        const table = await resp.json();
        const seqNums: number[] = table.seq_num ?? [];
        const nRows = seqNums.length > 0
          ? (seqNums.findIndex(s => s === 0) === -1 ? seqNums.length : seqNums.findIndex(s => s === 0))
          : 0;
        if (!cancelled) setLivePointCount(nRows);
      } catch { }
    };
    fetchCount();
    const id = runAcquiring ? setInterval(fetchCount, 2000) : undefined;
    return () => { cancelled = true; if (id) clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runAcquiring, dataNodeFamily, dataSubNode, selectedStream, fields.length, serverUrl, catalog, runId, pendingAction]);

  const handleLivePlot = async () => {
    if (!xField || yFields.length === 0 || adding || !onLivePlot) return;
    setAdding(true);
    setError('');
    try {
      const traces = await fetchAllTraces(xField, yFields);
      const title = yFields.length === 1
        ? `${yFields[0]} vs ${xField}`
        : `${yFields.join(', ')} vs ${xField}`;
      onLivePlot(traces, title, selectedStream, dataSubNode, dataNodeFamily);
    } catch {
      if (runAcquiring) {
        // Data not yet available (scan just started) — retry after 2s
        setTimeout(() => setPendingAction('live'), 2000);
      } else {
        setError('Failed to fetch data');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleAddTraces = async () => {
    if (!xField || yFields.length === 0 || adding || !onAddTraces) return;
    setAdding(true);
    setError('');
    try {
      const traces = await fetchAllTraces(xField, yFields);
      onAddTraces(traces);
    } catch {
      setError('Failed to fetch data');
    } finally {
      setAdding(false);
    }
  };

  const handleAddTracesRight = async () => {
    if (!xField || yFields.length === 0 || adding || !onAddTracesRight) return;
    setAdding(true);
    setError('');
    try {
      const traces = await fetchAllTraces(xField, yFields);
      onAddTracesRight(traces);
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
      <div className={`shrink-0 px-3 py-2 border-b border-gray-200 transition-colors duration-1000 ${flashSuccess ? 'bg-green-100' : 'bg-gray-50'}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold text-gray-500">ScanID</span>
          <span className="text-xs font-bold text-blue-600 truncate" title={runLabel}>{runLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedStream}
            onChange={e => { lastManualStreamRef.current = e.target.value; setSelectedStream(e.target.value); }}
            className="text-xs bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-sky-400"
          >
            {streams.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {zMode ? (
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => onGridPlot?.(selectedStream)}
                disabled={yFields.length === 0}
                className="px-2 py-0.5 text-xs bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >Plot grid</button>
              <button
                onClick={() => onGrid1DPlot?.(selectedStream)}
                disabled={yFields.length === 0}
                className="px-2 py-0.5 text-xs bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >Plot 1D</button>
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-1">
              {onImageOpen && imageYField ? (
                <button
                  onClick={() => {
                    const f = fields.find(fi => fi.name === imageYField);
                    if (f) {
                      const imgSubNode = f.subNode !== undefined ? f.subNode : dataSubNode;
                      onImageOpen(imageYField, selectedStream, imgSubNode, f.shape);
                    }
                  }}
                  className="px-2 py-0.5 text-xs bg-sky-600 text-white rounded hover:bg-sky-500 font-medium"
                >View image</button>
              ) : (
                <>
                  <button
                    onClick={() => { setPendingAction(null); handlePlot(); }}
                    disabled={!xField || yFields.length === 0 || adding}
                    className="px-2 py-0.5 text-xs bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    title="Replace plot with selected fields"
                  >{adding ? '…' : 'Plot'}</button>
                  <button
                    onClick={handleAddTraces}
                    disabled={!xField || yFields.length === 0 || adding || !onAddTraces}
                    className="px-2 py-0.5 text-xs bg-white border border-sky-600 text-sky-600 rounded hover:bg-sky-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    title={onAddTraces ? 'Add curve(s) to left axis' : 'No plot open — use Plot first'}
                  >+L</button>
                  <button
                    onClick={handleAddTracesRight}
                    disabled={!xField || yFields.length === 0 || adding || !onAddTracesRight}
                    className="px-2 py-0.5 text-xs bg-white border border-sky-600 text-sky-600 rounded hover:bg-sky-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    title={onAddTracesRight ? 'Add curve(s) to right axis' : 'No plot open — use Plot first'}
                  >+R</button>
                </>
              )}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-scroll">
        {loading || (pendingAction === 'live' && fields.length === 0) ? (
          <div className="flex items-center justify-center h-20 text-gray-400 text-xs">
            {pendingAction === 'live' && !loading ? 'Waiting for run to start…' : 'Loading…'}
          </div>
        ) : (
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col className="w-full" />
              {!zMode && <col className="w-8" />}
              <col className="w-8" />
              {!zMode && <col className="w-8" />}
              <col className="w-14" />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={thClass}>Field</th>
                {!zMode && <th className={`${thClass} text-center`}>X</th>}
                <th className={`${thClass} text-center`}>{zMode ? 'Z' : 'Y'}</th>
                {!zMode && <th className={`${thClass} text-center`}>I0</th>}
                <th className={`${thClass} text-right`}>Shape</th>
              </tr>
            </thead>
            <tbody>
              {sortedFields.map((f, i) => {
                const isDet = matchesDev(f.name, runDetectors);
                const isMotor = f.name !== 'time' && matchesDev(f.name, runMotors);
                const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                const isImg = onImageOpen && isImageField(f);
                return (
                  <tr key={f.name} className={`cursor-pointer hover:bg-sky-50 ${rowBg}`}>
                    <td className={`${tdClass} font-mono break-all`}>
                      {f.name}
                      {isDet && <span className="ml-1 text-[10px] text-purple-400 font-sans">det</span>}
                      {isMotor && <span className="ml-1 text-[10px] text-green-500 font-sans">mot</span>}
                    </td>
                    {!zMode && (
                      <td className={`${tdClass} text-center`}>
                        {!isImg && (
                          <input
                            type="radio"
                            name="xField"
                            checked={xField === f.name}
                            onChange={() => selectXField(f.name)}
                            className="accent-sky-600"
                          />
                        )}
                      </td>
                    )}
                    <td className={`${tdClass} text-center`}>
                      {isImg ? (
                        <input
                          type="radio"
                          name="imageYField"
                          checked={imageYField === f.name}
                          onChange={() => { setImageYField(f.name); lastImageFieldRef.current = f.name; imageUserDismissed.current = false; }}
                          onClick={() => { if (imageYField === f.name) { setImageYField(null); imageUserDismissed.current = true; } }}
                          className="accent-sky-600"
                        />
                      ) : zMode ? (
                        <input
                          type="radio"
                          name="zField"
                          checked={yFields[0] === f.name}
                          onChange={() => { setYFields([f.name]); lastYRef.current = [f.name]; }}
                          className="accent-sky-600"
                        />
                      ) : (
                        <input
                          type="checkbox"
                          checked={yFields.includes(f.name)}
                          onChange={() => toggleYField(f.name)}
                          className="accent-sky-600"
                        />
                      )}
                    </td>
                    {!zMode && (
                      <td className={`${tdClass} text-center`}>
                        {!isImg && (
                          <input
                            type="radio"
                            name="i0Field"
                            checked={i0Field === f.name}
                            onChange={() => {
                              setI0Field(f.name);
                              if (onAddTraces) handlePlot(xField, yFields, f.name);
                            }}
                            onClick={() => {
                              if (i0Field === f.name) {
                                setI0Field('');
                                if (onAddTraces) handlePlot(xField, yFields, '');
                              }
                            }}
                            className="accent-sky-600"
                          />
                        )}
                      </td>
                    )}
                    <td className={`${tdClass} text-right text-gray-400`}>
                      {livePointCount !== null ? `(${livePointCount})` : f.shape.length > 0 ? `(${f.shape.join(', ')})` : ''}
                    </td>
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
});

export default FieldSelector;
