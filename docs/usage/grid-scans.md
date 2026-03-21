# Grid Scans

When a run was collected with a 2D grid scan plan (e.g. `grid_scan`), Kestrel automatically detects this from the run's `start.shape` and `start.hints.dimensions` metadata and shows an interactive heatmap in the **Graph** tab.

## Heatmap controls

| Interaction | Action |
|-------------|--------|
| Click | Place crosshair; updates the row and column profile plots |
| Drag | Pan |
| Scroll wheel | Zoom in/out centered on cursor |
| Shift + drag | Draw a selection box to zoom into |
| Double-click | Reset zoom to full grid |

## Cross-section plots

After clicking to place a crosshair:

- **Vertical cut** (top-right) — intensity vs. slow motor position at the selected fast motor column
- **Horizontal cut** (bottom-left) — intensity vs. fast motor position at the selected slow motor row

Click **Analyze** on either cut plot to send it to the [Analysis panel](analysis.md).

## Color maps

Select a color map from the toolbar dropdown. The choice is saved and applied to all heatmap and image views. Available palettes: viridis, plasma, inferno, magma, hot, greys, RdBu, turbo.

## Detection criteria

A run is treated as a 2D grid scan when:

- `start.shape` has exactly 2 elements, e.g. `[11, 21]`
- `start.hints.dimensions` has exactly 2 entries (one per motor axis)
