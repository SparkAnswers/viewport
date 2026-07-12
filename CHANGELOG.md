# Changelog

## 2.2.0

### Changed

- Migrated the plugin onto Grafana's official `@grafana/create-plugin` tooling
  and repo layout (plugin at the repository root, managed `.config/` build,
  `mage`-based Go backend that emits the plugin build manifest). No behavior
  change — this is a packaging migration to pass Grafana catalog validation.
- Go backend now builds with the Go 1.26.5 toolchain (clears `govulncheck`
  advisories GO-2026-4970 and GO-2026-5856).
- Plugin version is injected from `package.json` at build time, so the release
  and the plugin metadata are always consistent.

## 2.1.0

### Features

- **Credential profiles** — reusable credentials decoupled from hosts, with an
  `allowedHosts` glob allowlist (label-aware; wildcards do not cross dots).
- **Dynamic host mode** — a panel can take just a hostname (e.g. a dashboard
  variable `${server}`) plus a credential profile, enabling fleet drill-down
  dashboards.
- **Prompt-mode credentials** — connections/profiles can require the user to
  enter credentials at connect time; they broker a single session server-side
  and are never stored or logged.

## 2.0.0

### Changed

- Converted from a panel plugin to an **app plugin** with a Go backend, per
  Grafana plugin review feedback. Credentials are stored in Grafana's encrypted
  `secureJsonData` and decrypted only by the backend; the bundled panel
  references connections by name and never holds credentials. Each session is a
  short-lived Guacamole token scoped to a single connection.

## 1.0.0

### Features

- VNC, RDP, and SSH remote desktop sessions in Grafana panels via Apache
  Guacamole. Auto-connect, read-only mode, fullscreen expand, dashboard
  template variable support.
