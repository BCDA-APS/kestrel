# Plotting

## Creating a plot

1. In the field selector, choose an **X** field (radio button) and one or more **Y** fields (checkboxes)
2. Click **Plot** to open a new XY plot, **+L** to add traces to the left Y-axis of the current plot, or **+R** to add traces to the right Y-axis

Shortcuts that bypass the field selector buttons:

| Interaction | Action |
|-------------|--------|
| Double-click a run | Open a plot using previously selected or auto-selected fields |
| Ctrl/Cmd+click a run | Add the run's traces to the current plot on the left Y-axis |
| Alt+click a run | Add the run's traces to the current plot on the right Y-axis |

## I0 normalization

Select an **I0** field (radio button in the field selector) to divide all Y traces by that field before plotting. The Y-axis label updates to show `field/I0`.

## Overlaying traces from multiple runs

With a plot already open, select a different run and click **+L** (or Ctrl/Cmd+click the run) to add its traces to the left axis, or **+R** (or Alt+click the run) to add them to the right axis. Each run's traces are shown in a distinct color. Traces on the right axis show a small **R** label in the legend.

## Waterfall plot

Enable **Waterfall** in the plot toolbar to offset each trace vertically by a fixed amount, making overlapping curves easier to distinguish. Adjust the offset value with the number input that appears next to the toggle.

## Live plots

Selecting an **acquiring** run starts a live plot that polls for new data every 2 seconds. The plot freezes automatically when the run completes.

### Auto-follow

Enable **Auto-follow** in the run table toolbar to automatically select and plot each new acquiring run as it appears. Useful for monitoring a live experiment without manual clicking.

### Auto-add

When **Auto-follow** is enabled in the run list, activating the **+Add** toggle causes new live scans to accumulate on the current plot instead of replacing it. Each new run with matching positioner and detector fields adds its trace on top of the existing ones.

To prevent unbounded growth, a maximum number of traces is enforced (default: 10). Once the limit is reached the oldest trace is dropped when a new one arrives (FIFO). The limit can be changed in the settings menu (**Auto-add max traces**).
