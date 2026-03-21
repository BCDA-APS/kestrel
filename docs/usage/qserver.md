# QServer

The QServer panel connects to a [bluesky-queueserver](https://blueskyproject.io/bluesky-queueserver/) RE Manager and lets you submit and monitor plans without leaving the browser.

## Enabling the panel

The QServer tab is hidden by default. To enable it, open **Settings** (gear icon in the toolbar) and turn on **QServer**. The tab will appear in the top navigation bar.

## Connecting

Enter the RE Manager URL (e.g. `http://localhost:60610`) and click **Connect**. If your RE Manager requires authentication, enter your API key in the settings panel before connecting.

## Submitting plans

1. Select a plan from the plan list
2. Fill in the parameters
3. Click **Add to Queue**

The plan appears in the queue table. Click **Start** to begin execution. Enable **Auto-start** to have the queue start automatically whenever a new plan is added.

## Monitoring

The **Running Plan** section shows the currently executing plan with live status updates. The console pane streams RE Manager log output in real time.

## Queue management

- Drag rows to reorder the queue
- Select multiple rows to delete or move them in bulk
- Use **History** to review previously executed plans
