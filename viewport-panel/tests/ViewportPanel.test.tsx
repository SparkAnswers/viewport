import React from 'react';
import { render, screen } from '@testing-library/react';
import { ViewportPanel } from '../src/components/ViewportPanel';
import { defaultViewportOptions } from '../src/types';
import { FieldConfigSource, LoadingState, dateTime } from '@grafana/data';

// Mock Grafana UI hooks
jest.mock('@grafana/ui', () => ({
  useStyles2: (getStyles: Function) => getStyles({
    colors: {
      background: { primary: '#111', secondary: '#222', canvas: '#000' },
      text: { primary: '#fff', secondary: '#aaa', disabled: '#555' },
      border: { weak: '#333', medium: '#444' },
      primary: { main: '#3274D9', shade: '#2A5DB0', border: '#3274D9', contrastText: '#fff' },
      success: { main: '#1A7F4B', shade: '#15693E', contrastText: '#fff' },
      warning: { main: '#FF9830' },
      error: { main: '#E02F44', shade: '#C4162C', contrastText: '#fff' },
      action: { hover: 'rgba(255,255,255,0.08)' },
    },
    typography: {
      body: { fontSize: '14px' },
      bodySmall: { fontSize: '12px' },
      h4: { fontSize: '18px' },
      h5: { fontSize: '16px' },
    },
    shape: { radius: { default: '4px' } },
    shadows: { z2: 'none', z3: 'none' },
  }),
  useTheme2: () => ({}),
}));

// Mock @emotion/css
jest.mock('@emotion/css', () => ({
  css: (..._args: unknown[]) => 'mock-css-class',
}));

const makeProps = (overrides: Partial<typeof defaultViewportOptions> = {}) => ({
  id: 1,
  data: { series: [], state: LoadingState.Done, timeRange: { from: dateTime(), to: dateTime(), raw: { from: 'now-1h', to: 'now' } } },
  timeRange: { from: dateTime(), to: dateTime(), raw: { from: 'now-1h', to: 'now' } },
  timeZone: 'browser' as const,
  options: { ...defaultViewportOptions, ...overrides },
  fieldConfig: { defaults: {}, overrides: [] } as FieldConfigSource,
  width: 800,
  height: 600,
  transparent: false,
  renderCounter: 0,
  title: 'Viewport',
  replaceVariables: (s: string) => s,
  onOptionsChange: jest.fn(),
  onFieldConfigChange: jest.fn(),
  onChangeTimeRange: jest.fn(),
  eventBus: { subscribe: jest.fn(), getStream: jest.fn(), publish: jest.fn(), removeAllListeners: jest.fn(), newScopedBus: jest.fn() } as any,
});

describe('ViewportPanel', () => {
  it('renders without crashing', () => {
    const { container } = render(<ViewportPanel {...makeProps()} />);
    expect(container).toBeTruthy();
  });

  it('shows placeholder text when disconnected', () => {
    render(<ViewportPanel {...makeProps()} />);
    expect(screen.getByText(/Double-click or use toolbar to connect/i)).toBeTruthy();
  });

  it('shows disconnected status', () => {
    render(<ViewportPanel {...makeProps()} />);
    expect(screen.getByText('Disconnected')).toBeTruthy();
  });

  it('renders with custom options', () => {
    const { container } = render(
      <ViewportPanel {...makeProps({ connectionType: 'rdp', host: '10.0.0.1', port: 3389 })} />
    );
    expect(container).toBeTruthy();
  });

  it('calls replaceVariables on string options for template variable support', () => {
    const replaceVariables = jest.fn((s: string) => s.replace('${server}', '10.0.0.5'));
    const props = {
      ...makeProps({ host: '${server}', guacamoleUrl: 'http://${server}:8080/guacamole' }),
      replaceVariables,
    };
    render(<ViewportPanel {...props} />);
    expect(replaceVariables).toHaveBeenCalledWith('${server}');
    expect(replaceVariables).toHaveBeenCalledWith('http://${server}:8080/guacamole');
    expect(replaceVariables).toHaveBeenCalledWith('guacadmin'); // guacamoleUsername default
  });
});
