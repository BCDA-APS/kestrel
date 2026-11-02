# Deployment

> **Summary:** The web app runs in a rootless Podman container on `watt.xray.aps.anl.gov` and is managed by a systemd user service. The image is built from the GitHub source, tagged with its short Git revision, and pushed to the APS GitLab registry. To deploy an update: build and test the source, push the immutable revision tag, pull that exact tag on `watt`, update the service's `KESTREL_IMAGE` value, and restart the service.

## Architecture

```
Browser 
           │  http://watt.xray.aps.anl.gov:4173
           ▼
      ┌─────────────────────────────────────────┐
      │  Podman container (Git revision tag)    │
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

The container runs on **watt** by user `epicsadm` and is accessible at:

```
http://watt.xray.aps.anl.gov:4173
```

It is managed as the rootless systemd user service `kestrel.service`, which starts
automatically after the deploying user's systemd user manager starts and restarts on failure.

> **If this URL changes,** update it in `docs/index.md` as well. The Quick Start on the
> published user site points users straight at this address, and there is nothing that
> keeps the two in sync automatically.

### Useful commands

```bash
# Check status
systemctl --user status kestrel.service

# Start / stop / restart
systemctl --user start   kestrel.service
systemctl --user stop    kestrel.service
systemctl --user restart kestrel.service

# Enable / disable auto-start
systemctl --user enable  kestrel.service
systemctl --user disable kestrel.service

# View logs, last 100 lines
journalctl --user -u kestrel.service -n 100 --no-pager
# continuous
journalctl --user -q -f -u kestrel.service
```

---

## Deploying an update

Perform the build and registry steps from a GitHub checkout. Deploy the exact same
short Git revision to `watt`; do not use a mutable `latest` tag.

```bash
git clone https://github.com/BCDA-APS/kestrel.git
cd kestrel
git checkout main
git pull --ff-only
GIT_REVISION=$(git rev-parse --short HEAD)
npm ci
npm test
npm run build
podman build --no-hosts -f Containerfile -t "kestrel:${GIT_REVISION}" .
podman run --no-hosts --rm -d --name kestrel-test -p 4173:4173 "kestrel:${GIT_REVISION}"
curl -I http://127.0.0.1:4173
podman stop kestrel-test
podman login git.aps.anl.gov:8443
podman tag "kestrel:${GIT_REVISION}" "git.aps.anl.gov:8443/bcda/kestrel:${GIT_REVISION}"
podman push "git.aps.anl.gov:8443/bcda/kestrel:${GIT_REVISION}"
```

On `watt`, pull the exact revision:

```bash
GIT_REVISION=<revision-from-the-build-session>
podman login git.aps.anl.gov:8443
podman pull "git.aps.anl.gov:8443/bcda/kestrel:${GIT_REVISION}"
```

Edit `~/.config/systemd/user/kestrel.service` and update the one clearly labeled
image line:

```ini
# Update this line when deploying a new revision.
Environment=KESTREL_IMAGE=git.aps.anl.gov:8443/bcda/kestrel:<GIT_REVISION>
```

Then reload and restart the service:

```bash
systemctl --user daemon-reload
systemctl --user restart kestrel.service
curl -I http://127.0.0.1:4173
```

The image tag in `KESTREL_IMAGE` is the deployed version. To roll back, replace it
with a previously deployed Git revision, pull that tag, and restart the service.

The production server binds to all network interfaces, so machines that can reach
`watt` on port `4173` can access it. The Vite development server defaults to
`localhost` and is not network-accessible.

## One-time setup on watt

Rootless Podman requires subordinate UID/GID ranges. Check they exist:

```bash
grep "^$USER:" /etc/subuid
grep "^$USER:" /etc/subgid
```

If either range is missing, ask an administrator to add it. After the change,
log out, log back in, and run:

```bash
podman system migrate
```

Podman storage must be on a local filesystem, not NFS. If `podman info` reports
an NFS graph root, ask an administrator to configure local storage for your
account before building images.

Create the rootless systemd user service:

```bash
mkdir -p ~/.config/systemd/user
```

Save the following as `~/.config/systemd/user/kestrel.service`. Replace
`<GIT_REVISION>` with the revision being deployed:

```ini
[Unit]
Description=Kestrel web application
Wants=network-online.target
After=network-online.target
# watt's system hostname is watt-vm.
ConditionHost=watt-vm

[Service]
# Update this line when deploying a new revision.
Environment=KESTREL_IMAGE=git.aps.anl.gov:8443/bcda/kestrel:<GIT_REVISION>

Restart=always
ExecStartPre=-/usr/bin/podman rm -f kestrel
ExecStart=/usr/bin/podman run --name kestrel --no-hosts -p 4173:4173 ${KESTREL_IMAGE}
ExecStop=/usr/bin/podman stop -t 10 kestrel
ExecStopPost=/usr/bin/podman rm -f kestrel

[Install]
WantedBy=default.target
```

Enable the service and allow it to run after logout and at boot:

```bash
systemctl --user daemon-reload
systemctl --user enable kestrel.service
loginctl enable-linger "$USER"
```

`ConditionHost` prevents this unit from starting on another host. The service
is rootless, so install it in the deploying user's systemd directory, not in
`/etc/systemd/system`.

---

## When IT takes over

The GitLab registry is the handoff point for APS IT. Provide IT with the exact
Git revision tag and the service configuration, or ask them to pull the image
and restart the deployment on their managed host.

Do not push `latest`; immutable revision tags make rollback possible.

If the public URL changes, update the Quick Start URL in `docs/index.md` so the
published user guide does not point to an inactive deployment.

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
| `failed to create new hosts file` | Rootless Podman cannot create `/etc/hosts` on the APS host | Add `--no-hosts` to `podman build` and `podman run` |

---

## Reference

| Item | Value |
|------|-------|
| Running instance | `http://watt.xray.aps.anl.gov:4173` |
| Deployment host | `watt.xray.aps.anl.gov` (system hostname: `watt-vm`) |
| GitLab registry | `git.aps.anl.gov:8443/bcda/kestrel` |
| Source code (GitHub) | `https://github.com/BCDA-APS/kestrel` |
| Systemd user service | `kestrel.service` |
| Service file | `~/.config/systemd/user/kestrel.service` |
