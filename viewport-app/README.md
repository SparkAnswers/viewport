# Viewport - Remote Desktop for Grafana

Embed live VNC, RDP, and SSH remote desktop sessions directly in your Grafana dashboards. Connect to servers, view live sessions, and take control — all without leaving your dashboard.

## Screenshots

<p>
  <img src="/grafana/public/plugins/sparkanswers-viewport-app/img/vnc-dashboard.png" alt="VNC Dashboard - Live Session" width="30%">
  <img src="/grafana/public/plugins/sparkanswers-viewport-app/img/rdp-dashboard.png" alt="RDP Dashboard - Live XFCE Desktop" width="30%">
  <img src="/grafana/public/plugins/sparkanswers-viewport-app/img/fullscreen-input.png" alt="Fullscreen with Keyboard Input" width="30%">
</p>

*Left to right: live VNC session in a dashboard, live RDP session (XFCE desktop), fullscreen mode with keyboard input reaching the remote terminal.*

## Features

- **Multi-protocol support** — Connect via VNC, RDP, or SSH from a single panel
- **Secure by design** — Connections and credentials are managed centrally on the app configuration page. Secrets are stored in Grafana's encrypted secure storage and only decrypted by the plugin backend; the panel and the dashboard JSON never contain credentials
- **Scoped session tokens** — The backend exchanges each connection server-side for a short-lived Guacamole token valid for that single connection only
- **Small pane mode** — View a live session embedded in your dashboard
- **Fullscreen expand** — Double-click the panel for full interactive mode, Escape to minimize back
- **Dashboard variable support** — Select the connection by name via template variables (e.g. `${server}`)
- **Auto-connect** — Optionally connect automatically when the panel loads
- **Read-only mode** — Disable keyboard and mouse input for view-only monitoring

## How It Works

Viewport uses [Apache Guacamole](https://guacamole.apache.org/) as a clientless remote desktop gateway:

1. **App configuration page** — Admins define the Guacamole server and named connections. Non-secret fields live in `jsonData`; passwords and private keys live in encrypted `secureJsonData`.
2. **Backend (Go)** — When a panel connects, the backend builds a [guacamole-auth-json](https://guacamole.apache.org/doc/gug/json-auth.html) payload with the connection's parameters, signs it (HMAC-SHA256) and encrypts it (AES-128-CBC) with the shared secret key, and exchanges it with Guacamole for a session token scoped to that one connection.
3. **Panel (browser)** — Receives only the token, opens the Guacamole WebSocket tunnel, and renders the remote display on an HTML5 canvas via `guacamole-common-js`. guacd translates to native VNC/RDP/SSH.

## Setup

1. Run Guacamole with the JSON auth extension enabled — set `JSON_SECRET_KEY` on the `guacamole/guacamole` container (generate a key with `openssl rand -hex 16`).
2. Install and enable the Viewport app plugin in Grafana.
3. On the app configuration page set the Guacamole URLs, the same JSON secret key, and define your connections.
4. Add Viewport panels to dashboards and pick a connection by name.

## Panel Options

| Option | Description | Default |
|---|---|---|
| **Mode** | `Connection` (named connection) or `Host` (dynamic host + credential profile) | `Connection` |
| **Connection** | Name of a connection defined in the app configuration (supports template variables) | — |
| **Host / Port / Profile** | Hostname (supports template variables like `${server}`), optional port override, and the credential profile supplying protocol + credentials | — |
| **Auto Connect** | Connect automatically when the panel loads | `false` |
| **Read Only** | Disable mouse and keyboard input (view only) | `false` |

## Credential Modes

- **Stored** — per-connection password/SSH key in Grafana's encrypted secure storage, decrypted only by the plugin backend.
- **Credential profile** — a reusable credential decoupled from any host. With the panel's Host mode, a dashboard variable can supply just the hostname and the profile provides everything else — ideal for fleet drill-down dashboards. Profiles can limit where the credential may be used via an `allowedHosts` glob allowlist.
- **Prompt** — no stored secret at all: the user is asked for credentials at connect time. They are used once to broker the session server-side, kept only in the panel's memory, and never persisted or logged.

## Requirements

- **Grafana** >= 10.4.0
- **Apache Guacamole** server (`guacamole/guacamole`) with `JSON_SECRET_KEY` configured
- **guacd** proxy daemon (`guacamole/guacd`)

A complete Docker Compose reference stack (including test VNC/RDP targets) ships with the source repository.
