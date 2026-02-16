# Viewport - Onboarding Guide

Welcome! This guide will get you from zero to a running Viewport development environment.

## How It Works — Why Guacamole?

You might wonder: why does this project need Apache Guacamole? Can't we just connect to remote machines directly from the browser?

**The short answer: no.** Browsers can only make HTTP and WebSocket connections. They cannot speak VNC, RDP, or SSH — those are low-level network protocols that require a native client. So there must be a server-side component that:

1. **Connects** to target machines using their native protocol (VNC, RDP, or SSH)
2. **Translates** the remote display into a WebSocket stream the browser can consume
3. **Relays** keyboard and mouse input back to the target machine

Guacamole's `guacd` daemon does exactly this. The Grafana plugin talks to Guacamole over WebSockets, and Guacamole talks to your servers over VNC/RDP/SSH. The user never needs to install anything — it all runs in the browser.

```
Your Browser  <--WebSocket-->  Guacamole (guacd)  <--VNC/RDP/SSH-->  Remote Servers
```

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ and npm
- A code editor (VS Code recommended)

## Step 1: Clone and Install

```bash
git clone <repo-url>
cd viewport

# Install plugin dependencies
cd viewport-panel
npm install
cd ..
```

## Step 2: Build the Plugin

```bash
cd viewport-panel
npm run build    # production build -> dist/
# OR
npm run dev      # watch mode for development
```

The build output goes to `viewport-panel/dist/`, which is volume-mounted into the Grafana container.

## Step 3: Start the Stack

```bash
docker-compose up -d
```

This starts 5 containers:

| Service | URL | Credentials |
|---------|-----|-------------|
| Nginx (entry point) | http://localhost | - |
| Grafana | http://localhost/grafana/ | admin / admin |
| Guacamole | http://localhost/guacamole/ | guacadmin / guacadmin |
| PostgreSQL | localhost:5432 | guacamole_user / guacamole_pass |
| guacd | localhost:4822 | - |

## Step 4: Verify Everything Works

1. Open http://localhost/grafana/ and log in with `admin` / `admin`
2. Create a new dashboard
3. Add a panel and search for "Viewport" in the panel type list
4. The plugin should appear - you're good to go!

## Step 5: Configure a Test Connection

A test VNC server is included in the stack (`test-target` service). To test:

1. In your Viewport panel settings, set:
   - **Connection Type**: VNC
   - **Guacamole URL**: `http://guacamole:8080/guacamole`
   - **Host**: `test-target`
   - **Port**: `5900`
   - **Password**: `testpass`
2. Click "Connect" in the toolbar
3. You should see the test desktop rendered in the panel
4. Double-click to go fullscreen, press Escape to minimize

## Project Structure

```
viewport/
├── docker-compose.yml          # All services defined here
├── .env                        # Environment variables (credentials, URLs)
├── nginx/
│   └── nginx.conf              # Reverse proxy config
├── db/
│   └── init/
│       └── initdb.sql          # Guacamole PostgreSQL schema
├── test-target/
│   └── Dockerfile              # Test VNC server for development
├── viewport-panel/             # The Grafana plugin
│   ├── src/
│   │   ├── module.ts           # Plugin entry point + options editor
│   │   ├── plugin.json         # Plugin metadata
│   │   ├── components/
│   │   │   ├── ViewportPanel.tsx      # Main panel (small pane + fullscreen)
│   │   │   ├── GuacamoleDisplay.tsx   # Remote display renderer
│   │   │   ├── ConnectionToolbar.tsx  # Connect/Disconnect/Fullscreen buttons
│   │   │   ├── ConnectionStatus.tsx   # Status indicator dot
│   │   │   └── CredentialPrompt.tsx   # Login modal
│   │   ├── services/
│   │   │   └── GuacamoleService.ts    # Guacamole REST API client
│   │   └── types/
│   │       ├── index.ts               # TypeScript interfaces
│   │       └── guacamole.d.ts         # guacamole-common-js type defs
│   ├── tests/                  # Unit tests
│   ├── package.json
│   └── tsconfig.json
├── trello.md                   # Full project plan and task breakdown
├── project.md                  # Original project requirements
└── onboard.md                  # This file
```

## Using Dashboard Variables

The Viewport panel supports Grafana [dashboard variables](https://grafana.com/docs/grafana/latest/dashboards/variables/) in all text-based connection fields. This lets you dynamically populate connection details from dropdowns, query results, or custom variables.

**Supported fields:** Guacamole URL, Host, Username, Password, Domain, SSH Private Key.

### Example Setup

1. In your dashboard, go to **Settings > Variables** and create a variable:
   - **Name:** `server_ip`
   - **Type:** Custom
   - **Values:** `10.0.0.1, 10.0.0.2, 10.0.0.3`
2. In the Viewport panel options, set **Host** to `${server_ip}`
3. Now the panel connects to whichever server is selected in the dashboard dropdown

### Common Variable Patterns

| Field | Example Value | Description |
|-------|--------------|-------------|
| Host | `${server_ip}` | Select target machine from a dropdown |
| Username | `${ssh_user}` | Switch between user accounts |
| Guacamole URL | `http://${guac_host}:8080/guacamole` | Point to different Guacamole instances |
| Domain | `${ad_domain}` | Switch Active Directory domains for RDP |

Variables are resolved at render time, so changing a dashboard variable immediately updates the panel's connection target. If **Auto Connect** is enabled, the panel will reconnect automatically when variables change.

## Development Workflow

### Making Plugin Changes

1. Run `npm run dev` in `viewport-panel/` (watches for changes)
2. Grafana auto-reloads the plugin when dist/ changes
3. Refresh your browser to see updates

### Running Tests

```bash
cd viewport-panel
npm test                  # Run all tests
npm test -- --watch       # Watch mode
npm test -- --coverage    # With coverage report
```

### Adding a New Component

1. Create the component in `src/components/`
2. Use `useStyles2` + `css` from `@emotion/css` for styling (matches Grafana patterns)
3. Use `GrafanaTheme2` for theme-aware colors
4. Add tests in `tests/`

### Key Patterns Used

- **`PanelPlugin`** from `@grafana/data` for plugin registration
- **`useStyles2(getStyles)`** for theme-aware CSS-in-JS
- **`PanelProps<ViewportOptions>`** for typed panel props
- **`guacamole-common-js`** for direct Guacamole protocol integration (not iframe)
- **React portals** for fullscreen overlay mode

## Troubleshooting

**Plugin doesn't appear in Grafana:**
- Check that `viewport-panel/dist/` exists and contains built files
- Verify `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=viewport-panel` is set
- Restart Grafana: `docker-compose restart grafana`
- Check logs: `docker-compose logs grafana`

**Guacamole connection fails:**
- Verify guacd is running: `docker-compose logs guacd`
- Check Guacamole logs: `docker-compose logs guacamole`
- Ensure the target host is reachable from the guacd container
- Try logging into Guacamole directly at http://localhost/guacamole/

**WebSocket errors:**
- Check Nginx logs: `docker-compose logs nginx`
- Verify WebSocket upgrade headers in `nginx/nginx.conf`
- Browser dev tools Network tab -> WS filter to inspect WebSocket frames

## Contributing

1. Check `trello.md` for the task breakdown and pick an unfinished task
2. Create a feature branch
3. Write tests first (TDD approach)
4. Implement the feature
5. Run `npm test` to verify
6. Submit a PR with a description of what changed and why
