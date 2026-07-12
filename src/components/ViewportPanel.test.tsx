import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { FieldConfigSource, LoadingState, dateTime } from '@grafana/data';
import { ViewportPanel } from './ViewportPanel';
import { defaultViewportPanelOptions, ConnectionState, ViewportPanelOptions } from '../types';

// Mock Grafana UI hooks with a minimal theme (covers panel + CredentialPrompt).
jest.mock('@grafana/ui', () => ({
  useStyles2: (getStyles: Function) =>
    getStyles({
      spacing: () => '8px',
      colors: {
        background: { primary: '#111', secondary: '#222', canvas: '#000' },
        text: { primary: '#fff', secondary: '#aaa', disabled: '#555' },
        border: { weak: '#333', medium: '#444' },
        primary: { main: '#3274D9', shade: '#2A5DB0', border: '#3274D9', contrastText: '#fff' },
        success: { main: '#1A7F4B', shade: '#15693E', contrastText: '#fff' },
        warning: { main: '#FF9830' },
        error: { main: '#E02F44', shade: '#C4162C', text: '#E02F44', contrastText: '#fff' },
        action: { hover: 'rgba(255,255,255,0.08)' },
      },
      typography: { body: { fontSize: '14px' }, bodySmall: { fontSize: '12px' }, h4: { fontSize: '18px' }, h5: { fontSize: '16px' } },
      shape: { radius: { default: '4px' } },
      shadows: { z2: 'none', z3: 'none' },
    }),
  useTheme2: () => ({}),
}));

jest.mock('@emotion/css', () => ({ css: (..._args: unknown[]) => 'mock-css-class' }));

// Mock the backend service so no real network calls happen.
const mockCreateSession = jest.fn();
jest.mock('../services/BackendService', () => ({
  createSession: (req: any) => mockCreateSession(req),
  buildTunnelUrl: (u: string) => `ws://host${u}/websocket-tunnel`,
  buildConnectString: () => 'token=t&GUAC_ID=1',
  extractError: (err: any) => err?.data?.error || err?.message || 'Request failed',
  isNeedsCredentials: (x: any) => typeof x === 'object' && x !== null && x.needsCredentials === true,
}));

// Stub the Guacamole display so we can assert it renders without a real tunnel.
jest.mock('./GuacamoleDisplay', () => ({
  GuacamoleDisplay: ({ onStateChange }: { onStateChange: (s: ConnectionState) => void }) => {
    React.useEffect(() => onStateChange(ConnectionState.Connected), [onStateChange]);
    return <div data-testid="guac-display" />;
  },
}));

const onOptionsChange = jest.fn();

const makeProps = (options: Partial<ViewportPanelOptions> = {}, replaceVariables = (s: string) => s) => ({
  id: 1,
  data: { series: [], state: LoadingState.Done, timeRange: { from: dateTime(), to: dateTime(), raw: { from: 'now-1h', to: 'now' } } },
  timeRange: { from: dateTime(), to: dateTime(), raw: { from: 'now-1h', to: 'now' } },
  timeZone: 'browser' as const,
  options: { ...defaultViewportPanelOptions, ...options },
  fieldConfig: { defaults: {}, overrides: [] } as FieldConfigSource,
  width: 800,
  height: 600,
  transparent: false,
  renderCounter: 0,
  title: 'Viewport',
  replaceVariables,
  onOptionsChange,
  onFieldConfigChange: jest.fn(),
  onChangeTimeRange: jest.fn(),
  eventBus: { subscribe: jest.fn(), getStream: jest.fn(), publish: jest.fn(), removeAllListeners: jest.fn(), newScopedBus: jest.fn() } as any,
});

describe('ViewportPanel', () => {
  beforeEach(() => {
    mockCreateSession.mockReset();
    onOptionsChange.mockReset();
  });

  it('shows the select-a-connection placeholder in connection mode with no connection', () => {
    render(<ViewportPanel {...makeProps()} />);
    expect(screen.getByText(/Select a connection in panel options/i)).toBeTruthy();
  });

  it('shows the host/profile placeholder in host mode with nothing set', () => {
    render(<ViewportPanel {...makeProps({ mode: 'host' })} />);
    expect(screen.getByText(/Set a host and profile in panel options/i)).toBeTruthy();
  });

  it('resolves the connection through replaceVariables', () => {
    const replaceVariables = jest.fn((s: string) => s.replace('${server}', 'Prod RDP'));
    render(<ViewportPanel {...makeProps({ connection: '${server}' }, replaceVariables)} />);
    expect(replaceVariables).toHaveBeenCalledWith('${server}');
  });

  it('creates a named-connection session and renders the display on connect', async () => {
    mockCreateSession.mockResolvedValue({ token: 't', dataSource: 'json', identifier: '1', clientUrl: '/guacamole' });
    render(<ViewportPanel {...makeProps({ connection: 'Test VNC' })} />);

    fireEvent.click(screen.getByText('Connect'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalledWith({ connection: 'Test VNC' }));
    expect(await screen.findByTestId('guac-display')).toBeTruthy();
  });

  it('creates a dynamic host+profile session in host mode', async () => {
    mockCreateSession.mockResolvedValue({ token: 't', dataSource: 'json', identifier: '1', clientUrl: '/guacamole' });
    render(<ViewportPanel {...makeProps({ mode: 'host', host: 'server-42', profile: 'linux-vnc', port: 0 })} />);

    fireEvent.click(screen.getByText('Connect'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalledWith({ host: 'server-42', profile: 'linux-vnc', port: 0 }));
    expect(await screen.findByTestId('guac-display')).toBeTruthy();
  });

  it('prompts for credentials on 428 and retries with them, keeping them out of panel options', async () => {
    mockCreateSession
      .mockRejectedValueOnce({ needsCredentials: true, usernameRequired: false, message: 'creds needed' })
      .mockResolvedValueOnce({ token: 't', dataSource: 'json', identifier: '1', clientUrl: '/guacamole' });

    render(<ViewportPanel {...makeProps({ connection: 'test-vnc' })} />);

    fireEvent.click(screen.getByText('Connect'));

    // The credential dialog appears (VNC: password only, no username field).
    const dialogTitle = await screen.findByText('Connection credentials');
    const form = dialogTitle.closest('form')!;
    const passwordInput = form.querySelector('input[type="password"]') as HTMLInputElement;
    expect(passwordInput).toBeTruthy();
    fireEvent.change(passwordInput, { target: { value: 'hunter2' } });
    fireEvent.click(within(form).getByText('Connect'));

    // Retried with the entered password, then the display renders.
    await waitFor(() =>
      expect(mockCreateSession).toHaveBeenLastCalledWith({
        connection: 'test-vnc',
        username: undefined,
        password: 'hunter2',
        domain: undefined,
      })
    );
    expect(await screen.findByTestId('guac-display')).toBeTruthy();
    // Credentials are never written back into panel options / dashboard JSON.
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  it('surfaces non-428 backend error messages in the status', async () => {
    mockCreateSession.mockRejectedValue({ data: { error: 'unknown connection "test-vnc"' } });
    render(<ViewportPanel {...makeProps({ connection: 'test-vnc' })} />);

    fireEvent.click(screen.getByText('Connect'));

    expect(await screen.findByText(/unknown connection "test-vnc"/i)).toBeTruthy();
  });
});
