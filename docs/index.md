# Kestrel

**Kestrel** is a browser-based visualization tool for [Tiled](https://blueskyproject.io/tiled/) datasets produced by [Bluesky](https://blueskyproject.io/).

BCDA, Advanced Photon Source, Argonne National Laboratory

---

## Features

- **XY plots** — select X/Y fields from any stream; overlay multiple traces across runs
- **Live plots** — automatic updates during acquisition by polling every 2 seconds
- **2D grid scan heatmap** — auto-detected from run hints; pan, zoom, and cross-section cuts
- **Image viewer** — canvas-based viewer for 2D detector frames with row/column profiles
- **Analysis tools** — log axes, derivatives, smoothing, curve fitting, dual cursors
- **QServer integration** — submit and monitor plans from the bluesky queue server
- **Run browser** — searchable run table with metadata, summary, and raw data tabs

---

## Quick Start

Open Kestrel at:

```
http://nefarian.xray.aps.anl.gov:4173
```

Enter your Tiled server URL, click **Connect**, and select a catalog.

See [Getting Started](usage/getting-started.md) for a walkthrough.
