# Deployment

> **Summary:** The web app runs inside a container on a workstation called **nefarian**, which anyone on the network can reach at `http://nefarian.xray.aps.anl.gov:4173`. The container bundles the React frontend and a small Node server that acts as a middleman — it forwards browser requests to Tiled and QServer so the browser doesn't have to talk to those directly. The container is managed as a system service that starts automatically on boot and restarts if it crashes. To deploy an update: pull the latest code, rebuild the app and container, then restart the service.

## Architecture

```
Browser 
           │  http://nefarian.xray.aps.anl.gov:4173
           ▼
     ┌─────────────────────────────────────────┐
     │  Podman container (kestrel:0.1.0)       │
     │  managed by systemd user service        │
     │                                         │
     │  server.mjs (Express, port 4173)        │
     │  ├── serves dist/   (the React app)     │
     │  ├── /tiled-proxy/  → Tiled server      │
     │  ├── /qs-proxy/     → QServer HTTP      │
     │  └── /qs-stream/    → QServer SSE       │
     └─────────────────────────────────────────┘
```

**Why a Node server and not just static files?**
The React app needs to talk to Tiled and QServer, which run on different machines.
Browsers block cross-origin requests (CORS), so `server.mjs` acts as a proxy:
the browser only ever talks to one server, and that server forwards requests to
Tiled or QServer on the browser's behalf.

**Container image — two-stage build (`Containerfile`)**

| Stage | Base image | What it does |
|-------|-----------|--------------|
| Build | `ubi9/nodejs-20` | Installs deps, runs `npm run build`, prunes dev deps |
| Runtime | `ubi9/nodejs-20-minimal` | Copies only `dist/`, `server.mjs`, `node_modules`; runs as non-root (UID 1001) on port 4173 |

---

## Current setup

The container runs on **nefarian** and is accessible at:

```
http://nefarian.xray.aps.anl.gov:4173
```

It is managed as a systemd user service (`container-kestrel.service`) that starts
automatically on boot and restarts on failure.

### Useful commands

```bash
# Check status
systemctl --user status container-kestrel.service

# Start / stop / restart
systemctl --user start   container-kestrel.service
systemctl --user stop    container-kestrel.service
systemctl --user restart container-kestrel.service

# Enable / disable auto-start on reboot
systemctl --user enable  container-kestrel.service
systemctl --user disable container-kestrel.service

# View logs
journalctl --user -u container-kestrel.service -n 100 --no-pager
```

---

## Deploying an update

```bash
conda activate kestrel
cd ~/workspace/webviz
git pull
npm run build
podman build -t kestrel:0.1.0 .
systemctl --user restart container-kestrel.service
```
Here's exactly what each step does and why it results in network-wide access:

- `npm run build`: compiles the React app into static files in `dist/`

- `podman build -t kestrel:0.1.0 .`: packages everything into a container: the `dist/` folder + `server.mjs` (a custom Express server). The container exposes port `4173``.

- `systemctl --user restart container-kestrel.service`: Podman can generate systemd unit files for containers. This is what gives auto-restart and persistence across reboots.

- Why it's accessible from the network: `server.mjs` calls `http.createServer(app).listen(PORT)` without specifying a hostname, which means it binds to `0.0.0.0` (all network interfaces). So any machine that can reach nefarian on port 4173 can access it.

> **Note:** This network-wide binding only applies to the production container. `npm run dev` (Vite's dev server) defaults to `localhost` and is only accessible from the same machine. To expose the dev server on the network you would need to add `server: { host: '0.0.0.0' }` to `vite.config.ts`.

## One-time setup (nefarian or any new host)

### 1. Build environment

```bash
conda create -n kestrel nodejs
conda activate kestrel
npm install
```

### 2. Rootless Podman prerequisites

Rootless Podman requires subordinate UID/GID ranges. Check they exist:

```bash
grep "^$USER:" /etc/subuid
grep "^$USER:" /etc/subgid
```

If missing, ask an admin to add them:

```bash
sudo usermod --add-subuids 100000-165535 <username>
sudo usermod --add-subgids 100000-165535 <username>
```

Then log out, log back in, and run:

```bash
podman system migrate
```

### 3. Move Podman storage off NFS

Podman's storage must be on a local filesystem — NFS will cause build failures.
Create `~/.config/containers/storage.conf`:

```toml
[storage]
driver = "overlay"
graphroot = "/local/<username>/.local/share/containers/storage"
runroot = "/run/user/<UID>/containers"
```

> Use your real numeric UID (from `id -u`) in `runroot`. Do not use shell
> expansion like `$(id -u)` — this file does not support it.

### 4. Build and run the container

```bash
conda activate kestrel
cd ~/workspace/webviz
npm run build
podman build -t kestrel:0.1.0 .
podman run -d --name kestrel -p 4173:4173 --restart unless-stopped kestrel:0.1.0
```

Verify it is running:

```bash
podman ps --filter name=kestrel
curl -I http://127.0.0.1:4173
```

### 5. Create the systemd user service

```bash
mkdir -p ~/.config/systemd/user
podman generate systemd --name kestrel --files --new
mv container-kestrel.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now container-kestrel.service

# Allow the service to run at boot even when not logged in
loginctl enable-linger "$USER"
```

---

## When IT takes over

### Push the image to the GitLab registry

```bash
podman login git.aps.anl.gov:8443   # username & password
podman tag kestrel:0.1.0 git.aps.anl.gov:8443/bcda/kestrel:0.1.0
podman tag kestrel:0.1.0 git.aps.anl.gov:8443/bcda/kestrel:latest
podman push git.aps.anl.gov:8443/bcda/kestrel:0.1.0
podman push git.aps.anl.gov:8443/bcda/kestrel:latest
```

Then tell IT to pull the image and restart the container on their server.

### Stop the nefarian instance

Once IT's server is live, stop and disable the container on nefarian:

```bash
systemctl --user stop    container-kestrel.service
systemctl --user disable container-kestrel.service
loginctl disable-linger "$USER"
rm ~/.config/systemd/user/container-kestrel.service
systemctl --user daemon-reload
```

---

## Syncing the GitLab mirror

The GitLab project mirrors the GitHub source. Sync manually after pushing to GitHub:

```bash
cd ~/workspace/kestrel.git
git fetch origin
git push --mirror gitlab
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `no subuid ranges found` | Missing `/etc/subuid` or `/etc/subgid` entries | Add entries, then `podman system migrate` |
| `Network file system detected as backing store` | Podman `graphroot` is on NFS | Move `graphroot` to a local path in `storage.conf` |
| `EACCES: permission denied … package-lock.json` | Files copied as root in build stage | Ensure `COPY --chown=1001:0` in `Containerfile` |
| `database/runroot mismatch` | Stale Podman state after storage reconfiguration | `rm -rf /local/<username>/.local/share/containers/storage && podman info` |

---

## Reference

| Item | Value |
|------|-------|
| Running instance | `http://nefarian.xray.aps.anl.gov:4173` |
| GitLab registry | `git.aps.anl.gov:8443/bcda/kestrel` |
| Source code (GitHub) | `https://github.com/BCDA-APS/kestrel` |
| Working directory | `~/workspace/webviz` |
| GitLab mirror clone | `~/workspace/kestrel.git` |
