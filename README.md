# Viewport - Grafana Remote Desktop Panel Plugin

A Grafana panel plugin that embeds VNC, RDP, and SSH remote desktop sessions directly into dashboards via Apache Guacamole.

## Why Guacamole?

Browsers can't connect to VNC, RDP, or SSH directly — those are raw network protocols that browsers simply don't speak. Guacamole acts as a **translator**: its `guacd` daemon connects to your remote servers using their native protocols and streams the display to your browser over WebSockets. Think of it as a bridge between your browser and your remote machines.

Without a server-side translator like Guacamole, remote desktop in a browser is not possible. And unlike alternatives (e.g., noVNC), Guacamole handles **all three protocols** (VNC, RDP, SSH) through a single gateway — so you don't need separate tools for each.

## Screenshots

<p>
  <img src="imgs/vnc-dashboard.png" alt="VNC Dashboard" width="30%">
  <img src="imgs/rdp-dashboard.png" alt="RDP Dashboard" width="30%">
  <img src="imgs/rdp-real-dashboard.png" alt="RDP Console - Live Connection" width="30%">
</p>

*Left to right: VNC session, RDP test container, live RDP connection to Ubuntu 24.04 (192.168.1.137).*

## Quick Start

```bash
# Start all services
docker-compose up -d

# Access Grafana at http://localhost/grafana/
# Default credentials: admin / admin

# Guacamole admin at http://localhost/guacamole/
# Default credentials: guacadmin / guacadmin
```

## Architecture

```
Browser -> Nginx (port 80) -> Grafana (panels + plugin)
                            -> Guacamole (REST API + WebSocket tunnel)
                                 -> guacd (VNC/RDP/SSH protocol translation)
                                 -> PostgreSQL (connection/user storage)
```

## Plugin Development

```bash
cd viewport-panel

# Install dependencies
npm install

# Build plugin
npm run build

# Run tests
npm test

# Dev mode (watch)
npm run dev
```

## Panel Configuration

| Option | Description |
|--------|-------------|
| Connection Type | VNC, RDP, or SSH |
| Guacamole URL | Base URL of Guacamole server |
| Host | Target machine IP/hostname |
| Port | Connection port (auto-set per protocol) |
| Username/Password | Auth credentials (or prompt on connect) |
| Auto Connect | Connect when panel loads |
| Read Only | View-only mode (no input) |

## Usage

1. Add a "Viewport" panel to your dashboard
2. Configure connection type, host, and credentials
3. Click "Connect" or enable auto-connect
4. Double-click the panel to expand to fullscreen
5. Press Escape or click "Minimize" to return to panel view
