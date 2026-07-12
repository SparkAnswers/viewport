# Viewport - Grafana Remote Desktop App Plugin

A Grafana **app plugin** that embeds live VNC, RDP, and SSH remote desktop sessions directly into dashboards via Apache Guacamole — with credentials handled securely by a backend component, never stored in dashboards.

## Why an app plugin (not a panel plugin)?

Panel options are saved in plaintext inside the dashboard JSON, so a panel plugin can never hold credentials safely — this was the blocking feedback from the Grafana plugin review. Viewport v2 is therefore an app plugin:

- **Connections are managed centrally** on the app configuration page. Secrets (passwords, SSH keys) are stored in Grafana's encrypted `secureJsonData` and are only ever decrypted by the plugin backend.
- **The bundled Viewport panel has no credential options.** Its only connection setting is the *name* of a centrally-managed connection.
- **A Go backend** brokers each session: it builds the connection definition server-side and exchanges it (signed + encrypted) with Guacamole for a short-lived token scoped to that single connection. The browser only ever sees the token.

## Why Guacamole?

Browsers can't speak VNC, RDP, or SSH — those are raw network protocols. Guacamole's `guacd` daemon connects to your remote servers using their native protocols and streams the display to the browser over WebSockets. Unlike single-protocol tools (e.g. noVNC), Guacamole handles all three protocols through one gateway.

## Screenshots

<p>
  <img src="imgs/vnc-dashboard.png" alt="VNC Dashboard - Live Session" width="30%">
  <img src="imgs/rdp-dashboard.png" alt="RDP Dashboard - Live XFCE Desktop" width="30%">
  <img src="imgs/fullscreen-input.png" alt="Fullscreen with Keyboard Input" width="30%">
</p>

*Left to right: live VNC session in a dashboard, live RDP session (XFCE desktop), fullscreen mode with keyboard input typed from the browser into the remote xterm. The app configuration page is shown in [imgs/app-config.png](imgs/app-config.png).*

## Quick Start

```bash
git clone https://github.com/SparkAnswers/viewport
cd viewport
docker compose up

# Grafana:   http://localhost/grafana/   (admin / admin)
# Guacamole: http://localhost/guacamole/ (guacadmin / guacadmin)
```

That's it — no build step. Grafana downloads the Viewport plugin from the latest
GitHub release on first boot (first startup takes a couple of minutes while it
pulls the plugin, builds the test-target containers, and runs migrations). The
stack provisions the app with demo connections (`test-vnc`, `test-rdp` — live
containers in this stack) and dashboards that auto-connect to them.

**Developing the plugin?** Build it locally instead of pulling the release: in
`docker-compose.yml`, drop the `GF_INSTALL_PLUGINS` line and uncomment the
`./viewport-app/dist` mount, then `cd viewport-app && npm install && npm run build`.

## Architecture

```
Browser (panel)  ──▶  Grafana  ──resource API──▶  Viewport backend (Go)
                                                     │ mints scoped session token
                                                     ▼
Browser (panel)  ──WebSocket tunnel──▶  Guacamole ── json-auth
                                            │
                                          guacd ──VNC/RDP/SSH──▶ target machines
```

See [viewport-app/ARCHITECTURE.md](viewport-app/ARCHITECTURE.md) for the full design, including the credential flow and the backend resource API.

## Plugin Development

```bash
cd viewport-app

npm install
npm run build            # frontend + backend
npm run build:frontend   # webpack only
npm run build:backend    # Go backend only (requires Go 1.24+)
npm test                 # jest + go test
npm run dev              # webpack watch mode
```

## Configuration

1. **App settings** (Administration → Plugins → Viewport → Configuration):
   - Guacamole server URL (server-side) and client tunnel URL (browser-side)
   - JSON secret key — must match the `JSON_SECRET_KEY` env of the Guacamole container (generate with `openssl rand -hex 16`)
   - Named connections (protocol, host, port, credentials)
2. **Panel options** (per dashboard panel):

| Option | Description |
|--------|-------------|
| Mode | `Connection` (named connection) or `Host` (dynamic host + credential profile) |
| Connection | Name of a centrally-managed connection (supports dashboard variables) — Connection mode |
| Host / Port / Profile | Hostname (supports variables, e.g. `${server}`), optional port, and the credential profile that supplies protocol + credentials — Host mode |
| Auto Connect | Connect when the panel loads |
| Read Only | View-only mode (no input) |

**Three ways to handle credentials:**

1. **Stored** (default) — the connection's password lives in Grafana's encrypted storage, decrypted only by the backend.
2. **Credential profile** — one shared credential reused across a fleet of hosts. Combine with Host mode and a dashboard variable to build drill-down dashboards: pick a machine from a dropdown and the session just works. Profiles can restrict usable hosts via an `allowedHosts` glob list.
3. **Prompt** — nothing stored anywhere: the user is asked for credentials at connect time; they broker one session server-side and are kept only in the panel's memory.

Demo dashboards for all three ship with the stack (`Fleet Drill-Down`, `Prompt Credentials`, and the original VNC/RDP consoles).

## Usage

1. Define connections on the Viewport app configuration page
2. Add a "Viewport" panel to your dashboard and pick a connection
3. Click "Connect" or enable auto-connect
4. Double-click the panel to expand to fullscreen; Escape to return
