import { useState, useEffect, useRef, useCallback } from 'react';
import Plot from 'react-plotly.js';
import type { Panel, XYTrace, TraceStyle } from '../types';
import type { FitResult } from '../fitting';
import { PLOTLY_COLORS, MARKER_ICONS, CURSOR_COLORS, DEFAULT_TRACE_STYLE } from '../constants';

type VisualizationPanelProps = {
  panel: Panel;
  onRemove: (id: string) => void;
  onRemoveTrace?: (index: number) => void;
  onStopLive?: () => void;
  onLiveTracesUpdate?: (traces: XYTrace[]) => void;
  extraTraces?: XYTrace[];
  onRemoveExtraTrace?: () => void;
  xLog?: boolean;
  yLog?: boolean;
  fitResults?: FitResult | null;
  traceStyles?: TraceStyle[];
  cursor1?: number | null;
  cursor2?: number | null;
  cursor1Y?: number | null;
  cursor2Y?: number | null;
  onPlotClick?: (dataX: number, dataY: number, cursorIdx: 0 | 1) => void;
  showCrosshair?: boolean;
  showWaterfall?: boolean;
  waterfallOffset?: number;
};

function PanelShell({ title, onRemove, id, badge, children, footer }: {
  title: string; id: string; onRemove: (id: string) => void;
  badge?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden h-full min-h-[400px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-700 truncate" title={title}>{title}</span>
          {badge}
        </div>
        <button
          onClick={() => onRemove(id)}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-2 shrink-0"
          aria-label="Close panel"
        >×</button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-2 min-h-0 relative">
        {children}
      </div>
      {footer}
    </div>
  );
}

function getEffectiveStyle(traceStyles: TraceStyle[] | undefined, i: number): TraceStyle {
  const s = traceStyles?.[i];
  if (!s) return DEFAULT_TRACE_STYLE;
  return { ...DEFAULT_TRACE_STYLE, ...s };
}

function traceMode(style: TraceStyle): 'lines' | 'markers' | 'lines+markers' {
  const hasLine = style.lineDash !== 'none';
  const hasMark = style.markerSymbol !== 'none';
  if (hasLine && hasMark) return 'lines+markers';
  if (hasMark) return 'markers';
  return 'lines';
}

type Dash = 'solid' | 'dot' | 'dash' | 'longdash' | 'dashdot' | 'longdashdot';
function plotlyDash(lineDash: string): Dash {
  if (lineDash === 'none') return 'solid';
  return lineDash as Dash;
}

function TraceChip({ t, i: _i, style, color, onRemove }: {
  t: XYTrace; i: number; style: TraceStyle; color: string;
  onRemove?: () => void;
}) {
  const hasMarker = style.markerSymbol !== 'none';
  const icon = hasMarker ? MARKER_ICONS[style.markerSymbol] : null;
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded px-1.5 py-0.5 max-w-[220px]">
      {hasMarker ? (
        <span className="shrink-0 leading-none" style={{ color, fontSize: '11px' }}>{icon}</span>
      ) : (
        <svg className="shrink-0" width="14" height="4" viewBox="0 0 14 4">
          <line x1="0" y1="2" x2="14" y2="2" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )}
      <span className="truncate">{t.runId.startsWith('__deriv__') ? t.yLabel : `${t.runLabel} (${t.runId.slice(0, 7)}) - ${t.yLabel}`}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="text-gray-400 hover:text-red-500 leading-none shrink-0"
          aria-label={`Remove ${t.yLabel}`}
        >×</button>
      )}
    </span>
  );
}

