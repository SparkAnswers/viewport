export type ConnectionType = 'vnc' | 'rdp' | 'ssh';

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

export interface ViewportOptions {
  connectionType: ConnectionType;
  guacamoleUrl: string;
  guacamoleUsername: string;
  guacamolePassword: string;
  host: string;
  port: number;
  username: string;
  password: string;
  domain: string;
  colorDepth: number;
  sshPrivateKey: string;
  security: string;
  ignoreCert: boolean;
  autoConnect: boolean;
  readOnly: boolean;
}

export const defaultViewportOptions: ViewportOptions = {
  connectionType: 'vnc',
  guacamoleUrl: 'http://localhost:8080/guacamole',
  guacamoleUsername: 'guacadmin',
  guacamolePassword: 'guacadmin',
  host: '',
  port: 5900,
  username: '',
  password: '',
  domain: '',
  colorDepth: 24,
  sshPrivateKey: '',
  security: 'any',
  ignoreCert: true,
  autoConnect: false,
  readOnly: false,
};

export interface GuacamoleAuthResponse {
  authToken: string;
  username: string;
  dataSource: string;
  availableDataSources: string[];
}

export interface GuacamoleConnectionConfig {
  name: string;
  protocol: ConnectionType;
  parameters: Record<string, string>;
}

export interface GuacamoleConnection {
  identifier: string;
  name: string;
  protocol: string;
  parentIdentifier: string;
}

export interface GuacamoleError {
  message: string;
  statusCode: number;
}
