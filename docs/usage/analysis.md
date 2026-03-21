# Analysis

Click **Analyze** on any plot or cross-section cut to open it in the analysis panel.

## Axis controls

| Control | Description |
|---------|-------------|
| **Log X** | Toggle logarithmic X axis |
| **Log Y** | Toggle logarithmic Y axis |
| **Derivative** | Plot dY/dX instead of Y; use **Smooth** to pre-smooth before differentiating, and **Normalize** to scale the derivative to the same range as the source |
| **Smooth** | Gaussian smoothing window applied before plotting or differentiating (1–99 points) |

## Trace style

Select a trace in the legend to customize its appearance:

| Control | Options |
|---------|---------|
| Line style | None, Solid, Dash, Dot, Dash-dot |
| Line width | 1–6 |
| Marker | Circle, Square, Diamond, Triangle, Cross, X, None |
| Color | Custom color picker; click **Reset** to restore the default palette color |

## Statistics

The panel displays statistics for the active trace (or the region between cursors when both are placed): peak position, peak value, min, max, mean, standard deviation, center of mass, and FWHM.

## Curve fitting

Select a model from the dropdown and click **Fit**. Enable **Fit between cursors** to restrict the fit to the data between C1 and C2.

| Model | Function |
|-------|----------|
| **Linear** | `y = m·x + b` |
| **Quadratic** | `y = c₀ + c₁·x + c₂·x²` |
| **Cubic** | `y = c₀ + c₁·x + c₂·x² + c₃·x³` |
| **Gaussian** | `y = A·exp(−(x−μ)²/2σ²) + offset` |
| **Negative Gaussian** | `y = −A·exp(−(x−μ)²/2σ²) + offset` |
| **Lorentzian** | `y = A·γ²/((x−μ)²+γ²) + offset` |
| **Negative Lorentzian** | `y = −A·γ²/((x−μ)²+γ²) + offset` |
| **Exponential** | `y = A·exp(−d·x) + offset` |
| **Error Function** | `y = A·erf((x−μ)/σ) + offset` |
| **Top Hat** | Step function: rise at `left`, fall at `right`, with Gaussian-smoothed edges |

The fit curve is overlaid on the plot. Fit parameters and an R² quality score are displayed below the controls.

## Dual cursors

Place cursors directly on the plot:

| Action | Cursor |
|--------|--------|
| Right-click on plot | Place C1 |
| Alt+Right-click on plot | Place C2 |
| Middle-click on plot | Place C2 |

Enable **Snap** to lock cursors to the nearest data point on the active trace. The panel shows Δx, Δy, and the midpoint between C1 and C2.

## Panel position

Click the dock button in the analysis panel header to toggle between docking on the right side and docking at the bottom of the screen.
