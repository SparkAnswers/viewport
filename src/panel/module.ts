import { PanelPlugin } from '@grafana/data';
import { ViewportPanel } from '../components/ViewportPanel';
import { ViewportPanelOptions, defaultViewportPanelOptions } from '../types';
import { ConnectionEditor } from './ConnectionEditor';
import { ProfileEditor } from './ProfileEditor';

export const plugin = new PanelPlugin<ViewportPanelOptions>(ViewportPanel).setPanelOptions((builder) => {
  builder
    .addRadio({
      path: 'mode',
      name: 'Mode',
      description: 'Connect to a named connection, or a dynamic host resolved against a credential profile.',
      defaultValue: defaultViewportPanelOptions.mode,
      settings: {
        options: [
          { value: 'connection', label: 'Connection' },
          { value: 'host', label: 'Host' },
        ],
      },
    })
    .addCustomEditor({
      id: 'connection',
      path: 'connection',
      name: 'Connection',
      description: 'Named connection defined in the Viewport app configuration. Supports dashboard variables (e.g. ${server}).',
      defaultValue: defaultViewportPanelOptions.connection,
      editor: ConnectionEditor,
      showIf: (opts) => (opts.mode ?? 'connection') === 'connection',
    })
    .addTextInput({
      path: 'host',
      name: 'Host',
      description: 'Target hostname or IP. Supports dashboard variables (e.g. ${server}).',
      defaultValue: defaultViewportPanelOptions.host,
      showIf: (opts) => opts.mode === 'host',
    })
    .addNumberInput({
      path: 'port',
      name: 'Port',
      description: 'Port override. 0 uses the profile port, then the protocol default.',
      defaultValue: defaultViewportPanelOptions.port,
      showIf: (opts) => opts.mode === 'host',
    })
    .addCustomEditor({
      id: 'profile',
      path: 'profile',
      name: 'Profile',
      description: 'Credential profile supplying the protocol and credentials. Supports dashboard variables.',
      defaultValue: defaultViewportPanelOptions.profile,
      editor: ProfileEditor,
      showIf: (opts) => opts.mode === 'host',
    })
    .addBooleanSwitch({
      path: 'autoConnect',
      name: 'Auto connect',
      description: 'Automatically connect when the panel loads.',
      defaultValue: defaultViewportPanelOptions.autoConnect,
    })
    .addBooleanSwitch({
      path: 'readOnly',
      name: 'Read only',
      description: 'Disable mouse and keyboard input (view only).',
      defaultValue: defaultViewportPanelOptions.readOnly,
    });
});
