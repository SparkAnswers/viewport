# Changelog

## [2.1.0] - 2026-07-11

### Features

- **Credential profiles** — reusable credentials decoupled from hosts, with an
  `allowedHosts` glob allowlist restricting where each credential may be used
- **Dynamic host mode** — panels can take just a hostname (e.g. a dashboard
  variable like `${server}`) plus a credential profile, enabling fleet
  drill-down dashboards with zero per-machine configuration
- **Prompt-mode credentials** — connections and profiles can require the user
  to enter credentials at connect time; they broker a single session
  server-side and are never stored or logged
- New demo dashboards: Fleet Drill-Down (variable-driven VNC consoles across
  two test boxes) and Prompt Credentials (RDP with per-user login)

## [2.0.0] - 2026-07-11

### Breaking Changes

- Converted from a panel plugin to an **app plugin** with a backend component, per Grafana plugin review feedback. The Viewport panel is now bundled inside the app.
- Panel options no longer contain connection details or credentials. Panels reference a named connection defined on the app configuration page. Existing dashboards must be updated to set the `connection` option.

### Features

- App configuration page for the Guacamole server and centrally-managed named connections
- Credentials (passwords, SSH private keys) stored in Grafana's encrypted secure storage, decrypted only by the plugin backend
- Go backend brokers sessions via the guacamole-auth-json extension: each session uses a short-lived token scoped to a single connection — the browser never sees credentials
- Backend health check validating settings and Guacamole reachability
- Template variable support for selecting the connection by name

## [1.0.0] - 2026-02-16

### Features

- VNC, RDP, and SSH remote desktop sessions in Grafana panels
- Auto-connect and read-only mode
- Fullscreen expand via double-click
- Grafana template variable support in all connection fields
- Credential prompt for on-demand authentication

### Bug Fixes

- Fixed RDP certificate validation (ignore-cert parameter)
- Fixed RDP security mode negotiation for Ubuntu 24.04 gnome-remote-desktop
