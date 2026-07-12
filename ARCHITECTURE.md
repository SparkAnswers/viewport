# Viewport App Plugin — Architecture

Viewport is a Grafana **app plugin** with a backend component. This design exists
because of Grafana plugin review feedback: a panel plugin must never store
credentials in panel options (they are saved in plaintext in the dashboard JSON).

## Components

```
Browser (panel)  --HTTP-->  Grafana  --resource API-->  Viewport backend (Go)
                                                           |  mints scoped session token
                                                           v
Browser (panel)  --WebSocket tunnel-->  Guacamole  <--json-auth token validation
                                            |
                                          guacd  --VNC/RDP/SSH-->  target machines
```

1. **App plugin** (`sparkanswers-viewport-app`) — owns configuration and the backend.
2. **Nested panel plugin** (`sparkanswers-viewport-panel`, in `dist/panel/`) — the dashboard
   visualization. Bundled inside the app; has **no credential options at all**.
3. **Go backend** (`pkg/`) — reads app settings (connections + secrets), talks to
   Guacamole server-side, and hands the browser a short-lived, single-connection
   session token.

## Credential flow (the part Grafana review cares about)

- Admins define **named connections** (host, port, protocol, username, …) on the
  app configuration page. Non-secret fields go to `jsonData`; passwords and SSH
  private keys go to `secureJsonData`, which Grafana encrypts at rest and never
  returns to the frontend.
