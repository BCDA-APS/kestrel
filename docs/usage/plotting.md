# Plotting

## Creating a plot

1. In the field selector, choose an **X** field (radio button) and one or more **Y** fields (checkboxes)
2. Click **Plot** to open a new XY plot, or **+** to add traces to the current plot

Shortcuts that bypass the field selector buttons:

| Interaction | Action |
|-------------|--------|
| Double-click a run | Open a plot using previously selected or auto-selected fields |
| Alt+click a run | Same as double-click |
| Ctrl/Cmd+click a run | Add the run's traces to the current plot without replacing it |

## I0 normalization

Select an **I0** field (radio button in the field selector) to divide all Y traces by that field before plotting. The Y-axis label updates to show `field/I0`.

## Overlaying traces from multiple runs

With a plot already open, select a different run and click **+** (or Ctrl/Cmd+click the run) to add its traces to the current plot. Each run's traces are shown in a distinct color.

## Live plots

Selecting an **acquiring** run starts a live plot that polls for new data every 2 seconds. The plot freezes automatically when the run completes.
