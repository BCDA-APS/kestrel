# QServer

The QServer panel connects to a [bluesky-queueserver](https://blueskyproject.io/bluesky-queueserver/) RE Manager and lets you submit and monitor plans without leaving the browser.

## Enabling the panel

The QServer tab is hidden by default. To enable it, open **Settings** (gear icon in the toolbar) and turn on **QServer**. The tab will appear in the top navigation bar.

## Connecting

Enter the RE Manager URL (e.g. `http://localhost:60610`) and click **Connect**. If your RE Manager requires authentication, enter your API key in the settings panel before connecting.

## RE environment

The **Open Env / Close Env** button in the toolbar opens or closes the RE worker environment. The environment must be open before plans can run.

## Submitting plans

1. Select a plan from the plan list
2. Fill in the parameters
3. Click **Add to Queue**

When editing an existing queue item (see below), the form switches to update mode — click **Update** to apply the changes.

## Queue management

The queue toolbar contains:

| Button | Action |
|--------|--------|
| **Start** | Start queue execution |
| **Stop** | Stop the queue after the current plan finishes; click again (**Cancel Stop**) to cancel the pending stop |
| **Auto** | Toggle auto-start: the queue starts automatically when a new plan is added |
| **Loop** | Toggle loop mode: the queue repeats continuously from the beginning when it finishes |
| **Clear** | Remove all items from the queue |

Each queue item has per-item controls:

| Control | Action |
|---------|--------|
| ✎ | Edit the plan parameters (loads it back into the form) |
| ⧉ | Duplicate the item and append the copy to the queue |
| × | Remove the item |

Drag queue items to reorder them. Click to select; use the arrow buttons (⇈ ↑ ↓ ⇊) that appear when items are selected to move them in bulk.

## RE controls

While a plan is running, the **Running Plan** panel shows the active plan and its Bluesky run UIDs. RE state controls appear contextually:

| Button | When visible | Action |
|--------|-------------|--------|
| **Pause** | RE running | Request a deferred pause at the next checkpoint |
| **Resume** | RE paused | Resume the paused plan |
| **Abort** | RE paused | Abort the paused plan |

## History

Completed plans appear in the **History** list. Each item shows its exit status and timestamp. Click ⧉ on a history item to copy it back to the queue.

- **Save** — download the full history as a CSV file
- **Clear** — remove all history entries

## Console

The console pane streams RE Manager log output in real time.
