# Viewport — Remote Desktop for Grafana

Embed live **VNC, RDP, and SSH** remote desktop sessions directly in your Grafana
dashboards. View a machine's console next to its metrics, click to take control,
and expand to fullscreen — all without leaving Grafana.

## Screenshots

![VNC session in a dashboard](https://raw.githubusercontent.com/SparkAnswers/viewport/main/imgs/vnc-dashboard.png)
![Live RDP desktop](https://raw.githubusercontent.com/SparkAnswers/viewport/main/imgs/rdp-dashboard.png)
![Fullscreen with keyboard input](https://raw.githubusercontent.com/SparkAnswers/viewport/main/imgs/fullscreen-input.png)

## Features

- **Multi-protocol** — VNC, RDP, and SSH from a single panel, via Apache Guacamole.
- **Secure by design** — connections and credentials are managed centrally on the
  app configuration page. Secrets are stored in Grafana's encrypted storage and
  decrypted only by the plugin's backend; the panel and the dashboard JSON never
  contain credentials.
- **Scoped session tokens** — the backend exchanges each connection server-side
  for a short-lived Guacamole token valid for that one connection only.
- **Three credential modes:**
  - *Stored* — a fixed credential per connection, encrypted at rest.
  - *Credential profile* — one shared credential reused across a fleet of hosts.
    Combine with **Host mode** and a dashboard variable to build drill-down
    dashboards: pick a machine from a dropdown and the console just connects.
    Profiles can restrict where a credential may be used via an `allowedHosts`
    allowlist.
  - *Prompt* — nothing stored anywhere; the user is asked for credentials at
    connect time and they are kept only in the panel's memory.
- **Fullscreen** — double-click to expand to full interactive mode, Escape to
  return; **read-only** mode for view-only monitoring; **auto-connect** on load.
- **Dashboard variables** — select the connection or host by name via template
  variables (e.g. `${server}`).

## How it works

Browsers can't speak VNC, RDP, or SSH, so Viewport uses
[Apache Guacamole](https://guacamole.apache.org/) as a clientless gateway:

```
Browser (panel) -> Grafana -> Viewport backend (Go)  [mints a scoped session token]
Browser (panel) -> Guacamole (WebSocket tunnel) -> guacd -> VNC/RDP/SSH targets
```

The backend builds a signed, encrypted [guacamole-auth-json](https://guacamole.apache.org/doc/gug/json-auth.html)
payload for a single connection and exchanges it for a short-lived token; the
browser receives only the token and opens the Guacamole WebSocket tunnel.

## Requirements

- Grafana **>= 10.4.0**
- An **Apache Guacamole** server (`guacamole/guacamole`) with `JSON_SECRET_KEY` set
- The **guacd** proxy daemon (`guacamole/guacd`)

## Getting started

1. Run an Apache Guacamole server (`guacamole/guacamole` + `guacd`) with the
   JSON-auth extension enabled — set `JSON_SECRET_KEY` on the Guacamole container
   (generate one with `openssl rand -hex 16`).
2. Install and enable the **Viewport** app plugin in Grafana.
3. On the app's **Configuration** page set the Guacamole server URL, the same JSON
   secret key, and define your connections (or a credential profile).
4. Add a **Viewport** panel to a dashboard and pick a connection.

A complete Docker Compose reference stack — Grafana, Guacamole, guacd, and test
VNC/RDP targets with demo dashboards — is available in the
[source repository](https://github.com/SparkAnswers/viewport).

## Documentation

Full architecture and configuration details are in
[ARCHITECTURE.md](https://github.com/SparkAnswers/viewport/blob/main/ARCHITECTURE.md)
in the source repository.
