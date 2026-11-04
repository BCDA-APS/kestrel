# Connecting Kestrel to an Existing Bluesky Queue Server

Kestrel communicates with the Bluesky Queue Server via **bluesky-httpserver**, an HTTP REST API layer that sits in front of the ZMQ-based `bluesky-queueserver`. Browsers cannot speak ZMQ directly, so this HTTP layer is required.

---

## Prerequisites

- A running `bluesky-queueserver` (ZMQ sockets, typically on ports 60615 and 60625)
- A conda environment with compatible package versions (see below)

---

## 1. Install bluesky-httpserver

Compatible versions (tested):

```bash
pip install "bluesky-httpserver==0.0.13" "bluesky-queueserver-api==0.0.12"
```

> **Note:** bluesky-httpserver 0.0.14 requires bluesky-queueserver-api >= 0.0.13, which in turn requires bluesky-queueserver >= 0.0.23. If your queueserver is older (e.g. 0.0.22), use the versions above.

---

## 2. Create a permissions config file

By default, clients only get `read:status` scope, which is not enough to access queue, history, plans, or console output. Setting `QSERVER_HTTP_SERVER_CONFIG` activates full scope checking, so you must explicitly grant all needed scopes using `scopes_set` (which replaces the defaults entirely, unlike `scopes_add`, which only appends to `{read:status}`).

Copy `dev-docs/qs_permissions.yml` from this repo to your instrument directory (e.g. `scripts/qs_permissions.yml`). It grants the full set of scopes needed for Kestrel:

```yaml
api_access:
  policy: bluesky_httpserver.authorization:BasicAPIAccessControl
  args:
    roles:
      unauthenticated_public:
        scopes_set:
          - read:status
          - read:queue
          - read:history
          - read:resources
          - read:config
          - read:monitor
          - read:console
          - read:lock
          - read:testing
          - write:queue:edit
          - write:queue:control
          - write:manager:control
          - write:plan:control
          - write:execute
          - write:history:edit
```

> **Important:** Use `scopes_set`, not `scopes_add`. Using `scopes_add` with only `read:console` will leave queue, history, and plans returning 401.

---

## 3. Create a startup script

Create a script (e.g. `scripts/qs_http.sh`) in your instrument directory:

```bash
#!/bin/bash
CONDA_ENV=your_env_name
export CONDA_PREFIX=${HOME}/.conda/envs/${CONDA_ENV}
export LD_LIBRARY_PATH="${CONDA_PREFIX}/lib"

# Scopes granted to clients (see step 2)
export QSERVER_HTTP_SERVER_CONFIG=/path/to/scripts/qs_permissions.yml

# The API key Kestrel must send with each request, in the Authorization header
export QSERVER_HTTP_SERVER_SINGLE_USER_API_KEY="your-api-key"

# ZMQ addresses of the running queueserver
export QSERVER_ZMQ_CONTROL_ADDRESS="tcp://localhost:60615"
export QSERVER_ZMQ_INFO_ADDRESS="tcp://localhost:60625"

uvicorn bluesky_httpserver.server:app --host 0.0.0.0 --port 60610
```

Make it executable:

```bash
chmod +x scripts/qs_http.sh
```

### Key environment variables

| Variable | Value | Purpose |
|---|---|---|
| `QSERVER_HTTP_SERVER_CONFIG` | path to YAML file | Grants the full set of Kestrel scopes |
| `QSERVER_HTTP_SERVER_SINGLE_USER_API_KEY` | a string you choose | The key Kestrel must send to be allowed in |
| `QSERVER_ZMQ_CONTROL_ADDRESS` | `tcp://localhost:60615` | ZMQ control socket of queueserver |
| `QSERVER_ZMQ_INFO_ADDRESS` | `tcp://localhost:60625` | ZMQ info socket of queueserver |

> Pick a real value for the API key rather than leaving a placeholder, and do not commit it to the repository.

---

## 4. Start the HTTP server

On the machine running the queueserver:

```bash
conda activate your_env_name
./scripts/qs_http.sh
```

The server listens on port **60610**.

---

## 5. Connect from Kestrel

1. Open **Settings** (gear icon) and enter the API key from step 3 in the **API Key** field
2. Open the **Queue Server** tab
3. Set the HTTP URL to `http://<hostname>:60610`
4. Click **Connect**

The status bar should show the Manager state, RE state, and queue count. A 401 means the API key is missing or does not match the one in the startup script.

---

## How it works

Kestrel cannot fetch directly from the remote httpserver because of browser CORS restrictions, so requests are relayed through whichever server is serving Kestrel:

```
Browser -> /qs-proxy/http/<host>:<port>/api/... -> proxy -> http://<host>:<port>/api/...
```

In development that proxy is the Vite dev server, configured in `vite.config.ts`. In the deployed app it is `server.mjs`, which serves the built files and relays `/qs-proxy/`, `/qs-stream/` and `/tiled-proxy/`. Neither needs extra setup.
