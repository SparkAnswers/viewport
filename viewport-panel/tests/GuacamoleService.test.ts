import { GuacamoleService } from '../src/services/GuacamoleService';

const BASE_URL = 'http://localhost:8080/guacamole';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GuacamoleService', () => {
  let service: GuacamoleService;

  beforeEach(() => {
    service = new GuacamoleService(BASE_URL);
    mockFetch.mockReset();
  });

  describe('authenticate', () => {
    it('should POST credentials and return auth response', async () => {
      const authResponse = {
        authToken: 'test-token-123',
        username: 'admin',
        dataSource: 'postgresql',
        availableDataSources: ['postgresql'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authResponse),
      });

      const result = await service.authenticate('admin', 'password');

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/tokens`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
      expect(result).toEqual(authResponse);
    });

    it('should throw on authentication failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ message: 'Invalid credentials' }),
      });

      await expect(service.authenticate('bad', 'creds')).rejects.toEqual({
        message: 'Invalid credentials',
        statusCode: 403,
      });
    });
  });

  describe('createConnection', () => {
    it('should POST connection config and return connection', async () => {
      const connection = {
        identifier: '1',
        name: 'test-conn',
        protocol: 'vnc',
        parentIdentifier: 'ROOT',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(connection),
      });

      const result = await service.createConnection('token-123', {
        name: 'test-conn',
        protocol: 'vnc',
        parameters: { hostname: '192.168.1.1', port: '5900' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/session/data/postgresql/connections?token=token-123'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result).toEqual(connection);
    });

    it('should throw on creation failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Missing parameters' }),
      });

      await expect(
        service.createConnection('token', {
          name: 'bad',
          protocol: 'vnc',
          parameters: {},
        })
      ).rejects.toEqual({
        message: 'Missing parameters',
        statusCode: 400,
      });
    });
  });

  describe('getConnections', () => {
    it('should GET and return connections as array', async () => {
      const connectionsMap = {
        '1': { identifier: '1', name: 'conn-a', protocol: 'vnc', parentIdentifier: 'ROOT' },
        '2': { identifier: '2', name: 'conn-b', protocol: 'rdp', parentIdentifier: 'ROOT' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(connectionsMap),
      });

      const result = await service.getConnections('token-123');

      expect(result).toHaveLength(2);
      expect(result[0].identifier).toBe('1');
    });
  });

  describe('deleteConnection', () => {
    it('should DELETE the specified connection', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await service.deleteConnection('token-123', '42');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/connections/42?token=token-123'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('buildTunnelUrl', () => {
    it('should build a WebSocket tunnel URL without query params', () => {
      const url = service.buildTunnelUrl();

      expect(url).toBe('ws://localhost:8080/guacamole/websocket-tunnel');
    });

    it('should convert https to wss', () => {
      const svc = new GuacamoleService('https://secure.example.com/guacamole');
      const url = svc.buildTunnelUrl();
      expect(url).toMatch(/^wss:\/\//);
    });
  });

  describe('buildConnectString', () => {
    it('should build URL-encoded connection parameters', () => {
      const data = service.buildConnectString('my-token', '7');

      expect(data).toContain('token=my-token');
      expect(data).toContain('GUAC_ID=7');
      expect(data).toContain('GUAC_TYPE=c');
      expect(data).toContain('GUAC_DATA_SOURCE=postgresql');
      expect(data).toContain('GUAC_WIDTH=');
      expect(data).toContain('GUAC_HEIGHT=');
      expect(data).toContain('GUAC_DPI=');
    });
  });

  describe('trailing slash handling', () => {
    it('should strip trailing slashes from base URL', () => {
      const svc = new GuacamoleService('http://example.com/guacamole///');
      const url = svc.buildTunnelUrl();
      expect(url).toContain('ws://example.com/guacamole/websocket-tunnel');
    });
  });
});
