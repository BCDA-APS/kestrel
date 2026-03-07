import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type QueueItem = {
  item_type: string;
  name: string;
  kwargs: Record<string, unknown>;
  item_uid: string;
  status?: string;
  result?: { exit_status?: string; msg?: string; time_start?: number; time_stop?: number };
};

type PlanParam = {
  name: string;
  kind: { name: string };
  annotation?: { type?: string };
  default?: unknown;
};

type AllowedPlan = {
  name: string;
  description?: string;
  parameters?: PlanParam[];
};

type ServerStatus = {
  manager_state: string;   // 'idle' | 'executing_queue' | 'paused' | ...
  re_state: string;        // 'idle' | 'running' | 'paused' | ...
  items_in_queue: number;
  items_in_history: number;
  running_item_uid: string | null;
  worker_environment_exists: boolean;
  queue_stop_pending: boolean;
  queue_autostart_enabled: boolean;
  plan_queue_mode: { loop: boolean };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status?: string) {
  if (!status) return 'bg-gray-200 text-gray-600';
  if (status === 'completed') return 'bg-green-100 text-green-700';
  if (status === 'failed' || status === 'aborted') return 'bg-red-100 text-red-600';
  if (status === 'running') return 'bg-sky-100 text-sky-700';
  return 'bg-amber-100 text-amber-700';
}

function planColor(name: string | undefined) {
  const colors = [
    'bg-sky-100 border-sky-300 text-sky-800',
    'bg-violet-100 border-violet-300 text-violet-800',
    'bg-emerald-100 border-emerald-300 text-emerald-800',
    'bg-amber-100 border-amber-300 text-amber-800',
    'bg-rose-100 border-rose-300 text-rose-800',
  ];
  if (!name) return colors[0];
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[h % colors.length];
}

function kwargsSummary(kwargs: Record<string, unknown> | null | undefined): string {
  return Object.entries(kwargs ?? {})
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');
}

