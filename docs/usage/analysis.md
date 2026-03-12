# Analysis

Click **Analyze** on any plot or cross-section cut to open it in the analysis panel.

## Axis controls

| Control | Description |
|---------|-------------|
| **Log X** | Toggle logarithmic X axis |
| **Log Y** | Toggle logarithmic Y axis |
| **Derivative** | Plot dY/dX instead of Y |
| **Smooth** | Gaussian smoothing; drag the slider to adjust the window size |

## Curve fitting

Select a fit type from the dropdown and click **Fit**:

| Type | Function |
|------|----------|
| Linear | `y = a·x + b` |
| Polynomial | `y = aₙxⁿ + … + a₀` (degree 2–5) |
| Exponential | `y = a·exp(b·x) + c` |
| Power law | `y = a·xᵇ` |

The fit curve is overlaid on the plot and the fit parameters are displayed below the controls.

## Dual cursors

Enable **Cursors** to place two vertical lines on the plot:

- Drag each cursor or click to reposition
- Enable **Snap** to lock cursors to the nearest data point
- The panel shows Δx and Δy between the two cursor positions
