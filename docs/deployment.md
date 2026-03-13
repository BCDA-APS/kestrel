# Deployment Guide

## Overview

Kestrel is a static web app. The build step (requires Node.js) produces a `dist/` folder of plain HTML/JS/CSS files. These files can be served from APSshare so all beamlines share a single deployment — updating the files on APSshare instantly rolls out to all beamlines.

---

## One-time Setup

### 1. Build environment (development machine only)

Node.js is required only for building, not for serving. Use conda:

```bash
conda create -n kestrel nodejs
conda activate kestrel
npm install
```

### 2. Place the launcher script on APSshare

Save the following as `/APSshare/bin/kestrel` and make it executable (`chmod +x /APSshare/bin/kestrel`):

```bash
#!/bin/bash
DIST="/APSshare/kestrel/dist"
PIDFILE="/tmp/kestrel-$USER.pid"

# Kill previous instance if running
if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null
    rm "$PIDFILE"
fi

# Find a free port
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")

# Start server and record PID
python3 -m http.server "$PORT" --directory "$DIST" &>/dev/null &
echo $! > "$PIDFILE"

sleep 0.5
xdg-open "http://localhost:$PORT"
```

---

## Deploying an Update

On your development machine:

```bash
conda activate kestrel
npm run build
cp -r dist/ /APSshare/kestrel/dist/
```

That's it — all beamlines get the update the next time they run `kestrel`.

---

## Beamline User Instructions

Run from any terminal:

```bash
kestrel
```

This opens a browser with the app. No conda activation or directory navigation required. On first use, enter your Tiled server address — it will be remembered for future sessions.

---

## Per-beamline Configuration

Some beamlines may not use QServer. This can be disabled in the app via the gear icon (top right) → uncheck **Enable QServer panel**. The setting is saved in the browser and persists across sessions.
