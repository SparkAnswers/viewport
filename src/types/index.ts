export type ConnectionType = 'vnc' | 'rdp' | 'ssh';

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

export type RdpSecurity = 'any' | 'nla' | 'tls' | 'rdp';

/**
 * How a connection's credentials are sourced at session time:
 *  - stored:  password.<name> / privateKey.<name> in secureJsonData
 *  - prompt:  the user is asked per session; nothing is stored
 *  - profile: a named credential profile supplies the credential
 */
export type CredentialMode = 'stored' | 'prompt' | 'profile';

/**
 * A named connection defined by an admin on the app config page.
 * Non-secret fields only — passwords and SSH keys live in secureJsonData,
 * keyed by `password.<name>` / `privateKey.<name>`.
 */
export interface ViewportConnectionConfig {
  name: string;
  protocol: ConnectionType;
  host: string;
  port: number;
  username?: string; // rdp/ssh
  domain?: string; // rdp
  security?: RdpSecurity; // rdp
  ignoreCert?: boolean; // rdp
  colorDepth?: number; // vnc: 8 | 16 | 24 | 32
  credentialMode?: CredentialMode; // default: stored
  credentialProfile?: string; // required when credentialMode = 'profile'
}

/**
 * A reusable credential + protocol defaults, decoupled from any host. Powers
 * connections with credentialMode 'profile' and the panel's dynamic host mode.
 * Secrets live in secureJsonData as `profilePassword.<name>` / `profileKey.<name>`.
 */
export interface ViewportProfileConfig {
  name: string;
  protocol: ConnectionType;
  port: number; // 0 -> protocol default
  username?: string; // rdp/ssh default user
  domain?: string; // rdp
  security?: RdpSecurity; // rdp
  ignoreCert?: boolean; // rdp
  colorDepth?: number; // vnc
  allowedHosts?: string[]; // glob allowlist for host mode; empty = any host
  promptCredentials?: boolean; // true -> credentials asked per session, never stored
}

/** App plugin jsonData — plain, visible to org admins. */
export interface ViewportAppJsonData {
  guacamoleUrl?: string; // backend -> guacamole (server side)
  clientUrl?: string; // browser -> guacamole (ws tunnel base)
  connections?: ViewportConnectionConfig[];
  profiles?: ViewportProfileConfig[];
}

/** Which target the panel resolves: a named connection or a dynamic host+profile. */
export type PanelMode = 'connection' | 'host';

/** Panel options — deliberately free of any credential fields. */
export interface ViewportPanelOptions {
  mode: PanelMode;
  connection: string; // mode 'connection' — supports dashboard variables
  host: string; // mode 'host' — supports dashboard variables
  port: number; // mode 'host' — 0 = profile/protocol default
  profile: string; // mode 'host' — credential profile name
  autoConnect: boolean;
  readOnly: boolean;
}

export const defaultViewportPanelOptions: ViewportPanelOptions = {
  mode: 'connection',
  connection: '',
  host: '',
  port: 0,
  profile: '',
  autoConnect: false,
  readOnly: false,
};

/** Sanitized connection returned by GET /resources/connections for dropdowns. */
export interface ConnectionSummary {
  name: string;
  protocol: ConnectionType;
  host: string;
  port: number;
}

/** Sanitized profile returned by GET /resources/profiles for dropdowns (no secrets). */
export interface ProfileSummary {
  name: string;
  protocol: ConnectionType;
  port: number;
  username?: string;
  promptCredentials?: boolean;
}

/** Ephemeral credentials entered at the prompt — kept in memory only. */
export interface SessionCredentials {
  username?: string;
  password: string;
  domain?: string;
}

/** Request body for POST /resources/session. */
export interface SessionRequest {
  connection?: string; // mode 'connection'
  host?: string; // mode 'host'
  port?: number; // mode 'host'
  profile?: string; // mode 'host'
  username?: string; // ephemeral (prompt mode)
  password?: string; // ephemeral (prompt mode)
  domain?: string; // ephemeral (prompt mode)
}

/** Response from POST /resources/session — carries no credentials. */
export interface SessionResponse {
  token: string;
  dataSource: string;
  identifier: string;
  clientUrl: string;
}

export const defaultPorts: Record<ConnectionType, number> = {
  vnc: 5900,
  rdp: 3389,
  ssh: 22,
};
