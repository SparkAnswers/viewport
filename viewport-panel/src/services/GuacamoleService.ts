import type {
  GuacamoleAuthResponse,
  GuacamoleConnection,
  GuacamoleConnectionConfig,
  GuacamoleError,
} from '../types';

export class GuacamoleService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Authenticate with Guacamole and obtain an auth token.
   */
  async authenticate(username: string, password: string): Promise<GuacamoleAuthResponse> {
    const body = new URLSearchParams({ username, password });

    const response = await fetch(`${this.baseUrl}/api/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw await this.buildError(response);
    }

    return response.json();
  }

  /**
   * Create a new connection in Guacamole.
   */
  async createConnection(
    token: string,
    config: GuacamoleConnectionConfig
  ): Promise<GuacamoleConnection> {
    const response = await fetch(
      `${this.baseUrl}/api/session/data/postgresql/connections?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          protocol: config.protocol,
          parameters: config.parameters,
          parentIdentifier: 'ROOT',
          attributes: {},
        }),
      }
    );

    if (!response.ok) {
      throw await this.buildError(response);
    }

    return response.json();
  }

  /**
   * List all connections visible to the authenticated user.
   */
  async getConnections(token: string): Promise<GuacamoleConnection[]> {
    const response = await fetch(
      `${this.baseUrl}/api/session/data/postgresql/connections?token=${encodeURIComponent(token)}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      throw await this.buildError(response);
    }

    const data: Record<string, GuacamoleConnection> = await response.json();
    return Object.values(data);
  }

  /**
   * Delete a connection by identifier.
   */
  async deleteConnection(token: string, connectionId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/session/data/postgresql/connections/${encodeURIComponent(connectionId)}?token=${encodeURIComponent(token)}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw await this.buildError(response);
    }
  }

  /**
   * Build the base WebSocket tunnel URL (no query params).
   * guacamole-common-js WebSocketTunnel expects just the endpoint;
   * connection parameters are passed separately via client.connect(data).
   */
  buildTunnelUrl(): string {
    if (this.baseUrl.startsWith('http')) {
      return this.baseUrl.replace(/^http/, 'ws') + '/websocket-tunnel';
    }
    // For relative URLs, construct absolute ws:// URL from current page location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${this.baseUrl}/websocket-tunnel`;
  }

  /**
   * Build the URL-encoded connection parameter string to pass to client.connect().
   */
  buildConnectString(token: string, connectionId: string, width = 1024, height = 768, dpi = 96): string {
    const params = new URLSearchParams({
      token,
      GUAC_DATA_SOURCE: 'postgresql',
      GUAC_ID: connectionId,
      GUAC_TYPE: 'c',
      GUAC_WIDTH: String(width),
      GUAC_HEIGHT: String(height),
      GUAC_DPI: String(dpi),
    });
    return params.toString();
  }

  private async buildError(response: Response): Promise<GuacamoleError> {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      // Use status text fallback
      message = response.statusText || message;
    }
    return { message, statusCode: response.status };
  }
}
