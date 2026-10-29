# Kestrel Handoff Checklist

> **Work in progress.**

Steps to transfer maintenance of Kestrel to a new maintainer.

## Access

- [ ] Push access to `BCDA-APS/kestrel` on GitHub
- [ ] Account on the deployment host
- [ ] GitHub Pages (docs site) ownership
- [ ] Codecov access
- [ ] GitLab mirror access

## Getting running

- [ ] Clone the repo and follow `dev-docs/development.md`
- [ ] Run `npm install` and `npm run dev`, confirm the app loads
- [ ] Connect to a Tiled server and plot a scan
- [ ] Make one small visible change and see it update in the browser
- [ ] Run the test suite (`npm test`)

## Understanding the code

- [ ] Walk through `src/components/` (the UI panels)
- [ ] Walk through `src/utils/` (the tested logic: colormaps, scan reconstruction, field handling)
- [ ] Walk through `App.tsx` (state and routing)
- [ ] Review `server.mjs` and why the proxy exists
- [ ] Note current test coverage: utility modules only, no component tests

## Deployment

Kestrel is moving off nefarian to an IT-managed host. Agreed with APS IT
(David Wallis):

- Host: `watt.aps.anl.gov`
- Account: `epicsadm`
- Port: 4173 (the application default)
- Access: APS network only
- IT provides the reverse proxy and load balancer
- Final URL: to be confirmed by IT

Steps:

- [ ] Rebuild the container image from current `main`
- [ ] Deploy the image to `watt.aps.anl.gov` as `epicsadm` on port 4173
- [ ] Confirm IT has pointed the proxy at 4173
- [ ] Verify the service is reachable at the assigned URL
- [ ] Walk through restarting the service and checking it is up
- [ ] Decommission the nefarian instance (see `deployment.md`)
- [ ] Rewrite `deployment.md` for the new host
- [ ] Confirm who owns deployment going forward

## Documentation

- [ ] Review `docs/` (published user guide)
- [ ] Review `dev-docs/` (deployment, qserver setup, development)
- [ ] Add a web-application orientation if the new maintainer is new to web development
- [ ] Update the Quick Start URL in `docs/index.md` when the service moves

## Users

- [ ] Tell POLAR and 8-ID who the new contact is
- [ ] Hand over any open requests or known issues
- [ ] Shadow the next two or three user requests before stepping back
