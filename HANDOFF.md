# Handing Kestrel over

## Important files, in this order

1. **`CLAUDE.md`** — the orientation document. What the app is, how to run it, and
   a short list of things that will trip you up. Read first.
2. **`dev-docs/development.md`** — setup, the npm scripts, project structure,
   testing, and how the two documentation sets are built.
3. **`dev-docs/deployment.md`** — how Kestrel is containerised and served. In flux:
   the service is moving from nefarian to an IT-managed host, so expect this file
   to need rewriting once the move settles.
4. **`dev-docs/qserver-setup.md`** — connecting Kestrel to a Bluesky queue server.

The user guide is published at <https://bcda-aps.github.io/kestrel/>.

## Getting running

```bash
git clone https://github.com/BCDA-APS/kestrel.git
cd kestrel
conda create -n kestrel nodejs     # Node.js comes from conda at the APS
conda activate kestrel
npm install

npm test
npm run dev
```

## Four things that will bite you

**1. `npm run preview` cannot reach Tiled or QServer.** The proxies are Vite
plugins registered with `configureServer`, which Vite only calls for the dev
server. Under `preview` the interface loads and every connection fails, which
looks like a bug in the app. To test a production build use `npm start`, which
runs `server.mjs` and provides the same proxy routes.

**2. A green test run says very little.** The suite covers `src/utils/` only:
`colormap`, `scanUtils`, `fieldUtils`. There are no component tests, so the whole
UI layer, every plot, panel and interaction, is unverified by CI.

**3. The desktop-app command is unreliable.** See
[issue #8](https://github.com/BCDA-APS/kestrel/issues/8). The toolbar
**Open in app window** button is the reliable alternative.

**4. Dichro mode is POLAR-specific.** The setting auto-selects `dichro_monitor`
and `dichro_xmcd` and splits them across axes. It has no effect at other
beamlines, so it is harmless to leave on, but it explains field choices that look
arbitrary otherwise.

## How this project has been run

- **Reactively.** Work happens in response to beamline users, currently POLAR and
  8-ID, reporting problems or asking for something.
- **Documentation deploys automatically.** `docs.yml` publishes `docs/` to GitHub
  Pages on every push to `main`. `dev-docs/` is plain markdown and is not published.
- **Deployment is manual,** and documented in `dev-docs/deployment.md`:
  `npm run build`, `podman build`, tag, push to the APS GitLab registry, restart the
  systemd user service.
- **There is no release process.** No git tags, no changelog, and `package.json`
  has said `0.1.0` since the beginning. 


## Still to do

- Deploy the image to `watt.aps.anl.gov` as `epicsadm` on port 4173
- Verify the service is reachable at the assigned URL, and settle the question above
- Decommission the nefarian instance (`dev-docs/deployment.md`)
- Rewrite `dev-docs/deployment.md` for the new host
