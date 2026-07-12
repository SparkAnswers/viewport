import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppConfig } from './AppConfig';
import { ViewportAppJsonData } from '../types';

const mockPost = jest.fn();
jest.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post: mockPost, get: jest.fn() }),
}));

jest.mock('@emotion/css', () => ({ css: (..._args: unknown[]) => 'mock-css-class' }));

// Lightweight DOM stand-ins for the Grafana UI components AppConfig uses.
jest.mock('@grafana/ui', () => {
  const R = require('react');
  return {
    useStyles2: (getStyles: Function) =>
      getStyles({
        spacing: () => '8px',
        colors: { border: { weak: '#333' }, background: { secondary: '#222' } },
        shape: { radius: { default: '4px' } },
      }),
    Alert: ({ title, children }: any) => R.createElement('div', { role: 'alert' }, title, children),
    Button: ({ children, onClick, disabled }: any) => R.createElement('button', { onClick, disabled }, children),
    Field: ({ label, children }: any) => R.createElement('label', null, label, children),
    FieldSet: ({ label, children }: any) => R.createElement('fieldset', null, R.createElement('legend', null, label), children),
    IconButton: ({ onClick, 'aria-label': al }: any) => R.createElement('button', { onClick, 'aria-label': al }),
    Input: ({ value, onChange, placeholder }: any) => R.createElement('input', { value, onChange, placeholder }),
    Select: ({ value, onChange }: any) =>
      R.createElement('div', { 'data-testid': 'select', 'data-value': String(value) }),
    SecretInput: ({ value, onChange, placeholder, isConfigured }: any) =>
      R.createElement('input', { value, onChange, placeholder, 'data-configured': String(isConfigured) }),
    SecretTextArea: ({ value, onChange, placeholder }: any) => R.createElement('textarea', { value, onChange, placeholder }),
    Switch: ({ value, onChange }: any) => R.createElement('input', { type: 'checkbox', checked: value, onChange }),
  };
});

const makePlugin = (jsonData: ViewportAppJsonData, secureJsonFields: Record<string, boolean> = {}) =>
  ({
    meta: {
      id: 'sparkanswers-viewport-app',
      jsonData,
      secureJsonFields,
    },
  }) as any;

const makeProps = (jsonData: ViewportAppJsonData = {}, secureJsonFields: Record<string, boolean> = {}) => ({
  plugin: makePlugin(jsonData, secureJsonFields),
  query: {},
});

describe('AppConfig', () => {
  const reloadMock = jest.fn();

  beforeAll(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: { reload: reloadMock } });
  });

  beforeEach(() => {
    mockPost.mockReset().mockResolvedValue({});
    reloadMock.mockReset();
  });

  it('renders all configuration sections', () => {
    render(<AppConfig {...makeProps()} />);
    expect(screen.getByText('Guacamole server')).toBeTruthy();
    expect(screen.getByText('Connections')).toBeTruthy();
    expect(screen.getByText('Credential profiles')).toBeTruthy();
  });

  it('hides the stored password input for a prompt-mode connection', () => {
    render(
      <AppConfig
        {...makeProps({
          connections: [{ name: 'Prompt RDP', protocol: 'rdp', host: 'h', port: 3389, credentialMode: 'prompt' }],
        })}
      />
    );
    expect(screen.queryByPlaceholderText('RDP password')).toBeNull();
  });

  it('hides the profile password input when the profile prompts for credentials', () => {
    render(
      <AppConfig
        {...makeProps({
          profiles: [{ name: 'prompt-vnc', protocol: 'vnc', port: 5900, promptCredentials: true }],
        })}
      />
    );
    expect(screen.getByText('prompt-vnc')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Profile password')).toBeNull();
  });

  it('saves profiles and only the changed profile secret', async () => {
    render(
      <AppConfig
        {...makeProps({
          guacamoleUrl: 'http://g:8080',
          clientUrl: '/guacamole',
          connections: [],
          profiles: [{ name: 'linux-vnc', protocol: 'vnc', port: 5900, allowedHosts: ['test-target*'] }],
        })}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Profile password'), { target: { value: 'sekret' } });
    fireEvent.click(screen.getByText('Save settings'));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const body = mockPost.mock.calls[0][1];
    expect(body.jsonData.profiles).toHaveLength(1);
    expect(body.jsonData.profiles[0].allowedHosts).toEqual(['test-target*']);
    expect(body.secureJsonData).toEqual({ 'profilePassword.linux-vnc': 'sekret' });
  });

  it('saves settings, sending only the secrets the user changed', async () => {
    render(
      <AppConfig
        {...makeProps({
          guacamoleUrl: 'http://guacamole:8080/guacamole',
          clientUrl: '/guacamole',
          connections: [{ name: 'Test VNC', protocol: 'vnc', host: 'target', port: 5900, colorDepth: 24 }],
        })}
      />
    );

    // Enter a new JSON secret key — the only secret we change.
    fireEvent.change(screen.getByPlaceholderText('Enter the shared secret key'), {
      target: { value: 'deadbeefdeadbeefdeadbeefdeadbeef' },
    });

    fireEvent.click(screen.getByText('Save settings'));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('/api/plugins/sparkanswers-viewport-app/settings');
    expect(body.enabled).toBe(true);
    expect(body.pinned).toBe(true);
    expect(body.jsonData.guacamoleUrl).toBe('http://guacamole:8080/guacamole');
    expect(body.jsonData.connections).toHaveLength(1);
    // Only the changed secret is sent — no untouched password.* keys.
    expect(body.secureJsonData).toEqual({ jsonSecretKey: 'deadbeefdeadbeefdeadbeefdeadbeef' });
    expect(reloadMock).toHaveBeenCalled();
  });

  it('sends no secrets when none are changed', async () => {
    render(<AppConfig {...makeProps({ guacamoleUrl: 'http://g:8080', clientUrl: '/guacamole', connections: [] })} />);
    fireEvent.click(screen.getByText('Save settings'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1].secureJsonData).toEqual({});
  });
});
