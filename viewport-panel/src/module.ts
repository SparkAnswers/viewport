import { PanelPlugin } from '@grafana/data';
import { ViewportPanel } from './components/ViewportPanel';
import { ViewportOptions, defaultViewportOptions } from './types';

export const plugin = new PanelPlugin<ViewportOptions>(ViewportPanel).setPanelOptions(
  (builder) => {
    builder
      .addSelect({
        path: 'connectionType',
        name: 'Connection Type',
        description: 'Remote desktop protocol to use',
        defaultValue: defaultViewportOptions.connectionType,
        settings: {
          options: [
            { value: 'vnc', label: 'VNC' },
            { value: 'rdp', label: 'RDP' },
            { value: 'ssh', label: 'SSH' },
          ],
        },
      })
      .addTextInput({
        path: 'guacamoleUrl',
        name: 'Guacamole URL',
        description: 'Base URL of the Guacamole server. Supports Grafana variables (e.g. ${guac_url})',
        defaultValue: defaultViewportOptions.guacamoleUrl,
      })
      .addTextInput({
        path: 'guacamoleUsername',
        name: 'Guacamole Username',
        description: 'Username for Guacamole API authentication (not the target machine)',
        defaultValue: defaultViewportOptions.guacamoleUsername,
      })
      .addTextInput({
        path: 'guacamolePassword',
        name: 'Guacamole Password',
        description: 'Password for Guacamole API authentication (not the target machine)',
        defaultValue: defaultViewportOptions.guacamolePassword,
      })
      .addTextInput({
        path: 'host',
        name: 'Host',
        description: 'Hostname or IP of the remote machine. Supports Grafana variables (e.g. ${hostname})',
        defaultValue: defaultViewportOptions.host,
      })
      .addNumberInput({
        path: 'port',
        name: 'Port',
        description: 'Port number (default: VNC=5900, RDP=3389, SSH=22)',
        defaultValue: defaultViewportOptions.port,
      })
      .addTextInput({
        path: 'username',
        name: 'Username',
        description: 'Username for authentication. Supports Grafana variables (e.g. ${user}). Leave blank to prompt',
        defaultValue: defaultViewportOptions.username,
      })
      .addTextInput({
        path: 'password',
        name: 'Password',
        description: 'Password for authentication. Supports Grafana variables (e.g. ${password}). Leave blank to prompt',
        defaultValue: defaultViewportOptions.password,
      })
      .addTextInput({
        path: 'domain',
        name: 'Domain',
        description: 'Domain for RDP authentication. Supports Grafana variables (e.g. ${domain})',
        defaultValue: defaultViewportOptions.domain,
        showIf: (config) => config.connectionType === 'rdp',
      })
      .addSelect({
        path: 'colorDepth',
        name: 'Color Depth',
        description: 'Color depth for VNC connections',
        defaultValue: defaultViewportOptions.colorDepth,
        settings: {
          options: [
            { value: 8, label: '8-bit' },
            { value: 16, label: '16-bit' },
            { value: 24, label: '24-bit (True Color)' },
            { value: 32, label: '32-bit' },
          ],
        },
        showIf: (config) => config.connectionType === 'vnc',
      })
      .addTextInput({
        path: 'sshPrivateKey',
        name: 'SSH Private Key',
        description: 'Private key for SSH key-based auth. Supports Grafana variables',
        defaultValue: defaultViewportOptions.sshPrivateKey,
        showIf: (config) => config.connectionType === 'ssh',
      })
      .addSelect({
        path: 'security',
        name: 'Security Mode',
        description: 'RDP security negotiation mode',
        defaultValue: defaultViewportOptions.security,
        settings: {
          options: [
            { value: 'any', label: 'Any' },
            { value: 'nla', label: 'NLA' },
            { value: 'tls', label: 'TLS' },
            { value: 'rdp', label: 'RDP' },
          ],
        },
        showIf: (config) => config.connectionType === 'rdp',
      })
      .addBooleanSwitch({
        path: 'ignoreCert',
        name: 'Ignore Certificate Errors',
        description: 'Accept untrusted/self-signed TLS certificates',
        defaultValue: defaultViewportOptions.ignoreCert,
        showIf: (config) => config.connectionType === 'rdp',
      })
      .addBooleanSwitch({
        path: 'autoConnect',
        name: 'Auto Connect',
        description: 'Automatically connect when the panel loads',
        defaultValue: defaultViewportOptions.autoConnect,
      })
      .addBooleanSwitch({
        path: 'readOnly',
        name: 'Read Only',
        description: 'Disable mouse and keyboard input (view only)',
        defaultValue: defaultViewportOptions.readOnly,
      });
  }
);
