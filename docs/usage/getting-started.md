# Getting Started

## Connecting to a Tiled server

1. Enter your Tiled server URL in the connection bar (e.g. `http://localhost:8000`)
2. Click **Connect**
3. Select a catalog from the dropdown — the run list will populate

## Browsing runs

The run table shows all runs in the selected catalog. Use the filter controls above the table to narrow by scan ID, plan name, detector, positioner, free text, or date range.

| Interaction | Action |
|-------------|--------|
| Click | Select the run and load its fields in the sidebar |
| Double-click or Alt+click | Open a plot (or image viewer) immediately using auto-selected fields |
| Ctrl/Cmd+click | Add the run's traces to the current plot without replacing it |

The sidebar shows three tabs for the selected run:

| Tab | Contents |
|-----|----------|
| **Summary** | Plan name, motors, detectors, point count, status |
| **Data** | Raw stream data as a searchable table |
| **Metadata** | Full run start/stop document |

### Auto-follow

Enable **Auto-follow** in the run table toolbar to automatically select and plot each new acquiring run as it appears. Useful for monitoring a live experiment without clicking.

## Center panel tabs

| Tab | Description |
|-----|-------------|
| **Graph** | XY plot or heatmap (auto-selected based on run type) |
| **Data** | Stream data table |
| **Metadata** | Run metadata browser |
| **Summary** | Run overview |

## Settings

Click the gear icon in the toolbar to open the settings panel.

### Default detector

Controls which Y field is pre-selected when you open a run:

| Mode | Behavior |
|------|----------|
| **Smart** (default) | The first time you open a scan, the hinted detector is automatically selected. If you manually select a different detector, that choice is remembered and restored the next time you open a scan of the same type. Hints are only used as a starting point when you haven't made a manual selection yet. |
| **Hints** | The hinted detector is always selected automatically, regardless of what you chose before. Useful if you always want the scan's recommended detector, but your manual selections are never remembered. |
| **Last** | Your last manual selection is always restored, regardless of hints. The first time you open a scan with no prior selection, falls back to the first available detector. Useful if you always work with the same detector across scan types. |
