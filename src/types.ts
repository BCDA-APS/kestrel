export type XYTrace = {
  x: number[];
  y: number[];
  xLabel: string;
  yLabel: string;
  runLabel: string;
  runId: string;
};

export type XYPanel = {
  id: string;
  type: 'xy';
  traces: XYTrace[];
  title: string;
  liveConfig?: {
    serverUrl: string;
    catalog: string;
    stream: string;
    runId: string;
    dataSubNode: string;
    dataNodeFamily: 'array' | 'table';
  };
};

export type Panel = XYPanel;

export type { FitResult } from './fitting';

export type TraceStyle = {
  color: string;        // '' = use PLOTLY_COLORS[i]
  lineWidth: number;
  lineDash: 'solid' | 'dash' | 'dot' | 'dashdot' | 'none';
  markerSymbol: 'circle' | 'square' | 'diamond' | 'triangle-up' | 'cross' | 'x' | 'none';
};
