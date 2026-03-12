# QServer

The QServer panel connects to a [bluesky-queueserver](https://blueskyproject.io/bluesky-queueserver/) RE Manager and lets you submit and monitor plans without leaving the browser.

## Enabling the panel

Click the **QServer** tab in the top navigation bar. Enter the RE Manager URL (e.g. `http://localhost:60610`) and click **Connect**.

## Submitting plans

1. Select a plan from the plan list
2. Fill in the parameters
3. Click **Add to Queue**

The plan appears in the queue table. Click **Start** to begin execution.

## Monitoring

The **Running Plan** section shows the currently executing plan with live status updates. The console pane streams RE Manager log output in real time.

## Queue management

- Drag rows to reorder the queue
- Select multiple rows to delete or move them in bulk
- Use **History** to review previously executed plans and export results
