# Plotting

## Creating a plot

1. In the field table, select an **X** field (radio button) and one or more **Y** fields (checkboxes)
2. Click **Plot** to open a new XY plot
3. Click **+** to add traces to an existing plot without replacing it

Double-clicking a run in the run table opens a plot automatically using the previously selected fields.

## Overlaying traces from multiple runs

With a plot already open, select a different run and click **+** to add its traces to the current plot. Each run's traces are shown in a distinct color.

## Live plots

Selecting an **acquiring** run starts a live plot that updates in real time as new data points arrive. The plot freezes automatically when the run completes.

!!! note
    Live data is streamed via SSE (Server-Sent Events) through the Tiled server. The connection indicator in the toolbar shows the current status.
