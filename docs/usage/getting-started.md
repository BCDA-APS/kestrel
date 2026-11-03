# Getting Started

## Connecting to a Tiled server

1. Enter your Tiled server URL in the connection bar (e.g. `http://localhost:8000`)
2. Click **Connect**
3. Select a catalog from the dropdown — the run list will populate

## Browsing runs

The run table shows all runs in the selected catalog. Use the filter controls above the table to narrow by scan ID, plan name, detector, positioner, free text, or date range.

| Interaction | Action |
|-------------|--------|
| Click | Select the run and load its fields into the field selector |
| Double-click | Open a plot (or image viewer) immediately using auto-selected fields |
| Ctrl/Cmd+click | Add the run's traces to the current plot on the left Y-axis |
| Alt+click | Add the run's traces to the current plot on the right Y-axis |

### Auto-follow

Enable **Auto-follow** in the run table toolbar to automatically select and plot each new acquiring run as it appears. Useful for monitoring a live experiment without clicking.

## Center panel

Clicking a run populates the center panel. Use the tabs at the top to switch views:

| Tab | Description |
|-----|-------------|
| **Graph** | XY plot or heatmap (auto-selected based on run type) |
| **Summary** | Plan name, motors, detectors, point count, status |
| **Data** | Raw stream data as a searchable table |
| **Metadata** | Full run start/stop document |

## Settings

Click the gear icon in the toolbar to open the settings panel.

### Default detector

Controls which Y field is pre-selected when you open a run:

| Mode | Behavior |
|------|----------|
| **Smart** (default) | The first time you open a scan, the hinted detector is automatically selected. If you manually select a different detector, that choice is remembered and restored the next time you open a scan of the same type. Hints are only used as a starting point when you haven't made a manual selection yet. |
| **Hints** | The hinted detector is always selected automatically, regardless of what you chose before. Useful if you always want the scan's recommended detector, but your manual selections are never remembered. |
| **Last** | Your last manual selection is always restored, regardless of hints. The first time you open a scan with no prior selection, falls back to the first available detector. Useful if you always work with the same detector across scan types. |

### Dichro mode

This currently applies to POLAR only. At other beamlines the setting has no
effect, so it is harmless to leave on.

When enabled (the default), Kestrel automatically selects the `dichro_monitor`
and `dichro_xmcd` fields for dichroism scans and puts them on separate axes: xas
on the left Y-axis, xmcd on the right. Turn it off if you would rather choose
fields yourself.

### Desktop app mode

Click the **Open in app window** button in the toolbar to reopen Kestrel in a
slimmer window: no browser header, no tabs, no bookmarks bar, just the URL. The
new window keeps your current session, so there is no need to reconnect.

The settings panel also offers a command you can copy and run in a terminal. It
gives an even slimmer window, without the URL bar, and requires Chrome or Edge.
Treat it as a work in progress: it works most of the time, but not always.

### Auto-add max traces

Sets how many traces accumulate on a plot when **Auto-add** is active. See
[Plotting](plotting.md).
