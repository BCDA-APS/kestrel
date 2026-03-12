# Image Viewer

For runs containing 2D detector fields (e.g. area detectors, CCD cameras), double-clicking the run opens a canvas-based image viewer.

## Controls

| Interaction | Action |
|-------------|--------|
| Click | Place crosshair; updates row and column profiles |
| Drag | Pan |
| Scroll wheel | Zoom in/out |
| Shift + drag | Zoom to selection box |
| Double-click | Reset zoom |

## Color maps

Select a color map from the toolbar dropdown. The choice is saved and applied to all image and heatmap views. Available palettes: viridis, plasma, inferno, magma, hot, greys, RdBu, turbo.

## Cross-section plots

- **Column profile** (top-right, rotated) — intensity vs. row at the selected column; row axis is vertical so it aligns with the image
- **Row profile** (bottom-left) — intensity vs. column at the selected row

Both plots extend a dashed crosshair line to show where the slice was taken. Click **Analyze** to open a profile in the analysis panel.

## Multi-frame datasets

When a field has shape `[nFrames, H, W]`, a frame slider appears in the toolbar. Drag it to step through frames; each frame is fetched and cached on demand.