// Parse a user-typed string into a JS value (number, bool, JSON, or string)
function parseParamValue(s: string): unknown {
  const t = s.trim();
  if (t === '') return undefined;
  if (t === 'true') return true;
  if (t === 'false') return false;
  const n = Number(t);
  if (!isNaN(n) && t !== '') return n;
  try { return JSON.parse(t); } catch { return t; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function QueueCard({ item, running, onDelete }: {
  item: QueueItem;
  running: boolean;
  onDelete: () => void;
}) {
  const cls = planColor(item.name);
  return (
    <div className={`relative border rounded p-2 text-xs ${running ? 'ring-2 ring-sky-500 ' + cls : cls}`}>
      {running ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{item.name}</p>
            {Object.keys(item.kwargs ?? {}).length > 0 && (
              <p className="text-gray-500 mt-0.5 truncate">{kwargsSummary(item.kwargs)}</p>
            )}
          </div>
          <span className="shrink-0 animate-pulse text-sky-600 font-bold text-xl leading-none">▶</span>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-1">
            <span className="font-semibold flex-1 truncate">{item.name}</span>
            <button
              onClick={onDelete}
              className="shrink-0 text-gray-400 hover:text-red-500 leading-none ml-1"
              title="Remove"
            >×</button>
          </div>
          {Object.keys(item.kwargs ?? {}).length > 0 && (
            <p className="text-gray-500 mt-0.5 truncate">{kwargsSummary(item.kwargs)}</p>
          )}
        </>
      )}
    </div>
  );
}

function formatDateTime(ts: number | undefined): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const date = d.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${date} ${time}`;
}

function HistoryCard({ item }: { item: QueueItem }) {
  const cls = planColor(item.name);
  const exitStatus = item.result?.exit_status ?? item.status ?? '';
  const stopTime = formatDateTime(item.result?.time_stop);
  return (
    <div className={`border rounded p-2 text-xs ${cls}`}>
      <div className="flex items-start gap-1">
        <span className="font-semibold flex-1 truncate">{item.name}</span>
        {stopTime && <span className="shrink-0 text-[10px] text-gray-500">{stopTime}</span>}
        <span className={`shrink-0 text-[10px] px-1 py-0.5 rounded font-medium ${statusColor(exitStatus)}`}>
          {exitStatus || '?'}
        </span>
      </div>
      {Object.keys(item.kwargs ?? {}).length > 0 && (
        <p className="text-gray-500 mt-0.5 truncate">{kwargsSummary(item.kwargs)}</p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QServerPanel({ proxyUrl, serverUrl, onStatusChange }: {
  proxyUrl: string;
  serverUrl: string;
  onStatusChange?: (status: ServerStatus | null) => void;
}) {

  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [runningItem, setRunningItem] = useState<QueueItem | null>(null);
  const [history, setHistory] = useState<QueueItem[]>([]);
  const [allowedPlans, setAllowedPlans] = useState<AllowedPlan[]>([]);

  // Add item form
  const [selectedPlan, setSelectedPlan] = useState('');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [submitMsg, setSubmitMsg] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Console
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [consoleOn, setConsoleOn] = useState(true);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const consoleTextOffsetRef = useRef<number>(0);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Resize state
  const [sidebarWidth, setSidebarWidth] = useState(500);
  const [queueHeight, setQueueHeight] = useState(600);
  const [addItemHeight, setAddItemHeight] = useState(700);

  const dragSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => setSidebarWidth(Math.max(150, Math.min(window.innerWidth - 200, startW + ev.clientX - startX)));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const dragQueue = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY, startH = queueHeight;
    const onMove = (ev: MouseEvent) => setQueueHeight(Math.max(60, Math.min(window.innerHeight - 200, startH + ev.clientY - startY)));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const dragAddItem = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY, startH = addItemHeight;
    const onMove = (ev: MouseEvent) => setAddItemHeight(Math.max(80, Math.min(window.innerHeight - 150, startH + ev.clientY - startY)));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ── API helpers ──────────────────────────────────────────────────────────
  const api = useCallback(async (path: string, body?: object) => {
    const apiKey = localStorage.getItem('qsApiKey') ?? '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `ApiKey ${apiKey}`;
    const opts: RequestInit = body !== undefined
      ? { method: 'POST', headers, body: JSON.stringify(body) }
      : { method: 'GET', headers };
    const r = await fetch(`${proxyUrl}${path}`, opts);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }, [proxyUrl]);

  // ── Polling ──────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const [st, q, h] = await Promise.all([
        api('/api/status').catch(() => null),
        api('/api/queue/get').catch(() => null),
        api('/api/history/get').catch(() => null),
      ]);
      if (st) setStatus(st);
      if (q) {
        setQueue(q.items ?? []);
        setRunningItem(q.running_item?.item_uid ? q.running_item : null);
      }
      if (h) setHistory([...(h.items ?? [])].reverse());
    } catch { /* ignore */ }
  }, [api]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  // ── Allowed plans ────────────────────────────────────────────────────────
  useEffect(() => {
    api('/api/plans/allowed')
      .then(j => {
        const all: AllowedPlan[] = Object.values(j.plans_allowed ?? {}) as AllowedPlan[];
        const seen = new Set<string>();
        const plans = all.filter(p => !seen.has(p.name) && seen.add(p.name));
        plans.sort((a, b) => a.name.localeCompare(b.name));
        setAllowedPlans(plans);
        if (plans.length > 0 && !selectedPlan) setSelectedPlan(plans[0].name);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxyUrl]);

  // ── When plan changes, reset param values ────────────────────────────────
  useEffect(() => {
    const plan = allowedPlans.find(p => p.name === selectedPlan);
    if (!plan) { setParamValues({}); return; }
    const init: Record<string, string> = {};
    for (const p of plan.parameters ?? []) {
      if (p.default !== undefined && p.default !== 'no_default') {
        init[p.name] = typeof p.default === 'string' ? p.default : JSON.stringify(p.default);
      }
    }
    setParamValues(init);
  }, [selectedPlan, allowedPlans]);

  // ── Report status to parent ───────────────────────────────────────────────
  useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);

  // ── Console polling (full buffer diff via /api/console_output) ──────────────
  useEffect(() => {
    if (!consoleOn) { setWsStatus('closed'); return; }
    setWsStatus('connecting');
    consoleTextOffsetRef.current = 0;
    let running = true;
    let consecutiveErrors = 0;

    const poll = async () => {
      if (!running) return;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        let r: Response;
        try {
          r = await fetch(`${proxyUrl}/api/console_output`, { signal: controller.signal, cache: 'no-store' });
          clearTimeout(timeout);
        } catch (e) {
          clearTimeout(timeout);
          throw e;
        }
        if (!r.ok) {
          if (r.status === 401) {
            setWsStatus('closed');
            setConsoleLines(['Console unavailable: server requires read:console scope.',
              'See docs/qserver-setup.md for the permissions config.']);
            return;
          }
          throw new Error(`HTTP ${r.status}`);
        }
        const data = await r.json();
        if (!running) return;
        const text: string = data.text ?? '';
        const offset = consoleTextOffsetRef.current;
        if (text.length > offset) {
          const newText = text.slice(offset);
          const newLines = newText.split('\n').filter((l: string) => l.trim());
          if (offset === 0) {
            setConsoleLines(newLines.slice(-500));
          } else {
            setConsoleLines(prev => [...prev, ...newLines].slice(-500));
          }
          consoleTextOffsetRef.current = text.length;
        }
        consecutiveErrors = 0;
        setWsStatus('open');
      } catch {
        if (!running) return;
        consecutiveErrors++;
        if (consecutiveErrors >= 3) setWsStatus('error');
      }
      if (running) setTimeout(poll, 1000);
    };

    poll();
    return () => { running = false; };
  }, [proxyUrl, consoleOn]);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLines]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleStartRE = async () => {
    try {
      if (!status?.worker_environment_exists) {
        await api('/api/environment/open', {});
      } else {
        await api('/api/queue/start', {});
      }
      refresh();
    } catch (e) { console.error(e); }
  };

  const handleStopRE = async () => {
    try {
      if (status?.queue_stop_pending) {
        await api('/api/queue/stop/cancel', {});
      } else {
        await api('/api/queue/stop', {});
      }
      refresh();
    } catch (e) { console.error(e); }
  };

  const handleOpenEnv = async () => {
    try { await api('/api/environment/open', {}); refresh(); } catch (e) { console.error(e); }
  };

  const handleCloseEnv = async () => {
    try { await api('/api/environment/close', {}); refresh(); } catch (e) { console.error(e); }
  };

  const handleToggleAutostart = async () => {
    try {
      await api('/api/queue/autostart', { enable: !status?.queue_autostart_enabled });
      refresh();
    } catch (e) { console.error(e); }
  };

  const handleToggleLoop = async () => {
    try {
      await api('/api/queue/mode/set', { mode: { loop: !status?.plan_queue_mode?.loop } });
      refresh();
    } catch (e) { console.error(e); }
  };

  const handleAddToQueue = async () => {
    setSubmitMsg(''); setSubmitError('');
    const plan = allowedPlans.find(p => p.name === selectedPlan);
    if (!plan) return;
    const kwargs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(paramValues)) {
      const parsed = parseParamValue(v);
      if (parsed !== undefined) kwargs[k] = parsed;
    }
    try {
      const res = await api('/api/queue/item/add', {
        item: { item_type: 'plan', name: selectedPlan, kwargs },
      });
      setSubmitMsg(`Added: ${res.item?.item_uid?.slice(0, 8) ?? 'ok'}`);
      refresh();
    } catch (e) { setSubmitError(String(e)); }
  };

  const handleExecute = async () => {
    setSubmitMsg(''); setSubmitError('');
    const plan = allowedPlans.find(p => p.name === selectedPlan);
    if (!plan) return;
    const kwargs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(paramValues)) {
      const parsed = parseParamValue(v);
      if (parsed !== undefined) kwargs[k] = parsed;
    }
    try {
      await api('/api/queue/item/execute', {
        item: { item_type: 'plan', name: selectedPlan, kwargs },
      });
      setSubmitMsg('Executing…');
      refresh();
    } catch (e) { setSubmitError(String(e)); }
  };

  const handleDelete = async (uid: string) => {
    try {
      await api('/api/queue/item/remove', { item_uid: uid });
      refresh();
    } catch (e) { console.error(e); }
  };

  // ── Derived state ────────────────────────────────────────────────────────
  const isRERunning = status?.re_state === 'running';
  const isREIdle = status?.re_state === 'idle' || !status?.worker_environment_exists;
  const reState = status?.re_state ?? '—';
  const activePlan = allowedPlans.find(p => p.name === selectedPlan);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar: Queue + RE + History */}
        <div className="flex-none bg-gray-50 border-r border-gray-200 flex flex-col overflow-hidden" style={{ width: sidebarWidth }}>

          {/* Queue */}
          <div className="flex-none px-3 py-4 bg-white border-b border-gray-200 flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">
              Queue · {queue.length + (runningItem ? 1 : 0)}
            </span>
            <button
              onClick={handleToggleAutostart}
              title={status?.queue_autostart_enabled ? 'Auto-start enabled — click to disable' : 'Auto-start disabled — click to enable'}
              className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                status?.queue_autostart_enabled
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-600'
              }`}
            >Auto</button>
            <button
              onClick={handleToggleLoop}
              title={status?.plan_queue_mode?.loop ? 'Loop enabled — click to disable' : 'Loop disabled — click to enable'}
              className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                status?.plan_queue_mode?.loop
                  ? 'bg-violet-500 hover:bg-violet-400 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-600'
              }`}
            >Loop</button>
            <div className="w-px h-4 bg-gray-300 mx-1" />
            <button
              onClick={handleStartRE}
              disabled={isRERunning}
              className="text-xs px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium transition-colors"
            >Start</button>
            <button
              onClick={handleStopRE}
              disabled={isREIdle}
              className={`text-xs px-2 py-0.5 rounded font-medium transition-colors disabled:bg-gray-200 disabled:text-gray-400 ${
                status?.queue_stop_pending
                  ? 'bg-amber-400 hover:bg-amber-300 text-white ring-2 ring-amber-300 ring-offset-1 animate-pulse'
                  : 'bg-red-500 hover:bg-red-400 text-white'
              }`}
              title={status?.queue_stop_pending ? 'Stop pending — click to cancel' : 'Stop queue after current plan'}
            >{status?.queue_stop_pending ? 'Cancel Stop' : 'Stop'}</button>
          </div>

          <div className="overflow-y-auto p-2 space-y-1.5 min-h-0" style={{ height: queueHeight }}>
            {runningItem && (
              <QueueCard item={runningItem} running key={runningItem.item_uid} onDelete={() => {}} />
            )}
            {queue.map(item => (
              <QueueCard
                key={item.item_uid}
                item={item}
                running={false}
                onDelete={() => handleDelete(item.item_uid)}
              />
            ))}
            {queue.length === 0 && !runningItem && (
              <p className="text-xs text-gray-400 text-center py-4">Queue is empty</p>
            )}
          </div>

          {/* Queue/History drag handle */}
          <div
            className="flex-none h-1 cursor-row-resize bg-gray-200 hover:bg-sky-400 transition-colors"
            onMouseDown={dragQueue}
          />

          {/* RE status indicator */}
          <div className="flex-none border-t border-b border-gray-200 bg-white pl-3 pr-4 py-4 flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full shrink-0 ${
              !status?.worker_environment_exists ? 'bg-red-500' :
              isRERunning ? 'bg-sky-500 animate-pulse' : 'bg-green-500'
            }`} />
            <span className="text-sm text-gray-600 font-medium flex-1">
              {!status?.worker_environment_exists ? 'RE Env not open' : `RE: ${reState}`}
            </span>
            {status && (
              <button
                onClick={status.worker_environment_exists ? handleCloseEnv : handleOpenEnv}
                className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                  status.worker_environment_exists
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >{status.worker_environment_exists ? 'Close Env' : 'Open Env'}</button>
            )}
          </div>

          {/* History */}
          <div className="flex-none px-3 py-4 bg-white border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              History · {history.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
            {history.map(item => (
              <HistoryCard key={item.item_uid} item={item} />
            ))}
            {history.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">No history</p>
            )}
          </div>
        </div>

        {/* Vertical drag handle */}
        <div
          className="flex-none w-1 cursor-col-resize bg-gray-200 hover:bg-sky-400 transition-colors"
          onMouseDown={dragSidebar}
        />

        {/* Right main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Add Item header — height matches Queue header (py-4 + button height) */}
          <div className="flex-none px-4 py-[14px] bg-white border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Item</span>
          </div>
          {/* Add Item body */}
          <div className="overflow-y-auto bg-white border-b border-gray-200 p-4" style={{ height: addItemHeight }}>

            {allowedPlans.length === 0 ? (
              <p className="text-xs text-gray-400">
                {status ? 'No plans available — check QServer URL.' : 'Connect to a queue server to add plans.'}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Plan selector */}
                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-500 w-20 shrink-0 text-right">Plan</label>
                  <select
                    value={selectedPlan}
                    onChange={e => setSelectedPlan(e.target.value)}
                    className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-sky-400"
                  >
                    {allowedPlans.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Plan description */}
                {activePlan?.description && (
                  <p className="text-xs text-gray-400 italic pl-[5.5rem] leading-relaxed">{activePlan.description}</p>
                )}

                {/* Parameters */}
                {(activePlan?.parameters ?? []).map(param => {
                  const typeName = param.annotation?.type ?? '';
                  const hasDefault = param.default !== undefined && param.default !== 'no_default';
                  return (
                    <div key={param.name} className="flex items-center gap-3">
                      <label
                        className="text-xs text-gray-500 w-20 shrink-0 text-right truncate"
                        title={param.name}
                      >
                        {param.name}
                        {!hasDefault && <span className="text-red-400 ml-0.5">*</span>}
                      </label>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-sky-400 font-mono"
                          value={paramValues[param.name] ?? ''}
                          onChange={e => setParamValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                          placeholder={hasDefault ? String(param.default) : typeName || 'value'}
                        />
                        {typeName && (
                          <span className="text-[10px] text-gray-400 shrink-0 max-w-[120px] truncate" title={typeName}>
                            {typeName.replace(/typing\.|ophyd\.[^.]+\./g, '').replace('typing.', '')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Actions */}
                <div className="flex items-center gap-2 pl-[5.5rem]">
                  <button
                    onClick={handleAddToQueue}
                    className="text-sm bg-sky-600 hover:bg-sky-500 text-white px-4 py-1 rounded font-medium transition-colors"
                  >Add to Queue</button>
                  <button
                    onClick={handleExecute}
                    className="text-sm border border-sky-400 text-sky-700 hover:bg-sky-50 px-4 py-1 rounded font-medium transition-colors"
                  >Execute Now</button>
                  {submitMsg && <span className="text-xs text-green-600">{submitMsg}</span>}
                  {submitError && <span className="text-xs text-red-500">{submitError}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Add Item / Console drag handle */}
          <div
            className="flex-none h-1 cursor-row-resize bg-gray-300 hover:bg-sky-400 transition-colors"
            onMouseDown={dragAddItem}
          />

          {/* Console */}
          <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
            <div className="flex-none flex items-center gap-3 px-3 py-4 bg-gray-800 border-b border-gray-700">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-1">Console Output</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                wsStatus === 'open' ? 'bg-green-800 text-green-300' :
                wsStatus === 'connecting' ? 'bg-amber-800 text-amber-300' :
                wsStatus === 'error' ? 'bg-red-800 text-red-300' :
                'bg-gray-700 text-gray-400'
              }`}>{wsStatus}</span>
              <button
                onClick={async () => {
                  // Advance the offset to the current buffer end so old content won't reappear
                  try {
                    const r = await fetch(`${proxyUrl}/api/console_output`, { cache: 'no-store' });
                    if (r.ok) { const d = await r.json(); consoleTextOffsetRef.current = (d.text ?? '').length; }
                  } catch { /* ignore */ }
                  setConsoleLines([]);
                }}
                className="text-xs text-gray-500 hover:text-gray-300"
              >Clear</button>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <span className="text-xs text-gray-500">Live</span>
                <span
                  onClick={() => setConsoleOn(v => !v)}
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${consoleOn ? 'bg-sky-500' : 'bg-gray-600'}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${consoleOn ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                </span>
              </label>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs text-green-300 leading-relaxed">
              {consoleLines.length === 0 ? (
                <span className="text-gray-600">
                  {consoleOn ? 'Waiting for console output…' : 'Console paused.'}
                </span>
              ) : (
                consoleLines.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                ))
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
