# Development

How to set up Kestrel locally, build it, run the tests, and build the documentation.

## Prerequisites

- Node.js 18+ and npm
- Git

At the APS, the recommended way to get Node.js is via conda:

```bash
conda create -n kestrel nodejs
conda activate kestrel
```

## Local setup

```bash
git clone https://github.com/BCDA-APS/kestrel.git
cd kestrel
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`), enter your Tiled server URL, and connect.

> If you installed Node.js via conda, activate the environment first: `conda activate kestrel`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the built files only, without the Tiled/QServer proxy (the app loads but cannot connect) |
| `npm start` | Run the production server (`node server.mjs`) — serves the built app and proxies Tiled/QServer |
| `npm test` | Run unit tests |
| `npm run test -- --coverage` | Run tests with coverage report |

## Production build

```bash
npm run build
npm start          # serves the built app at http://localhost:4173
```

`npm run build` writes the finished app into `dist/`. Those files are not enough on their own: the app
also has to reach Tiled and QServer, which run on other machines, and browsers block that kind of
cross-machine request. `server.mjs` solves this by serving `dist/` and relaying the app's requests to
Tiled and QServer, so everything appears to come from one place. `npm start` runs it, and the
containerized deployment does the same thing, described in [deployment.md](deployment.md).

> `npm run preview` only serves the files in `dist/`. The interface will load, but it cannot reach Tiled
> or QServer, so use `npm start` to test a production build.

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

There are **two separate sets of documentation** in this repository:

- **`docs/`** — the user-facing guide, published as a website to GitHub Pages. Built with
  [MkDocs](https://www.mkdocs.org/) and the [Material theme](https://squidfunk.github.io/mkdocs-material/),
  configured in `mkdocs.yml`.
- **`dev-docs/`** — engineer/maintainer documentation (this file, deployment, operations, etc.). Plain
  markdown, **not** part of the MkDocs site; read it directly on GitHub.

To work on the user site:

```bash
pip install mkdocs-material
mkdocs serve        # live preview at http://127.0.0.1:8000
mkdocs build        # build static site into site/
```

The user site is deployed automatically to GitHub Pages on every push to `main` (via
`.github/workflows/docs.yml`). The `dev-docs/` folder requires no build step.
