import { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import type { XYTrace } from '../types';
import { matchesDev, matchesToken, pickFastestChangingField } from '../utils/fieldUtils';

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
  /** When adding to existing plot: preferred stream name (auto-select if available) */
  preferredStream?: string;
  /** When adding to existing plot: preferred X-axis field name (auto-select if available) */
  preferredXField?: string;
  /** When adding to existing plot: preferred Y-axis field names (auto-select if available) */
  preferredYFields?: string[];
};

export type FieldSelectorHandle = { schedulePlot: () => void; scheduleLive: () => void; removeY: (yLabel: string) => void; scheduleImageOpen: () => void; schedulePlotOnLoad: (runId: string) => void; scheduleGridPlot: (runId: string) => void };

const catSeg = (c: string | null) => c ? `/${c}` : '';

const FieldSelector = forwardRef<FieldSelectorHandle, FieldSelectorProps>(function FieldSelector({
  serverUrl, catalog, runId, runLabel,
  runDetectors, runHintsDetectors = [], detectorDefault = 'smart', runMotors, runAcquiring,
  onPlot, onAddTraces, onAddTracesRight: _, // Y1/Y2 columns handle axis assignment; kept for backward compatibility
  onLivePlot, onRemoveRunTraces, onZSelect, onGridPlot, onGrid1DPlot, onImageOpen,
  dichroMode = true,
  preferredStream, preferredXField, preferredYFields,
}, ref) {
  const zMode = !!onZSelect;
  // A field is a 2D image if it has ≥2 shape dimensions with the last two both > 1
  const isImageField = (f: FieldInfo) =>
    f.shape.length >= 2 && f.shape[f.shape.length - 1] > 1 && f.shape[f.shape.length - 2] > 1;
  const [streams, setStreams] = useState<string[]>([]);
  const [selectedStream, setSelectedStream] = useState('');
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [xField, setXField] = useState('');
  const [y1Fields, setY1Fields] = useState<string[]>([]);
  const [y2Fields, setY2Fields] = useState<string[]>([]);
  const [i0Field, setI0Field] = useState('');
  const [loading, setLoading] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const lastXRef = useRef('');
  const lastXWasMotorRef = useRef(false);
  // Tracks which runId set lastXRef. Used to scope motor X choices to the run
  // they were made on — otherwise a manual pick of e.g. huber_euler_l on a
  // k-varying hkl_scan would carry over to the next l-varying scan even when
  // the auto-picker would do better.
  const lastXRunIdRef = useRef('');
  const lastY1Ref = useRef<string[]>([]);
  const lastY2Ref = useRef<string[]>([]);
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
  // Cache "fastest-changing motor" pick per runId so re-selecting a run doesn't refetch.
  const pickedXCache = useRef(new Map<string, string>());

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
        // When adding to existing plot: prefer the explicitly provided stream
        if (preferredStream && nonBaseline.includes(preferredStream)) {
          setSelectedStream(preferredStream);
          return;
        }
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
          lastXRunIdRef.current = '';
        }
        setSelectedStream(streamRestored ? preferred : nonBaseline.includes('primary') ? 'primary' : (nonBaseline[0] ?? ''));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serverUrl, catalog, runId, dichroMode, preferredStream]);

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

   // Auto-preselect X and Y1/Y2: restore last user selection if it exists, else fall back to defaults
  useEffect(() => {
    if (fieldsRunIdRef.current !== runId) { setY1Fields([]); setY2Fields([]); setXField(''); return; }
    if (sortedFields.length === 0) return;
    const fieldNames = new Set(sortedFields.map(f => f.name));

    // Check for valid last selections first (user manually selected fields on this run)
    const validLastY1 = lastY1Ref.current.filter(y => fieldNames.has(y));
    const validLastY2 = lastY2Ref.current.filter(y => fieldNames.has(y));
    const hasValidLastSelection = validLastY1.length > 0 || validLastY2.length > 0;

    // When adding to existing plot: prefer the explicitly provided X and Y fields, but only if no manual selection yet
    if (!hasValidLastSelection && preferredXField && preferredYFields && preferredYFields.length > 0) {
      if (fieldNames.has(preferredXField) && preferredYFields.every(y => fieldNames.has(y))) {
        setXField(preferredXField);
        // Auto-assign new Y signals to Y1 by default
        setY1Fields(preferredYFields);
        setY2Fields([]);
        return;
      }
    }

    // Dichro mode: when dichro_monitor is active, always default to dichro_positioner1 (X) + dichro fields (Y1/Y2)
    // In z-mode (grid): xmcd first so it becomes the Z field; in 1D: xas first (Y1), xmcd (Y2)
    if (dichroMode && selectedStream === 'dichro_monitor' && fieldNames.has('dichro_xmcd')) {
      if (fieldNames.has('dichro_positioner1')) setXField('dichro_positioner1');
      if (zMode) {
        // In z-mode, only one Y field for Z selection
        setY1Fields(fieldNames.has('dichro_xmcd') ? ['dichro_xmcd'] : []);
        setY2Fields([]);
      } else {
        // In 1D mode: xas on Y1, xmcd on Y2
        setY1Fields(fieldNames.has('dichro_xas') ? ['dichro_xas'] : []);
        setY2Fields(fieldNames.has('dichro_xmcd') ? ['dichro_xmcd'] : []);
      }
      return;
    }

    let xPickCancelled = false;
    // Motor X choices are run-scoped (re-pick on every new run so multi-motor
    // scans like hkl_scan don't get the wrong axis sticky across runs).
    // Non-motor X choices (e.g. plotting against a detector for cross-run
    // comparison) stay sticky as before.
    const sameRunAsLastX = lastXRunIdRef.current === runId;
    if (lastXRef.current && fieldNames.has(lastXRef.current) &&
        (!lastXWasMotorRef.current || sameRunAsLastX)) {
      setXField(lastXRef.current);
    } else {
      // Build candidates one motor at a time, preferring the bare column over
      // sub-signals like *_setpoint when both exist. Without this, hkl_scan can
      // auto-pick huber_euler_k_setpoint over huber_euler_k because setpoint
      // values span a slightly wider range than the measured readback.
      const motorCandidates: FieldInfo[] = [];
      const seen = new Set<string>();
      for (const motor of runMotors) {
        const exact = sortedFields.find(f => f.name === motor);
        if (exact && !seen.has(exact.name)) {
          motorCandidates.push(exact);
          seen.add(exact.name);
          continue;
        }
        for (const f of sortedFields) {
          if (f.name !== 'time' && f.name.startsWith(motor + '_') && !seen.has(f.name)) {
            motorCandidates.push(f);
            seen.add(f.name);
          }
        }
      }
      if (motorCandidates.length >= 2) {
        // Multi-motor scan (e.g. hkl_scan, inner_product): pick the motor whose
        // recorded values change the most over the run. Leaves X empty until
        // the small fetch completes (~100ms); the plot-trigger effect waits on xField.
        const cached = pickedXCache.current.get(runId);
        if (cached && fieldNames.has(cached)) {
          setXField(cached);
        } else {
          setXField('');
          const fetchMotorValues = async (names: string[]): Promise<Record<string, number[]>> => {
            const subPath = dataSubNode ? `/${dataSubNode}` : '';
            if (dataNodeFamily === 'table') {
              const colParams = names.map(n => `column=${encodeURIComponent(n)}`).join('&');
              const url = `${serverUrl}/api/v1/table/full${catSeg(catalog)}/${runId}/${selectedStream}${subPath}?format=application/json&${colParams}`;
              const r = await fetch(url);
              if (!r.ok) throw new Error('fetch failed');
              return await r.json() as Record<string, number[]>;
            }
            const fieldNodeMap = new Map(fields.map(f => {
              const node = f.subNode !== undefined ? f.subNode : dataSubNode;
              const sp = node ? `/${node}` : '';
              return [f.name, `${serverUrl}/api/v1/array/full${catSeg(catalog)}/${runId}/${selectedStream}${sp}`];
            }));
            const baseDefault = `${serverUrl}/api/v1/array/full${catSeg(catalog)}/${runId}/${selectedStream}${subPath}`;
            const baseFor = (name: string) => fieldNodeMap.get(name) ?? baseDefault;
            const results = await Promise.all(names.map(async (name) => {
              const r = await fetch(`${baseFor(name)}/${name}?format=application/json`);
              return r.ok ? (await r.json() as number[]) : null;
            }));
            const data: Record<string, number[]> = {};
            names.forEach((name, i) => { if (results[i]) data[name] = results[i]!; });
            return data;
          };
          pickFastestChangingField(motorCandidates.map(f => f.name), fetchMotorValues).then(winner => {
            if (xPickCancelled) return;
            pickedXCache.current.set(runId, winner);
            setXField(winner);
          }).catch(() => {
            if (!xPickCancelled) setXField(motorCandidates[0].name);
          });
        }
      } else if (motorCandidates.length === 1) {
        setXField(motorCandidates[0].name);
      } else {
        const tokenMatch = sortedFields.find(f => f.name !== 'time' && matchesToken(f.name, runMotors));
        setXField(tokenMatch?.name ?? '');
      }
    }

    const hasImageFields = sortedFields.some(isImageField);
    const isNumeric = (f: FieldInfo) => !['S', 'U', 'string'].includes(f.dtype);

    // If user has manually selected fields on this run, always restore them
    if (hasValidLastSelection) {
      lastY1Ref.current = validLastY1;
      lastY2Ref.current = validLastY2;
      setY1Fields(validLastY1);
      setY2Fields(validLastY2);
    } else if (detectorDefault === 'last' && validLastY1.length > 0) {
      lastY1Ref.current = validLastY1;
      lastY2Ref.current = validLastY2;
      setY1Fields(validLastY1);
      setY2Fields(validLastY2);
    } else if (detectorDefault === 'hints' || (detectorDefault === 'smart' && validLastY1.length === 0)) {
      // Prefer hints detectors; fall back to full detector list
      const hintsDets = runHintsDetectors.length > 0 ? runHintsDetectors : runDetectors;
      const hintsNonImageDet = sortedFields.find(f => !isImageField(f) && isNumeric(f) && matchesDev(f.name, hintsDets) && !matchesDev(f.name, runMotors));
      // Only suppress Y auto-select when image fields exist AND hints don't point to a non-image scalar
      const firstDet = (hasImageFields && !hintsNonImageDet) ? undefined :
        hintsNonImageDet ??
        sortedFields.find(f => !isImageField(f) && isNumeric(f) && matchesDev(f.name, runDetectors) && !matchesDev(f.name, runMotors)) ??
        sortedFields.find(f => matchesDev(f.name, runDetectors));
      // Auto-assign new signals to Y1 by default
      const newY1 = firstDet ? [firstDet.name] : [];
      lastY1Ref.current = newY1;
      lastY2Ref.current = [];
      setY1Fields(newY1);
      setY2Fields([]);
    } else {
      // last mode with no prior selection: fall back to first available detector
      const firstDet = hasImageFields ? undefined :
        sortedFields.find(f => !isImageField(f) && isNumeric(f) && matchesDev(f.name, runDetectors) && !matchesDev(f.name, runMotors)) ??
        sortedFields.find(f => matchesDev(f.name, runDetectors) && !matchesDev(f.name, runMotors) && isNumeric(f)) ??
        sortedFields.find(f => matchesDev(f.name, runDetectors));
      // Auto-assign new signals to Y1 by default
      const newY1 = firstDet ? [firstDet.name] : [];
      lastY1Ref.current = newY1;
      lastY2Ref.current = [];
      setY1Fields(newY1);
      setY2Fields([]);
    }
    return () => { xPickCancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedFields, runMotors, runDetectors, runHintsDetectors, detectorDefault, runId, dichroMode, selectedStream, zMode, preferredXField, preferredYFields]);

  // In z-mode, emit the selected field whenever y1Fields[0] changes (auto-select or user click)
  useEffect(() => {
    if (zMode && y1Fields.length > 0) onZSelect?.(y1Fields[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zMode, y1Fields]);

  const selectXField = (name: string) => {
    lastXRef.current = name;
    lastXWasMotorRef.current = matchesDev(name, runMotors);
    lastXRunIdRef.current = runId;
    setXField(name);
    if (onAddTraces) handlePlot(name, y1Fields, y2Fields);
  };

  const toggleY1Field = (name: string) => {
    const next = y1Fields.includes(name) ? y1Fields.filter(n => n !== name) : [...y1Fields, name];
    lastY1Ref.current = next;
    setY1Fields(next);
    if (runAcquiring && onLivePlot) {
      // During live acquisition: re-trigger live plot with new selection; never remove traces
      if (next.length > 0 || y2Fields.length > 0) setPendingAction('live');
    } else if (onAddTraces || removedTracesRef.current) {
      if (next.length > 0 || y2Fields.length > 0) {
        removedTracesRef.current = false;
        handlePlot(xField, next, y2Fields);
      } else {
        removedTracesRef.current = true;
        onRemoveRunTraces?.(runId);
      }
    }
  };

  const toggleY2Field = (name: string) => {
    const next = y2Fields.includes(name) ? y2Fields.filter(n => n !== name) : [...y2Fields, name];
    lastY2Ref.current = next;
    setY2Fields(next);
    if (runAcquiring && onLivePlot) {
      // During live acquisition: re-trigger live plot with new selection; never remove traces
      if (y1Fields.length > 0 || next.length > 0) setPendingAction('live');
    } else if (onAddTraces || removedTracesRef.current) {
      if (y1Fields.length > 0 || next.length > 0) {
        removedTracesRef.current = false;
        handlePlot(xField, y1Fields, next);
      } else {
        removedTracesRef.current = true;
        onRemoveRunTraces?.(runId);
      }
    }
  };

  const selectAllY1 = () => {
    const allFields = sortedFields.filter(f => !onImageOpen || !isImageField(f)).map(f => f.name);
    lastY1Ref.current = allFields;
    setY1Fields(allFields);
  };

  const deselectAllY1 = () => {
    lastY1Ref.current = [];
    setY1Fields([]);
  };

  const selectAllY2 = () => {
    const allFields = sortedFields.filter(f => !onImageOpen || !isImageField(f)).map(f => f.name);
    lastY2Ref.current = allFields;
    setY2Fields(allFields);
  };

  const deselectAllY2 = () => {
    lastY2Ref.current = [];
    setY2Fields([]);
  };

  const applyI0 = (y: number[], i0: number[]): number[] =>
    y.map((v, i) => (i0[i] !== 0 && i0[i] != null ? v / i0[i] : v));

  const fetchAllTraces = async (x: string, y1s: string[], y2s: string[], i0 = i0Field): Promise<XYTrace[]> => {
    const subPath = dataSubNode ? `/${dataSubNode}` : '';
    const allYs = [...y1s, ...y2s];
    
    if (dataNodeFamily === 'table') {
      const resp = await fetch(`${serverUrl}/api/v1/table/full${catSeg(catalog)}/${runId}/${selectedStream}${subPath}?format=application/json`);
      if (resp.ok) {
        const table = await resp.json();
        const seqNums: number[] = table.seq_num ?? [];
        const nRows = seqNums.length > 0 ? (seqNums.findIndex(s => s === 0) === -1 ? seqNums.length : seqNums.findIndex(s => s === 0)) : undefined;
        const i0Data: number[] = i0 ? (nRows !== undefined ? (table[i0] ?? []).slice(0, nRows) : (table[i0] ?? [])) : [];
        const xArr = nRows !== undefined ? (table[x] ?? []).slice(0, nRows) : (table[x] ?? []);
        
        // Y1 traces: apply I0 normalization (always set rawYLabel to mark as Y1)
        const y1Traces = y1s.map(yf => {
          let yArr: number[] = nRows !== undefined ? (table[yf] ?? []).slice(0, nRows) : (table[yf] ?? []);
          if (i0 && i0Data.length > 0) yArr = applyI0(yArr, i0Data);
          const trace: any = { x: xArr, y: yArr, xLabel: x, yLabel: i0 ? `${yf}/I0` : yf, rawYLabel: yf, runLabel, runId };
          if (i0) trace.i0Label = i0;
          return trace;
        });
        
        // Y2 traces: no normalization
        const y2Traces = y2s.map(yf => {
          const yArr: number[] = nRows !== undefined ? (table[yf] ?? []).slice(0, nRows) : (table[yf] ?? []);
          return { x: xArr, y: yArr, xLabel: x, yLabel: yf, runLabel, runId };
        });
        
        return [...y1Traces, ...y2Traces];
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

    const yResps = await Promise.all(allYs.map(yf => fetch(`${baseFor(yf)}/${yf}?format=application/json`)));
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
    
    // Y1 traces: apply I0 normalization (always set rawYLabel to mark as Y1)
    const y1Traces = y1s.map((yf, idx) => {
      const y = i0 && i0Data.length > 0 ? applyI0(yDatas[idx], i0Data) : yDatas[idx];
      const trace: any = { x: xData, y, xLabel: x, yLabel: i0 ? `${yf}/I0` : yf, rawYLabel: yf, runLabel, runId };
      if (i0) trace.i0Label = i0;
      return trace;
    });
    
    // Y2 traces: no normalization
    const y2Traces = y2s.map((yf, idx) => {
      const y = yDatas[y1s.length + idx];
      return { x: xData, y, xLabel: x, yLabel: yf, runLabel, runId };
    });
    
    return [...y1Traces, ...y2Traces];
  };

  const handlePlot = async (x = xField, y1s = y1Fields, y2s = y2Fields, i0 = i0Field) => {
    if (!x || (y1s.length === 0 && y2s.length === 0) || adding) return;
    setAdding(true);
    setError('');
    try {
      const traces = await fetchAllTraces(x, y1s, y2s, i0);
      const allYs = [...y1s, ...y2s];
      const title = allYs.length === 1 ? `${allYs[0]} vs ${x}` : `${allYs.join(', ')} vs ${x}`;
      onPlot(traces, title);
    } catch (e) {
      console.error('Plot failed:', e);
      setError('Failed to fetch data');
    } finally {
      setAdding(false);
    }
  };

  const handleAddTracesPlot = async () => {
    if (!xField || (y1Fields.length === 0 && y2Fields.length === 0) || adding || !onAddTraces) return;
    setAdding(true);
    setError('');
    try {
      const traces = await fetchAllTraces(xField, y1Fields, y2Fields);
      onAddTraces(traces);
    } catch {
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
    if (!loading && xField && (y1Fields.length > 0 || y2Fields.length > 0)) {
      if (pendingGridPlot && pendingGridPlot === runId && zMode && onGridPlot) {
        // Grid plot: fires after zMode=true so auto-select has picked the right field order.
        // Emit the current Z field before opening so gridZField is set correctly.
        onZSelect?.(y1Fields[0]);
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
  }, [pendingGridPlot, pendingAction, loading, xField, y1Fields, y2Fields, selectedStream, zMode]);

  useImperativeHandle(ref, () => ({
    schedulePlot: () => setPendingAction('plot'),
    scheduleLive: () => setPendingAction('live'),
    schedulePlotOnLoad: (id: string) => { pendingPlotOnLoadRef.current = id; },
    scheduleGridPlot: (id: string) => { setPendingGridPlot(id); },
    removeY: (yLabel: string) => {
      setY1Fields(prev => {
        const next = prev.filter(y => y !== yLabel);
        lastY1Ref.current = next;
        return next;
      });
      setY2Fields(prev => {
        const next = prev.filter(y => y !== yLabel);
        lastY2Ref.current = next;
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
    if (!xField || (y1Fields.length === 0 && y2Fields.length === 0) || adding || !onLivePlot) return;
    setAdding(true);
    setError('');
    try {
      const traces = await fetchAllTraces(xField, y1Fields, y2Fields);
      const allYs = [...y1Fields, ...y2Fields];
      const title = allYs.length === 1
        ? `${allYs[0]} vs ${xField}`
        : `${allYs.join(', ')} vs ${xField}`;
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
                 disabled={y1Fields.length === 0}
                 className="px-2 py-0.5 text-xs bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
               >Plot grid</button>
               <button
                 onClick={() => onGrid1DPlot?.(selectedStream)}
                 disabled={y1Fields.length === 0}
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
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => { setPendingAction(null); handlePlot(); }}
                      disabled={!xField || (y1Fields.length === 0 && y2Fields.length === 0) || adding}
                      className="px-2 py-0.5 text-xs bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                      title="Replace plot with selected fields"
                    >{adding ? '…' : 'Plot'}</button>
                    {onAddTraces && (
                      <button
                        onClick={handleAddTracesPlot}
                        disabled={!xField || (y1Fields.length === 0 && y2Fields.length === 0) || adding}
                        className="px-2 py-0.5 text-xs bg-white border border-sky-600 text-sky-600 rounded hover:bg-sky-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                        title="Add traces to existing plot"
                      >{adding ? '…' : 'Add traces'}</button>
                    )}
                  </div>
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
               {!zMode && <col className="w-8" />}
               {!zMode && <col className="w-8" />}
               {!zMode && <col className="w-8" />}
               {zMode && <col className="w-8" />}
               <col className="w-14" />
             </colgroup>
             <thead className="sticky top-0 z-10">
               <tr>
                 <th className={thClass}>Field</th>
                 {!zMode && <th className={`${thClass} text-center`}>X</th>}
                 {!zMode ? (
                   <>
                     <th
                       className={`${thClass} text-center cursor-pointer hover:bg-gray-100`}
                       onClick={() => y1Fields.length === sortedFields.filter(f => !onImageOpen || !isImageField(f)).length ? deselectAllY1() : selectAllY1()}
                       title="Y1: Normalized by I0 (if I0 selected). Click to select/deselect all in this column."
                     >Y1</th>
                     <th
                       className={`${thClass} text-center cursor-pointer hover:bg-gray-100`}
                       onClick={() => y2Fields.length === sortedFields.filter(f => !onImageOpen || !isImageField(f)).length ? deselectAllY2() : selectAllY2()}
                       title="Y2: Raw signal (no normalization). Click to select/deselect all in this column."
                     >Y2</th>
                     <th className={`${thClass} text-center`}>I0</th>
                   </>
                 ) : (
                   <th className={`${thClass} text-center`}>Z</th>
                 )}
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
                     {!zMode ? (
                       <>
                         <td className={`${tdClass} text-center`}>
                           {!isImg && (
                             <input
                               type="checkbox"
                               checked={y1Fields.includes(f.name)}
                               onChange={() => toggleY1Field(f.name)}
                               className="accent-sky-600"
                             />
                           )}
                         </td>
                         <td className={`${tdClass} text-center`}>
                           {!isImg && (
                             <input
                               type="checkbox"
                               checked={y2Fields.includes(f.name)}
                               onChange={() => toggleY2Field(f.name)}
                               className="accent-sky-600"
                             />
                           )}
                         </td>
                         <td className={`${tdClass} text-center`}>
                           {!isImg && (
                             <input
                               type="radio"
                               name="i0Field"
                               checked={i0Field === f.name}
                               onChange={() => {
                                 setI0Field(f.name);
                                 if (onAddTraces) handlePlot(xField, y1Fields, y2Fields, f.name);
                               }}
                               onClick={() => {
                                 if (i0Field === f.name) {
                                   setI0Field('');
                                   if (onAddTraces) handlePlot(xField, y1Fields, y2Fields, '');
                                 }
                               }}
                               className="accent-sky-600"
                             />
                           )}
                         </td>
                       </>
                     ) : (
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
                         ) : (
                           <input
                             type="radio"
                             name="zField"
                             checked={y1Fields[0] === f.name}
                             onChange={() => { setY1Fields([f.name]); lastY1Ref.current = [f.name]; }}
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
                   <td colSpan={zMode ? 3 : 6} className="px-2 py-6 text-center text-xs text-gray-400">No fields found</td>
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
