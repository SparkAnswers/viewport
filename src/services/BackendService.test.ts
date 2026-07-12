import {
  buildTunnelUrl,
  buildConnectString,
  createSession,
  listConnections,
  listProfiles,
  extractError,
  isNeedsCredentials,
} from './BackendService';

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ get: mockGet, post: mockPost }),
}));

describe('buildTunnelUrl', () => {
  it('converts an absolute http URL to ws', () => {
    expect(buildTunnelUrl('http://guacamole:8080/guacamole')).toBe(
      'ws://guacamole:8080/guacamole/websocket-tunnel'
    );
  });

  it('converts an absolute https URL to wss', () => {
    expect(buildTunnelUrl('https://secure.example.com/guacamole')).toBe(
      'wss://secure.example.com/guacamole/websocket-tunnel'
    );
  });

  it('resolves a relative URL against the current origin', () => {
    // jsdom default origin is http://localhost
    expect(buildTunnelUrl('/guacamole')).toBe('ws://localhost/guacamole/websocket-tunnel');
  });

  it('resolves a relative URL without a leading slash', () => {
    expect(buildTunnelUrl('guacamole')).toBe('ws://localhost/guacamole/websocket-tunnel');
  });

  it('strips trailing slashes', () => {
    expect(buildTunnelUrl('http://example.com/guacamole///')).toBe(
      'ws://example.com/guacamole/websocket-tunnel'
    );
  });
});

describe('buildConnectString', () => {
  it('builds URL-encoded connection parameters', () => {
    const data = buildConnectString('my-token', 'json', '7');
    expect(data).toContain('token=my-token');
    expect(data).toContain('GUAC_DATA_SOURCE=json');
    expect(data).toContain('GUAC_ID=7');
    expect(data).toContain('GUAC_TYPE=c');
    expect(data).toContain('GUAC_WIDTH=1024');
    expect(data).toContain('GUAC_HEIGHT=768');
    expect(data).toContain('GUAC_DPI=96');
  });

  it('honors explicit width/height/dpi', () => {
    const data = buildConnectString('t', 'json', '1', 1920, 1080, 120);
    expect(data).toContain('GUAC_WIDTH=1920');
    expect(data).toContain('GUAC_HEIGHT=1080');
    expect(data).toContain('GUAC_DPI=120');
  });
});

describe('extractError', () => {
  it('reads the backend error field', () => {
    expect(extractError({ data: { error: 'unknown connection' } })).toBe('unknown connection');
  });

  it('falls back to statusText then a default', () => {
    expect(extractError({ statusText: 'Not Found' })).toBe('Not Found');
    expect(extractError({})).toBe('Request failed');
  });
});

describe('listConnections', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('returns the connections array', async () => {
    mockGet.mockResolvedValueOnce({ connections: [{ name: 'Test VNC', protocol: 'vnc', host: 'h', port: 5900 }] });
    const result = await listConnections();
    expect(mockGet).toHaveBeenCalledWith(
      '/api/plugins/sparkanswers-viewport-app/resources/connections',
      undefined,
      undefined,
      { showErrorAlert: false }
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Test VNC');
  });

  it('returns an empty array when the payload is missing', async () => {
    mockGet.mockResolvedValueOnce({});
    expect(await listConnections()).toEqual([]);
  });
});

describe('listProfiles', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('returns the profiles array', async () => {
    mockGet.mockResolvedValueOnce({ profiles: [{ name: 'linux-vnc', protocol: 'vnc', port: 5900, promptCredentials: false }] });
    const result = await listProfiles();
    expect(mockGet).toHaveBeenCalledWith(
      '/api/plugins/sparkanswers-viewport-app/resources/profiles',
      undefined,
      undefined,
      { showErrorAlert: false }
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('linux-vnc');
  });

  it('returns an empty array when the payload is missing', async () => {
    mockGet.mockResolvedValueOnce({});
    expect(await listProfiles()).toEqual([]);
  });
});

describe('isNeedsCredentials', () => {
  it('recognizes the 428 marker object', () => {
    expect(isNeedsCredentials({ needsCredentials: true, usernameRequired: false, message: 'x' })).toBe(true);
    expect(isNeedsCredentials({ error: 'nope' })).toBe(false);
    expect(isNeedsCredentials(null)).toBe(false);
  });
});

describe('createSession', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('POSTs a named connection and returns the session', async () => {
    const session = { token: 'tok', dataSource: 'json', identifier: '3', clientUrl: '/guacamole' };
    mockPost.mockResolvedValueOnce(session);
    const result = await createSession({ connection: 'Test VNC' });
    expect(mockPost).toHaveBeenCalledWith(
      '/api/plugins/sparkanswers-viewport-app/resources/session',
      { connection: 'Test VNC' },
      { showErrorAlert: false }
    );
    expect(result).toEqual(session);
  });

  it('POSTs a dynamic host+profile target', async () => {
    mockPost.mockResolvedValueOnce({ token: 't', dataSource: 'json', identifier: '1', clientUrl: '/guacamole' });
    await createSession({ host: 'server-42', profile: 'linux-vnc', port: 0 });
    expect(mockPost).toHaveBeenCalledWith(
      '/api/plugins/sparkanswers-viewport-app/resources/session',
      { host: 'server-42', profile: 'linux-vnc', port: 0 },
      { showErrorAlert: false }
    );
  });

  it('throws a NeedsCredentials marker on a 428 response', async () => {
    expect.assertions(3);
    mockPost.mockRejectedValueOnce({ status: 428, data: { needsCredentials: true, usernameRequired: true, error: 'creds needed' } });
    try {
      await createSession({ connection: 'test-rdp-prompt' });
    } catch (err) {
      expect(isNeedsCredentials(err)).toBe(true);
      expect((err as { usernameRequired: boolean }).usernameRequired).toBe(true);
      expect((err as { message: string }).message).toBe('creds needed');
    }
  });

  it('surfaces other backend error messages via extractError', async () => {
    expect.assertions(2);
    mockPost.mockRejectedValueOnce({ status: 404, data: { error: 'unknown connection "Nope"' } });
    try {
      await createSession({ connection: 'Nope' });
    } catch (err) {
      expect(isNeedsCredentials(err)).toBe(false);
      expect(extractError(err)).toBe('unknown connection "Nope"');
    }
  });
});