function XYPanelContent({ panel, onRemove, onRemoveTrace, onStopLive, onLiveTracesUpdate, extraTraces, onRemoveExtraTrace, xLog, yLog, fitResults, traceStyles, cursor1, cursor2, cursor1Y, cursor2Y, onPlotClick, showCrosshair, showWaterfall, waterfallOffset }: VisualizationPanelProps & { panel: Extract<Panel, { type: 'xy' }> }) {
  const [liveTraces, setLiveTraces] = useState<XYTrace[] | null>(null);
  const tracesRef = useRef(panel.traces);
  tracesRef.current = panel.traces;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [xRange, setXRange] = useState<[number, number] | undefined>();
  const [yRange, setYRange] = useState<[number, number] | undefined>();

  // Reset zoom when panel changes
  useEffect(() => { setLiveTraces(null); setXRange(undefined); setYRange(undefined); }, [panel.id]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRelayout = useCallback((e: any) => {
    if (e['xaxis.autorange'] || e['yaxis.autorange']) {
      setXRange(undefined); setYRange(undefined); return;
    }
    if (e['xaxis.range[0]'] !== undefined) {
      const x0 = e['xaxis.range[0]'], x1 = e['xaxis.range[1]'];
      setXRange(prev => (prev && prev[0] === x0 && prev[1] === x1) ? prev : [x0, x1]);
    }
    if (e['yaxis.range[0]'] !== undefined) {
      const y0 = e['yaxis.range[0]'], y1 = e['yaxis.range[1]'];
      setYRange(prev => (prev && prev[0] === y0 && prev[1] === y1) ? prev : [y0, y1]);
    }
  }, []);

  const liveConfig = panel.liveConfig;
  useEffect(() => {
    if (!liveConfig) return;
    const { serverUrl, catalog, stream, runId, dataSubNode, dataNodeFamily } = liveConfig;
    const cs = catalog ? `/${catalog}` : '';
    let cancelled = false;
    let busy = false;

    const poll = async () => {
      if (cancelled || busy) return;
      busy = true;
      try {
        const metaResp = await fetch(`${serverUrl}/api/v1/metadata${cs}/${runId}`);
        if (cancelled || !metaResp.ok) return;
        const meta = await metaResp.json();
        const isComplete = !!meta.data?.attributes?.metadata?.stop;

        const subPath = dataSubNode ? `/${dataSubNode}` : '';
        // Only poll traces that belong to the live run; other runs' traces are shown as staticTraces
        const liveRunTraces = tracesRef.current.filter(t => t.runId === runId);
        let updated: XYTrace[];
        if (dataNodeFamily === 'table') {
          const resp = await fetch(`${serverUrl}/api/v1/table/full${cs}/${runId}/${stream}${subPath}?format=application/json`);
          if (!resp.ok) return;
          const table = await resp.json();
          const seqNums: number[] = table.seq_num ?? [];
          const nRows = seqNums.length > 0 ? (seqNums.findIndex(s => s === 0) === -1 ? seqNums.length : seqNums.findIndex(s => s === 0)) : undefined;
          updated = liveRunTraces.map(trace => {
            const y = nRows !== undefined ? (table[trace.yLabel] ?? trace.y).slice(0, nRows) : (table[trace.yLabel] ?? trace.y);
            const x = nRows !== undefined ? (table[trace.xLabel] ?? trace.x).slice(0, nRows) : (table[trace.xLabel] ?? trace.x);
            return { ...trace, x, y };
          });
        } else {
          const base = `${serverUrl}/api/v1/array/full${cs}/${runId}/${stream}${subPath}`;
          updated = await Promise.all(liveRunTraces.map(async (trace) => {
            const yr = await fetch(`${base}/${trace.yLabel}?format=application/json`);
            if (!yr.ok) return trace;
            const y: number[] = await yr.json();
            const xr = await fetch(`${base}/${trace.xLabel}?format=application/json`);
            if (!xr.ok) return trace;
            const x: number[] = await xr.json();
            return { ...trace, x, y };
          }));
        }

        if (!cancelled) {
          setLiveTraces(updated);
          onLiveTracesUpdate?.(updated);
          if (isComplete) onStopLive?.();
        }
      } catch { } finally { busy = false; }
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveConfig?.runId]);

  const liveKeys = new Set(liveTraces?.map(t => `${t.runId}|${t.xLabel}|${t.yLabel}`) ?? []);
  const staticTraces = liveTraces
    ? panel.traces.filter(t => !liveKeys.has(`${t.runId}|${t.xLabel}|${t.yLabel}`))
    : [];
  const baseTraces = liveTraces ? [...liveTraces, ...staticTraces] : panel.traces;
  const rawDisplayTraces = [...baseTraces, ...(extraTraces ?? [])];
  const displayTraces = (showWaterfall && waterfallOffset)
    ? rawDisplayTraces.map((t, i) => ({ ...t, y: t.y.map(v => v + i * waterfallOffset) }))
    : rawDisplayTraces;
  const xAxisTitle = displayTraces[0]?.xLabel ?? '';
  const yAxisTitle = displayTraces.length === 1 ? displayTraces[0].yLabel : 'Value';

  const extractPlotCoords = (e: React.MouseEvent<HTMLDivElement>): [number, number] | null => {
    const plotDiv = wrapperRef.current?.querySelector('.js-plotly-plot') as any;
    if (!plotDiv?._fullLayout?.xaxis || !plotDiv?._fullLayout?.yaxis) return null;
    const { xaxis, yaxis, margin } = plotDiv._fullLayout;
    const rect = plotDiv.getBoundingClientRect();
    const ml = margin?.l ?? 70, mt = margin?.t ?? 30;
    const pixelX = e.clientX - rect.left - ml;
    const pixelY = e.clientY - rect.top - mt;
    if (pixelX < 0 || pixelX > (xaxis._length ?? Infinity)) return null;
    if (pixelY < 0 || pixelY > (yaxis._length ?? Infinity)) return null;
    const dataX = xaxis.p2l(pixelX);
    const dataY = yaxis.p2l(pixelY);
    if (!isFinite(dataX) || !isFinite(dataY)) return null;
    return [dataX, dataY];
  };

  // Right-click → C1, Alt+Right-click → C2
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!onPlotClick) return;
    const coords = extractPlotCoords(e);
    if (coords) onPlotClick(coords[0], coords[1], e.altKey ? 1 : 0);
  }, [onPlotClick]);

  // Middle-click → C2
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 1 || !onPlotClick) return;
    e.preventDefault();
    const coords = extractPlotCoords(e);
    if (coords) onPlotClick(coords[0], coords[1], 1);
  }, [onPlotClick]);

  const liveBadge = liveConfig ? (
    <span className="flex items-center gap-1 text-xs font-semibold text-red-500 shrink-0">
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      LIVE
    </span>
  ) : undefined;

  return (
    <PanelShell title={panel.title} id={panel.id} onRemove={onRemove} badge={liveBadge}>
      <div className="w-full h-full flex flex-col">
        {/* Trace chips */}
        <div className="shrink-0 flex flex-wrap gap-1 px-2 py-1 border-b border-gray-100">
          {displayTraces.map((t, i) => {
            const style = getEffectiveStyle(traceStyles, i);
            const color = style.color || PLOTLY_COLORS[i % PLOTLY_COLORS.length];
            return (
              <TraceChip
                key={i} t={t} i={i} style={style} color={color}
                onRemove={
                  t.runId.startsWith('__deriv__') ? onRemoveExtraTrace
                  : !liveConfig ? () => onRemoveTrace?.(i)
                  : !liveKeys.has(`${t.runId}|${t.xLabel}|${t.yLabel}`)
                    ? () => {
                        const idx = panel.traces.findIndex(pt => pt.runId === t.runId && pt.xLabel === t.xLabel && pt.yLabel === t.yLabel);
                        if (idx >= 0) onRemoveTrace?.(idx);
                      }
                    : undefined
                }
              />
            );
          })}
        </div>

        {/* Plot area */}
        <div
          ref={wrapperRef}
          className="flex-1 min-h-0 relative"
          onContextMenu={handleContextMenu}
          onMouseDown={handleMouseDown}
          style={{ cursor: 'crosshair' }}
        >
          <Plot
            data={[
              // Data traces
              ...displayTraces.map((t, ti) => {
                const order = t.x.map((_, i) => i).sort((a, b) => t.x[a] - t.x[b]);
                const style = getEffectiveStyle(traceStyles, ti);
                const color = style.color || PLOTLY_COLORS[ti % PLOTLY_COLORS.length];
                return {
                  x: order.map(i => t.x[i]),
                  y: order.map(i => t.y[i]),
                  mode: traceMode(style),
                  type: 'scatter' as const,
                  name: t.runId.startsWith('__deriv__') ? t.yLabel : `${t.runLabel} (${t.runId.slice(0, 7)}) - ${t.yLabel}`,
                  showlegend: false,
                  line: {
                    width: style.lineDash !== 'none' ? style.lineWidth : 0,
                    dash: plotlyDash(style.lineDash),
                    color,
                  },
                  marker: {
                    symbol: style.markerSymbol !== 'none' ? style.markerSymbol : 'circle',
                    size: style.markerSymbol !== 'none' ? 6 : 0,
                    color,
                  },
                };
              }),
              // Cursor 1 — cross marker
              ...(cursor1 != null && cursor1Y != null ? [{
                x: [cursor1], y: [cursor1Y],
                mode: 'markers' as const, type: 'scatter' as const, name: 'C1',
                showlegend: false, hoverinfo: 'skip' as const,
                marker: { symbol: 'cross-thin', size: 20, color: CURSOR_COLORS[0], line: { color: CURSOR_COLORS[0], width: 1.5 } },
              }] : []),
              // Cursor 2 — cross marker
              ...(cursor2 != null && cursor2Y != null ? [{
                x: [cursor2], y: [cursor2Y],
                mode: 'markers' as const, type: 'scatter' as const, name: 'C2',
                showlegend: false, hoverinfo: 'skip' as const,
                marker: { symbol: 'cross-thin', size: 20, color: CURSOR_COLORS[1], line: { color: CURSOR_COLORS[1], width: 1.5 } },
              }] : []),
              // Fit result
              ...(fitResults ? [{
                x: fitResults.xFit, y: fitResults.yFit,
                mode: 'lines' as const, type: 'scatter' as const,
                name: `Fit (${fitResults.model})`,
                line: { dash: 'dash' as const, width: 2, color: '#ef4444' },
                showlegend: false,
              }] : []),
            ]}
            layout={{
              autosize: true,
              margin: { l: 60, r: 30, t: 30, b: 70 },
              paper_bgcolor: 'white',
              plot_bgcolor: 'white',
              xaxis: {
                title: { text: xAxisTitle, font: { size: 12, color: '#7f7f7f' } },
                range: xRange,
                ...(xLog ? { type: 'log' as const } : {}),
                ...(showCrosshair ? { showspikes: true, spikemode: 'across', spikethickness: 1, spikecolor: '#9ca3af', spikedash: 'solid' } : {}),
              },
              yaxis: {
                title: { text: yAxisTitle, font: { size: 12, color: '#7f7f7f' } },
                range: yRange,
                ...(yLog ? { type: 'log' as const } : {}),
                ...(showCrosshair ? { showspikes: true, spikemode: 'across', spikethickness: 1, spikecolor: '#9ca3af', spikedash: 'solid' } : {}),
              },
            }}
            onRelayout={handleRelayout}
            useResizeHandler
            style={{ width: '100%', height: '100%' }}
            config={{ responsive: true }}
          />
        </div>
      </div>
    </PanelShell>
  );
}

export default function VisualizationPanel({ panel, onRemove, onRemoveTrace, onStopLive, onLiveTracesUpdate, extraTraces, onRemoveExtraTrace, xLog, yLog, fitResults, traceStyles, cursor1, cursor2, cursor1Y, cursor2Y, onPlotClick, showCrosshair, showWaterfall, waterfallOffset }: VisualizationPanelProps) {
  return <XYPanelContent panel={panel} onRemove={onRemove} onRemoveTrace={onRemoveTrace} onStopLive={onStopLive} onLiveTracesUpdate={onLiveTracesUpdate} extraTraces={extraTraces} onRemoveExtraTrace={onRemoveExtraTrace} xLog={xLog} yLog={yLog} fitResults={fitResults} traceStyles={traceStyles} cursor1={cursor1} cursor2={cursor2} cursor1Y={cursor1Y} cursor2Y={cursor2Y} onPlotClick={onPlotClick} showCrosshair={showCrosshair} showWaterfall={showWaterfall} waterfallOffset={waterfallOffset} />;
}
