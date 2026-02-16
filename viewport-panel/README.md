# Viewport - Remote Desktop Panel for Grafana

Embed live VNC, RDP, and SSH remote desktop sessions directly in your Grafana dashboards. Connect to servers, view live sessions, and take control — all without leaving your dashboard.

## Screenshots

<p>
  <img src="/grafana/public/plugins/viewport-panel/img/vnc-dashboard.png" alt="VNC Dashboard" width="30%">
  <img src="/grafana/public/plugins/viewport-panel/img/rdp-dashboard.png" alt="RDP Dashboard" width="30%">
  <img src="/grafana/public/plugins/viewport-panel/img/rdp-real-dashboard.png" alt="RDP Console - Live Connection" width="30%">
</p>

*Left to right: VNC session, RDP test container, live RDP connection to Ubuntu 24.04 (192.168.1.137).*

## Features

- **Multi-protocol support** — Connect via VNC, RDP, or SSH from a single panel
- **Small pane mode** — View a live session thumbnail embedded in your dashboard
- **Fullscreen expand** — Double-click the panel to expand to full interactive mode, then minimize back
- **Dashboard variable support** — Use Grafana template variables (`${hostname}`, `${user}`, etc.) in all connection fields
- **Auto-connect** — Optionally connect automatically when the panel loads
- **Read-only mode** — Disable keyboard and mouse input for view-only monitoring
- **Credential prompt** — Leave username/password blank to prompt users on demand

## Configuration

All options are configured in the Grafana panel editor sidebar.

| Option | Description | Default |
|---|---|---|
| **Connection Type** | Protocol to use: `VNC`, `RDP`, or `SSH` | `VNC` |
| **Guacamole URL** | Base URL of the Guacamole server | `http://localhost:8080/guacamole` |
| **Guacamole Username** | Username for Guacamole API authentication | `guacadmin` |
| **Guacamole Password** | Password for Guacamole API authentication | `guacadmin` |
| **Host** | Hostname or IP of the remote machine | — |
| **Port** | Connection port (VNC=5900, RDP=3389, SSH=22) | `5900` |
| **Username** | Target machine username (blank to prompt) | — |
| **Password** | Target machine password (blank to prompt) | — |
| **Domain** | Domain for RDP authentication (RDP only) | — |
| **Color Depth** | Color depth for VNC: 8, 16, 24, or 32-bit (VNC only) | `24` |
| **SSH Private Key** | Private key for SSH key-based auth (SSH only) | — |
| **Auto Connect** | Connect automatically when the panel loads | `false` |
| **Read Only** | Disable mouse and keyboard input (view only) | `false` |

All text fields support Grafana template variables (e.g. `${hostname}`, `${user}`, `${guac_url}`).

## How It Works

Viewport uses [Apache Guacamole](https://guacamole.apache.org/) as a clientless remote desktop gateway. The architecture has three components:

```
Grafana Panel  ──WebSocket──▶  Guacamole Server  ──native protocol──▶  Target Machine
(browser)                      (guacamole + guacd)                     (VNC/RDP/SSH)
```

1. **Grafana panel** — Runs in the browser using the `guacamole-common-js` client library. Renders the remote display on an HTML5 canvas.
2. **Guacamole server** — A Java web application that exposes a REST API and WebSocket tunnel. The panel authenticates, creates an ad-hoc connection, and opens a tunnel.
3. **guacd** — The Guacamole proxy daemon. Translates the Guacamole protocol into native VNC, RDP, or SSH protocol traffic and forwards it to the target machine.

Because all rendering happens in the browser over WebSocket, no plugins or client software are required on the user's machine.

## Requirements

- **Grafana** >= 10.0.0
- **Docker** with Docker Compose (the entire stack runs in containers)
- **Apache Guacamole** server (`guacamole/guacamole` Docker image)
- **guacd** proxy daemon (`guacamole/guacd` Docker image)
- **PostgreSQL** or MySQL for Guacamole's connection database

See the project's `docker-compose.yml` for the full stack configuration.