- The panel's only connection-related option is the **connection name**.
- At connect time the panel calls the backend resource `POST /session`. The
  backend builds a [guacamole-auth-json](https://guacamole.apache.org/doc/gug/json-auth.html)
  payload containing the connection parameters + credentials, signs it
  (HMAC-SHA256) and encrypts it (AES-128-CBC, zero IV) with the shared
  `jsonSecretKey`, and exchanges it at `{guacamoleUrl}/api/tokens` for an auth
  token **scoped to that single connection** and expiring in minutes.
- The browser receives only `{token, dataSource, identifier, clientUrl}` — no
  credentials — and opens the Guacamole WebSocket tunnel with it.

## App settings schema

`jsonData` (plain, visible to org admins):

```jsonc
{
  "guacamoleUrl": "http://guacamole:8080/guacamole", // backend -> guacamole (server side)
  "clientUrl": "/guacamole",                          // browser -> guacamole (ws tunnel base)
  "connections": [
    {
      "name": "Test VNC",           // unique key, referenced by panels
      "protocol": "vnc",            // vnc | rdp | ssh
      "host": "test-target",
      "port": 5900,
      "username": "",               // rdp/ssh user (not secret by convention, but no password here)
      "domain": "",                 // rdp only
      "security": "any",            // rdp only: any|nla|tls|rdp
      "ignoreCert": true,           // rdp only
      "colorDepth": 24,             // vnc only: 8|16|24|32
      "credentialMode": "stored",   // stored (default) | prompt | profile
      "credentialProfile": ""       // profile name, required when credentialMode = "profile"
    }
  ],
  "profiles": [
    // A credential profile is a reusable credential + protocol defaults,
    // decoupled from any host. It powers two things:
    //  1. connections with credentialMode "profile" (shared credential)
    //  2. the panel's dynamic "host" mode, where a dashboard variable supplies
    //     the hostname and the profile supplies everything else
    {
      "name": "linux-vnc",          // unique key
      "protocol": "vnc",            // vnc | rdp | ssh — fixed per profile
      "port": 5900,                 // default port (0 -> protocol default)
      "username": "",               // rdp/ssh default user
      "domain": "",                 // rdp only
      "security": "any",            // rdp only
      "ignoreCert": true,           // rdp only
      "colorDepth": 24,             // vnc only
      "allowedHosts": ["10.0.*.*", "test-target*"], // label-aware glob allowlist for dynamic host mode; empty = any host
      "promptCredentials": false    // true -> password (and username if empty above) comes from the user per session, never stored
    }
  ]
}
```

`secureJsonData` (write-only from the frontend, decrypted only in the backend):

| key                       | value                                    |
|---------------------------|------------------------------------------|
| `jsonSecretKey`           | 32-hex-char key, must equal the `JSON_SECRET_KEY` env of the Guacamole container |
| `password.<name>`         | password for connection `<name>`         |
| `privateKey.<name>`       | SSH private key for connection `<name>`  |
| `profilePassword.<name>`  | password for profile `<name>` (ignored when `promptCredentials`) |
| `profileKey.<name>`       | SSH private key for profile `<name>`     |

`secureJsonFields` (returned by Grafana's settings GET) tells the config UI
which secrets are already set without revealing them.

## Backend resource API

Base: `/api/plugins/sparkanswers-viewport-app/resources`

### `GET /connections`

Returns the sanitized connection list for panel dropdowns:

```json
{ "connections": [ { "name": "Test VNC", "protocol": "vnc", "host": "test-target", "port": 5900 } ] }
```

### `GET /profiles`

Returns the sanitized credential-profile list for panel dropdowns (no secrets):

```json
{ "profiles": [ { "name": "linux-vnc", "protocol": "vnc", "port": 5900, "username": "", "promptCredentials": false } ] }
```

### `POST /session`

Request — one of two target forms, plus optional ephemeral credentials:

```jsonc
{
  // EITHER a named connection (existing behavior):
  "connection": "Test VNC",
  // OR dynamic host mode (profile supplies protocol/credentials/defaults):
  "host": "server-42",            // typically a resolved dashboard variable
  "port": 0,                       // optional; 0/omitted -> profile port -> protocol default
  "profile": "linux-vnc",

  // Ephemeral credentials for prompt mode. Used for this mint only; never
  // stored, never logged, never echoed back:
  "username": "", "password": "", "domain": ""
}
```

Resolution rules:

- `connection` present → look up the named connection (404 if unknown).
  Credential source by `credentialMode`:
  - `stored` (default): `password.<name>` / `privateKey.<name>`
  - `profile`: the named profile's credentials/defaults (500 if profile missing)
  - `prompt`: credentials must arrive in the request
- else `host` + `profile` present → dynamic mode (400 if either missing).
  The profile supplies protocol, port default, username/domain defaults,
  credentials (or prompt), and its `allowedHosts` globs are enforced —
  403 if the host doesn't match a non-empty allowlist.

  **allowedHosts wildcard semantics (security-relevant).** In dynamic mode the
  host typically comes from a dashboard variable, which a viewer can override
  via the URL (`?var-server=...`). The allowlist is therefore the boundary that
  keeps a shared profile credential from being aimed at an arbitrary host.
  Wildcards are **label-aware**: `*` and `?` match within a single hostname
  label and do **not** cross `.` (or `/`). So `db-*` matches `db-01` but not
  `db-01.attacker.com`, and a /16 is written `10.0.*.*` (matches `10.0.1.5`).
  Empty allowlist allows any host; an invalid pattern matches nothing
  (fails closed). Prefer the narrowest patterns that cover your fleet.
- Whenever the resolved source requires prompting and the request carries no
  password, respond `428 Precondition Required` with
  `{ "error": "...", "needsCredentials": true, "usernameRequired": <protocol != "vnc"> }`.
  The panel shows a credential dialog and retries. Request-supplied
  username/domain override profile defaults in prompt mode.

Then:

1. Build the parameter map for the resolved target. The payload connection map
   is keyed by the connection name, or by `<profile>@<host>` in dynamic mode
   (that key becomes the Guacamole connection name/identifier).
2. Build guacamole-auth-json payload:
   ```json
   {
     "username": "viewport-<grafana user login>",
     "expires": <unix ms, now + 5 min>,
     "connections": { "<name>": { "protocol": "...", "parameters": { "hostname": "...", "port": "...", ... } } }
   }
   ```
3. `sign = HMAC_SHA256(key, json)`; `blob = base64(AES128CBC(key, iv=0, sign || json))`.
4. `POST {guacamoleUrl}/api/tokens` with form field `data=<blob>` →
   `{ "authToken": "...", "dataSource": "json", ... }`.
5. `GET {guacamoleUrl}/api/session/data/{dataSource}/connections?token=...` and
   resolve the identifier of the connection by name.
6. Respond:
   ```json
   { "token": "...", "dataSource": "json", "identifier": "...", "clientUrl": "/guacamole" }
   ```

Errors are returned as `{ "error": "human readable message" }` with a matching
HTTP status.

### `CheckHealth`

Verifies settings are complete and Guacamole is reachable (`GET {guacamoleUrl}/api/languages`).

## Guacamole protocol parameters per connection type

- **vnc**: `hostname`, `port`, `password`, `color-depth`
- **rdp**: `hostname`, `port`, `username`, `password`, `domain?`, `security`,
  `ignore-cert`, `disable-auth: false`
- **ssh**: `hostname`, `port`, `username`, `password?`, `private-key?`

## Frontend

- `src/module.tsx` — `AppPlugin` with a config page (`AppConfig`).
- `src/panel/module.ts` + `src/panel/plugin.json` — nested panel. Options:
  - `mode`: `connection` (default, existing behavior) or `host` (dynamic)
  - `connection` (name, supports dashboard variables) — mode `connection`
  - `host` (supports dashboard variables, e.g. `${server}`), `port` (0 = profile/protocol default),
    `profile` (credential profile name) — mode `host`
  - `autoConnect`, `readOnly`
  On a 428 `needsCredentials` response the panel opens a credential dialog
  (username shown unless `usernameRequired` is false), retries the session with
  the entered credentials, and keeps them in component memory only — never in
  panel options, dashboard JSON, or storage.
- `src/services/BackendService.ts` — wraps `getBackendSrv()` calls to the
  resource API.
- The WebSocket tunnel URL is derived from `clientUrl` (relative URLs resolve
  against the current origin, honoring Grafana sub-path deployments).

## Build

- `npm run build` — webpack bundles `dist/module.js` (app) and
  `dist/panel/module.js` (panel), copies both `plugin.json`s and assets.
- `npm run build:backend` — `GOOS=linux GOARCH=amd64 go build -o dist/gpx_viewport_linux_amd64 ./pkg`
- Grafana loads unsigned plugins via
  `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=sparkanswers-viewport-app,sparkanswers-viewport-panel`.
