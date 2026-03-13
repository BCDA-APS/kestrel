# Development

## Setup

```bash
conda activate kestrel
npm install
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run unit tests |
| `npm run test -- --coverage` | Run tests with coverage report |

## Project structure

```
src/
  components/         # React UI components
    ImagePanel.tsx        # Canvas image viewer with cross-section plots
    GridScanPanel.tsx     # 2D heatmap viewer for grid scans
    FieldSelector.tsx     # Field picker (X/Y/image) for a run
    VisualizationPanel.tsx  # XY plot with fit/derivative overlays
    AnalysisPanel.tsx     # Curve fitting, smoothing, cursors
    RunDataTab.tsx        # Stream data table
    QServerPanel.tsx      # Queue server control panel
    ...
  utils/              # Pure utility modules (unit tested)
    colormap.ts           # Color palettes and interpolation
    scanUtils.ts          # 2D grid reconstruction from flat arrays
    fieldUtils.ts         # Field classification and sort order
  App.tsx             # Root component, routing, state
```

## Testing

Unit tests cover the pure utility modules in `src/utils/`:

```bash
npm test
```

Coverage report:

```bash
npm run test -- --coverage
```

Tests are written with [Vitest](https://vitest.dev/) and run in CI on every push and pull request.

## Building the documentation

The documentation is built with [MkDocs](https://www.mkdocs.org/) and the [Material theme](https://squidfunk.github.io/mkdocs-material/).

```bash
pip install mkdocs-material
mkdocs serve        # live preview at http://127.0.0.1:8000
mkdocs build        # build static site into site/
```

Documentation is deployed automatically to GitHub Pages on every push to `main`.
