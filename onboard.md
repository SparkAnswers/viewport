# Viewport - Onboarding Guide

Welcome! This guide will get you from zero to a running Viewport development environment.

## How It Works — Why Guacamole?

Browsers can only make HTTP and WebSocket connections — they cannot speak VNC, RDP, or SSH. There must be a server-side component that:

1. **Connects** to target machines using their native protocol (VNC, RDP, or SSH)
2. **Translates** the remote display into a WebSocket stream the browser can consume
3. **Relays** keyboard and mouse input back to the target machine

Guacamole's `guacd` daemon does exactly this. The user never needs to install anything — it all runs in the browser.

## Why an App Plugin?

Viewport v1 was a panel plugin with credentials in panel options. Grafana's plugin review rejected that: panel options are saved unencrypted in dashboard JSON. Viewport v2 is an **app plugin**:

```
Browser (panel)  ──▶  Grafana  ──resource API──▶  Viewport backend (Go)
                                                     │ mints scoped session token
                                                     ▼
Browser (panel)  ──WebSocket tunnel──▶  Guacamole  ──VNC/RDP/SSH──▶  targets
```

- Admins define **named connections** on the app configuration page; secrets live in Grafana's encrypted `secureJsonData` and are decrypted only by the Go backend.
- The bundled **Viewport panel** references connections by name — it has no credential options.
- At connect time, the backend exchanges the connection definition (signed + encrypted with the shared `JSON_SECRET_KEY`) for a short-lived Guacamole token scoped to that single connection.

Full details: [viewport-app/ARCHITECTURE.md](viewport-app/ARCHITECTURE.md).

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ and npm
- Go 1.24+ (for the plugin backend). The grafana-plugin-sdk-go version pinned in
  `pkg/go.mod` requires Go >= 1.26; Go's automatic toolchain download handles
  this transparently, but it needs internet access at build time and fails if
  `GOTOOLCHAIN=local` is set — install Go 1.26+ directly in locked-down CI.

## Step 1: Clone and Install

```bash
git clone <repo-url>
cd viewport

cd viewport-app
npm install
cd ..
```

## Step 2: Build the Plugin

```bash
cd viewport-app
npm run build            # frontend (webpack) + backend (go build) -> dist/
# OR, individually:
npm run build:frontend
npm run build:backend
npm run dev              # webpack watch mode (frontend only)
```

The build output goes to `viewport-app/dist/`, which is volume-mounted into the Grafana container. `dist/` contains the app plugin at the root, the nested panel plugin in `panel/`, and the backend binary `gpx_viewport_linux_amd64`.

## Step 3: Start the Stack

```bash
docker compose up -d
```

This starts 7 containers:

| Service | URL | Credentials |
|---------|-----|-------------|
| Nginx (entry point) | http://localhost | - |
| Grafana | http://localhost/grafana/ | admin / admin |
| Guacamole | http://localhost/guacamole/ | guacadmin / guacadmin |
| PostgreSQL | localhost:5432 | guacamole_user / guacamole_pass |
| guacd | localhost:4822 | - |
| test-target (VNC) | localhost:5900 | password: testpass |
| test-target-rdp (RDP) | localhost:3389 | testuser / testpass |

## Step 4: Verify Everything Works

1. Open http://localhost/grafana/ and log in with `admin` / `admin`
2. The Viewport app and demo connections are pre-provisioned (`grafana/provisioning/plugins/viewport.yaml`)
3. Open the provisioned "Viewport VNC Demo" dashboard — the panel should auto-connect to the test VNC server
4. Double-click the panel to go fullscreen, press Escape to minimize

## Step 5: Configure Your Own Connection

1. Go to **Administration → Plugins → Viewport → Configuration**
2. Check the Guacamole server settings (URL, client URL, JSON secret key)
3. Add a connection: name, protocol, host, port, credentials
4. Save — then reference the connection by name in any Viewport panel

## Credential Modes (v2.1)

Viewport supports three ways to supply credentials, all compatible with the
original stored-password behavior:

| Mode | Where the credential lives | Use it for |
|------|----------------------------|------------|
| **Stored** (default) | encrypted `secureJsonData` per connection | a fixed machine with a service account |
| **Credential profile** | one shared credential (`profilePassword.<name>`), reusable across hosts, with an `allowedHosts` glob allowlist | a fleet of like-configured machines |
| **Prompt** | nowhere — asked from the user per session, kept only in panel memory | shared dashboards where each viewer uses their own login |

