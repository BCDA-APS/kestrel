# Kestrel: project orientation

Context for anyone working on this repository, human or AI assistant. Claude Code
reads this file automatically; other tools may need to be pointed at it.

## What this is

A browser-based visualization tool for [Tiled](https://blueskyproject.io/tiled/)
datasets produced by [Bluesky](https://blueskyproject.io/), used at APS beamlines
(currently POLAR and 8-ID).

React 18, TypeScript, Vite, Tailwind. Plotting via `react-plotly.js`. The Tiled
browser and some plot components come from `@blueskyproject/finch` (ALS).

## Running it

```bash
conda activate kestrel    # Node.js comes from conda here
npm install
npm run dev               # dev server, hot reload
npm test                  # unit tests
```

Full detail in `dev-docs/development.md`.

## Things that will trip you up

**`npm run preview` cannot reach Tiled or QServer.** The proxies are Vite plugins
registered with `configureServer`, which only runs for the dev server. To test a
production build use `npm start`, which runs `server.mjs`. Under `preview` the
interface loads and every connection fails, which looks like a bug but isn't.

**Tests cover `src/utils/` only.** `colormap`, `scanUtils`, `fieldUtils`. There are
no component tests, so a green test run says little about the UI.

**Dichro mode is POLAR-specific.** The setting auto-selects `dichro_monitor` and
`dichro_xmcd` and splits them across axes. It has no effect elsewhere.

## Layout

```
src/components/   UI panels (plots, image viewer, grid scans, QServer)
src/utils/        pure logic, the tested part
src/fitting/      curve fit models
App.tsx           root component, state, settings
server.mjs        production server: serves dist/ and proxies Tiled/QServer
```

## Documentation

- `docs/` is the user guide, published to GitHub Pages on every push to `main`.
- `dev-docs/` is for maintainers: development, deployment, QServer setup, handoff.
  Plain markdown, not published.

Deployment lives in `dev-docs/deployment.md`. Kestrel is moving from nefarian to an
IT-managed host (`watt.aps.anl.gov`), so expect that file to change.

## How this code was written

Largely AI-assisted. Treat the code as readable and conventional rather than as
carrying deep hidden intent, and prefer verifying behaviour over inferring it.
