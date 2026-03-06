// Plotly's default discrete color sequence
export const PLOTLY_COLORS = [
  '#636efa', '#EF553B', '#00cc96', '#ab63fa', '#FFA15A',
  '#19d3f3', '#FF6692', '#B6E880', '#FF97FF', '#FECB52',
];

export const MARKER_ICONS: Record<string, string> = {
  circle: '●',
  square: '■',
  diamond: '◆',
  'triangle-up': '▲',
  cross: '✚',
  x: '✕',
  none: '—',
};

export const CURSOR_COLORS: [string, string] = ['#3b82f6', '#ef4444'];

import type { TraceStyle } from './types';
export const DEFAULT_TRACE_STYLE: TraceStyle = {
  color: '',
  lineWidth: 2,
  lineDash: 'solid',
  markerSymbol: 'circle',
};