**Fleet drill-down pattern** — set a panel to **Host mode**, point Host at a
dashboard variable (`${server}`), and pick a credential profile. A dropdown of
machines then drives which host the panel connects to; the profile supplies the
protocol and credential. See the provisioned "Fleet Drill-Down" dashboard.

**Prompt pattern** — set a connection's credential mode to Prompt (or enable
"Prompt credentials" on a profile). The backend answers `POST /session` with
HTTP 428 when it has no password, and the panel opens a credential dialog, then
retries with what the user typed. Nothing is persisted. See the provisioned
"Prompt Credentials" dashboard. Demo login for the RDP test container:
`testuser` / `testpass`.

The backend logic for all three modes lives in
`viewport-app/pkg/plugin/resolve.go`
(`resolveConnection` / `resolveDynamic` / `applyPrompt` / `hostAllowed`).

## Project Structure

```
viewport/
├── docker-compose.yml          # All services defined here
├── .env                        # Environment variables (credentials, URLs, JSON_SECRET_KEY)
├── nginx/
│   └── nginx.conf              # Reverse proxy config
├── db/init/initdb.sql          # Guacamole PostgreSQL schema
├── test-target/                # Test VNC server container
├── test-target-rdp/            # Test RDP server container
├── grafana/provisioning/
│   ├── plugins/viewport.yaml   # App settings + demo connections
│   └── dashboards/             # Demo dashboards
├── viewport-app/               # The Grafana app plugin
│   ├── ARCHITECTURE.md         # Design contract — read this first
│   ├── src/
│   │   ├── plugin.json         # App plugin metadata
│   │   ├── module.tsx          # App entry (config page registration)
│   │   ├── panel/              # Nested panel plugin (module.ts + plugin.json)
│   │   ├── components/         # AppConfig, ViewportPanel, GuacamoleDisplay, ...
│   │   ├── services/           # BackendService (resource API client)
│   │   └── types/
│   ├── pkg/                    # Go backend (session broker)
│   ├── tests/                  # Frontend unit tests
│   └── package.json
├── project.md                  # Original project requirements
├── grafannotes.md              # Grafana review feedback that drove the v2 redesign
└── onboard.md                  # This file
```

## Using Dashboard Variables

The panel's **Connection** option supports template variables. Create a dashboard variable (e.g. `server`) whose values are connection *names* defined in the app configuration, set the panel's Connection to `${server}`, and the panel connects to whichever connection is selected. With **Auto Connect** enabled the panel reconnects automatically when the variable changes.

## Development Workflow

### Frontend changes

1. Run `npm run dev` in `viewport-app/` (watches for changes)
2. Refresh the browser to see updates

### Backend changes

1. `npm run build:backend`
2. `docker compose restart grafana` (Grafana restarts the plugin process)

### Running Tests

```bash
cd viewport-app
npm test                  # frontend (jest) + backend (go test)
npm run test:frontend
npm run test:backend
```

## Troubleshooting

**Plugin doesn't appear in Grafana:**
- Check that `viewport-app/dist/` exists and contains `module.js`, `panel/module.js`, and `gpx_viewport_linux_amd64`
- Verify `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=sparkanswers-viewport-app,sparkanswers-viewport-panel`
- Restart Grafana: `docker compose restart grafana`, check `docker compose logs grafana`

**Panel says the connection failed:**
- Open the app configuration page and use the health check — it validates settings and Guacamole reachability
- The JSON secret key in app settings must equal `JSON_SECRET_KEY` on the guacamole container
- Verify guacd and the target are up: `docker compose logs guacd guacamole`

**RDP test container shows a black screen:**
- xrdp needs ~30s to tear down the previous session after a disconnect; an immediate
  reconnect can race it and render black. Wait half a minute and reconnect
  (`KillDisconnected=true` is already configured so stale sessions are reaped).

**WebSocket errors:**
- Check Nginx logs: `docker compose logs nginx`
- Browser dev tools → Network → WS to inspect WebSocket frames

## Contributing

1. Create a feature branch
2. Write tests first (TDD approach)
3. Run `npm test` to verify
4. Submit a PR with a description of what changed and why
