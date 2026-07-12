import React, { useState, useCallback } from 'react';
import { AppPluginMeta, GrafanaTheme2, PluginConfigPageProps, SelectableValue } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import {
  Alert,
  Button,
  Field,
  FieldSet,
  IconButton,
  Input,
  Select,
  SecretInput,
  SecretTextArea,
  Switch,
  useStyles2,
} from '@grafana/ui';
import { css } from '@emotion/css';
import {
  ConnectionType,
  CredentialMode,
  RdpSecurity,
  ViewportAppJsonData,
  ViewportConnectionConfig,
  ViewportProfileConfig,
  defaultPorts,
} from '../types';

type Props = PluginConfigPageProps<AppPluginMeta<ViewportAppJsonData>>;

const PLUGIN_ID = 'sparkanswers-viewport-app';

const protocolOptions: Array<SelectableValue<ConnectionType>> = [
  { value: 'vnc', label: 'VNC' },
  { value: 'rdp', label: 'RDP' },
  { value: 'ssh', label: 'SSH' },
];

const securityOptions: Array<SelectableValue<RdpSecurity>> = [
  { value: 'any', label: 'Any' },
  { value: 'nla', label: 'NLA' },
  { value: 'tls', label: 'TLS' },
  { value: 'rdp', label: 'RDP' },
];

const colorDepthOptions: Array<SelectableValue<number>> = [
  { value: 8, label: '8-bit' },
  { value: 16, label: '16-bit' },
  { value: 24, label: '24-bit (True Color)' },
  { value: 32, label: '32-bit' },
];

const credentialModeOptions: Array<SelectableValue<CredentialMode>> = [
  { value: 'stored', label: 'Stored' },
  { value: 'prompt', label: 'Prompt (per session)' },
  { value: 'profile', label: 'Credential profile' },
];

const passwordKey = (name: string) => `password.${name}`;
const privateKeyKey = (name: string) => `privateKey.${name}`;
const profilePasswordKey = (name: string) => `profilePassword.${name}`;
const profileKeyKey = (name: string) => `profileKey.${name}`;

const parseHosts = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

const getStyles = (theme: GrafanaTheme2) => ({
  section: css`
    margin-bottom: ${theme.spacing(3)};
  `,
  card: css`
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(2)};
    margin-bottom: ${theme.spacing(2)};
    background: ${theme.colors.background.secondary};
  `,
  cardHeader: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: ${theme.spacing(1)};
  `,
  row: css`
    display: flex;
    gap: ${theme.spacing(2)};
    flex-wrap: wrap;
    & > * {
      flex: 1 1 220px;
    }
  `,
  actions: css`
    display: flex;
    gap: ${theme.spacing(2)};
    align-items: center;
    margin-top: ${theme.spacing(2)};
  `,
  healthResult: css`
    margin-top: ${theme.spacing(2)};
  `,
});

interface HealthState {
  status: 'ok' | 'error';
  message: string;
}

export const AppConfig: React.FC<Props> = ({ plugin }) => {
  const styles = useStyles2(getStyles);
  const { jsonData, secureJsonFields } = plugin.meta;

  const [guacamoleUrl, setGuacamoleUrl] = useState(jsonData?.guacamoleUrl ?? 'http://guacamole:8080/guacamole');
  const [clientUrl, setClientUrl] = useState(jsonData?.clientUrl ?? '/guacamole');
  const [connections, setConnections] = useState<ViewportConnectionConfig[]>(jsonData?.connections ?? []);
  const [profiles, setProfiles] = useState<ViewportProfileConfig[]>(jsonData?.profiles ?? []);

  // Secrets are write-only: we track only values the user actually enters, plus
  // which already-configured secrets the user chose to reset (clear). Keys are
  // `jsonSecretKey`, `password.<name>`, `privateKey.<name>`,
  // `profilePassword.<name>`, `profileKey.<name>`.
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [secretResets, setSecretResets] = useState<Record<string, boolean>>({});

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [health, setHealth] = useState<HealthState | null>(null);

  const isSecretConfigured = useCallback(
    (key: string) => Boolean(secureJsonFields?.[key]) && !secretResets[key],
    [secureJsonFields, secretResets]
  );

  const setSecretValue = useCallback((key: string, value: string) => {
    setSecretValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetSecret = useCallback((key: string) => {
    setSecretResets((prev) => ({ ...prev, [key]: true }));
    setSecretValues((prev) => ({ ...prev, [key]: '' }));
  }, []);

  const profileNameOptions: Array<SelectableValue<string>> = profiles
    .filter((p) => p.name)
    .map((p) => ({ label: p.name, value: p.name }));

  // --- Connections ---
  const updateConnection = useCallback((index: number, patch: Partial<ViewportConnectionConfig>) => {
    setConnections((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }, []);

  const addConnection = useCallback(() => {
    setConnections((prev) => [
      ...prev,
      { name: '', protocol: 'vnc', host: '', port: defaultPorts.vnc, colorDepth: 24, credentialMode: 'stored' },
    ]);
  }, []);

  const removeConnection = useCallback((index: number) => {
    setConnections((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const changeConnectionProtocol = useCallback(
    (index: number, protocol: ConnectionType) => {
      const current = connections[index];
      const wasDefault = current.port === defaultPorts[current.protocol];
      updateConnection(index, { protocol, port: wasDefault ? defaultPorts[protocol] : current.port });
    },
    [connections, updateConnection]
  );

  // --- Profiles ---
  const updateProfile = useCallback((index: number, patch: Partial<ViewportProfileConfig>) => {
    setProfiles((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }, []);

  const addProfile = useCallback(() => {
    setProfiles((prev) => [
      ...prev,
      { name: '', protocol: 'vnc', port: defaultPorts.vnc, colorDepth: 24, allowedHosts: [], promptCredentials: false },
    ]);
  }, []);

  const removeProfile = useCallback((index: number) => {
    setProfiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const changeProfileProtocol = useCallback(
    (index: number, protocol: ConnectionType) => {
      const current = profiles[index];
      const wasDefault = current.port === defaultPorts[current.protocol];
      updateProfile(index, { protocol, port: wasDefault ? defaultPorts[protocol] : current.port });
    },
    [profiles, updateProfile]
  );

  // Assemble only the secure keys the user changed (typed a new value or reset).
  const collectSecureJsonData = useCallback((): Record<string, string> => {
    const out: Record<string, string> = {};
    const changed = new Set<string>([...Object.keys(secretValues), ...Object.keys(secretResets)]);
    changed.forEach((key) => {
      out[key] = secretValues[key] ?? '';
    });
    return out;
  }, [secretValues, secretResets]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setSaveError('');
    try {
      await getBackendSrv().post(
        `/api/plugins/${PLUGIN_ID}/settings`,
        {
          enabled: true,
          pinned: true,
          jsonData: { guacamoleUrl, clientUrl, connections, profiles },
          secureJsonData: collectSecureJsonData(),
        },
        { showErrorAlert: false }
      );
      // Reload so plugin.meta (including secureJsonFields) reflects the saved state.
      window.location.reload();
    } catch (err) {
      const e = err as { data?: { message?: string }; statusText?: string };
      setSaveError(e?.data?.message || e?.statusText || 'Failed to save settings');
      setSaving(false);
    }
  }, [guacamoleUrl, clientUrl, connections, profiles, collectSecureJsonData]);

  const onHealthCheck = useCallback(async () => {
    setHealth(null);
    try {
      const res = await getBackendSrv().get<{ status?: string; message?: string }>(
        `/api/plugins/${PLUGIN_ID}/health`,
        undefined,
        undefined,
        { showErrorAlert: false }
      );
      setHealth({
        status: res?.status === 'OK' ? 'ok' : 'error',
        message:
          res?.message ||
          (res?.status === 'OK' ? 'Guacamole is reachable and settings are complete.' : 'Health check failed.'),
      });
    } catch (err) {
      const e = err as { data?: { message?: string }; statusText?: string };
      setHealth({ status: 'error', message: e?.data?.message || e?.statusText || 'Health check failed.' });
    }
  }, []);

  return (
    <div>
      <FieldSet label="Guacamole server" className={styles.section}>
        <Field label="Guacamole URL (server-side)" description="URL the Viewport backend uses to reach the Guacamole server.">
          <Input
            id="guacamole-url"
            width={60}
            value={guacamoleUrl}
            placeholder="http://guacamole:8080/guacamole"
            onChange={(e) => setGuacamoleUrl(e.currentTarget.value)}
          />
        </Field>
        <Field
          label="Client tunnel URL (browser-side)"
          description="Base URL the browser uses for the WebSocket tunnel. Relative URLs resolve against the current origin, honoring Grafana sub-paths."
        >
          <Input
            id="client-url"
            width={60}
            value={clientUrl}
            placeholder="/guacamole"
            onChange={(e) => setClientUrl(e.currentTarget.value)}
          />
        </Field>
        <Field label="JSON secret key" description="32-hex-char key shared with the Guacamole json-auth extension (its JSON_SECRET_KEY).">
          <SecretInput
            id="json-secret-key"
            width={60}
            isConfigured={isSecretConfigured('jsonSecretKey')}
            value={secretValues['jsonSecretKey'] ?? ''}
            placeholder="Enter the shared secret key"
            onChange={(e) => setSecretValue('jsonSecretKey', e.currentTarget.value)}
            onReset={() => resetSecret('jsonSecretKey')}
          />
        </Field>
      </FieldSet>

      <FieldSet label="Connections" className={styles.section}>
        {connections.length === 0 && <p>No connections defined yet. Add one below.</p>}

        {connections.map((conn, index) => {
          const pwKey = passwordKey(conn.name);
          const pkKey = privateKeyKey(conn.name);
          const credMode = conn.credentialMode ?? 'stored';
          const showStoredSecrets = credMode === 'stored';
          return (
            <div key={index} className={styles.card}>
              <div className={styles.cardHeader}>
                <strong>{conn.name || 'Unnamed connection'}</strong>
                <IconButton name="trash-alt" tooltip="Delete connection" aria-label="Delete connection" onClick={() => removeConnection(index)} />
              </div>

              <div className={styles.row}>
                <Field label="Name" description="Unique key referenced by panels.">
                  <Input value={conn.name} placeholder="Test VNC" onChange={(e) => updateConnection(index, { name: e.currentTarget.value })} />
                </Field>
                <Field label="Protocol">
                  <Select options={protocolOptions} value={conn.protocol} onChange={(v) => changeConnectionProtocol(index, (v.value as ConnectionType) ?? 'vnc')} />
                </Field>
              </div>

              <div className={styles.row}>
                <Field label="Host">
                  <Input value={conn.host} placeholder="target-host" onChange={(e) => updateConnection(index, { host: e.currentTarget.value })} />
                </Field>
                <Field label="Port">
                  <Input type="number" value={conn.port} onChange={(e) => updateConnection(index, { port: Number(e.currentTarget.value) })} />
                </Field>
              </div>

              <div className={styles.row}>
                <Field label="Credentials" description="Where this connection's password comes from.">
                  <Select
                    options={credentialModeOptions}
                    value={credMode}
                    onChange={(v) => updateConnection(index, { credentialMode: (v.value as CredentialMode) ?? 'stored' })}
                  />
                </Field>
                {credMode === 'profile' && (
                  <Field label="Credential profile" description="Profile that supplies the credential.">
                    <Select
                      options={profileNameOptions}
                      value={conn.credentialProfile ?? ''}
                      placeholder="Select a profile"
                      onChange={(v) => updateConnection(index, { credentialProfile: v?.value ?? '' })}
                    />
                  </Field>
                )}
              </div>

              {credMode === 'prompt' && (
                <p>Each user is asked for credentials at connect time; nothing is stored.</p>
              )}

              {conn.protocol === 'vnc' && (
                <div className={styles.row}>
                  {showStoredSecrets && (
                    <Field label="Password">
                      <SecretInput
                        isConfigured={isSecretConfigured(pwKey)}
                        value={secretValues[pwKey] ?? ''}
                        placeholder="VNC password"
                        onChange={(e) => setSecretValue(pwKey, e.currentTarget.value)}
                        onReset={() => resetSecret(pwKey)}
                      />
                    </Field>
                  )}
                  <Field label="Color depth">
                    <Select options={colorDepthOptions} value={conn.colorDepth ?? 24} onChange={(v) => updateConnection(index, { colorDepth: (v.value as number) ?? 24 })} />
                  </Field>
                </div>
              )}

              {conn.protocol === 'rdp' && (
                <>
                  <div className={styles.row}>
                    <Field label="Username">
                      <Input value={conn.username ?? ''} onChange={(e) => updateConnection(index, { username: e.currentTarget.value })} />
                    </Field>
                    <Field label="Domain">
                      <Input value={conn.domain ?? ''} onChange={(e) => updateConnection(index, { domain: e.currentTarget.value })} />
                    </Field>
                  </div>
                  <div className={styles.row}>
                    {showStoredSecrets && (
                      <Field label="Password">
                        <SecretInput
                          isConfigured={isSecretConfigured(pwKey)}
                          value={secretValues[pwKey] ?? ''}
                          placeholder="RDP password"
                          onChange={(e) => setSecretValue(pwKey, e.currentTarget.value)}
                          onReset={() => resetSecret(pwKey)}
                        />
                      </Field>
                    )}
                    <Field label="Security mode">
                      <Select options={securityOptions} value={conn.security ?? 'any'} onChange={(v) => updateConnection(index, { security: (v.value as RdpSecurity) ?? 'any' })} />
                    </Field>
                  </div>
                  <Field label="Ignore certificate errors" description="Accept untrusted/self-signed TLS certificates.">
                    <Switch value={conn.ignoreCert ?? false} onChange={(e) => updateConnection(index, { ignoreCert: e.currentTarget.checked })} />
                  </Field>
                </>
              )}

              {conn.protocol === 'ssh' && (
                <>
                  <div className={styles.row}>
                    <Field label="Username">
                      <Input value={conn.username ?? ''} onChange={(e) => updateConnection(index, { username: e.currentTarget.value })} />
                    </Field>
                    {showStoredSecrets && (
                      <Field label="Password">
                        <SecretInput
                          isConfigured={isSecretConfigured(pwKey)}
                          value={secretValues[pwKey] ?? ''}
                          placeholder="SSH password (optional)"
                          onChange={(e) => setSecretValue(pwKey, e.currentTarget.value)}
                          onReset={() => resetSecret(pwKey)}
                        />
                      </Field>
                    )}
                  </div>
                  {showStoredSecrets && (
                    <Field label="Private key" description="SSH private key for key-based auth (optional).">
                      <SecretTextArea
                        rows={4}
                        isConfigured={isSecretConfigured(pkKey)}
                        value={secretValues[pkKey] ?? ''}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                        onChange={(e) => setSecretValue(pkKey, e.currentTarget.value)}
                        onReset={() => resetSecret(pkKey)}
                      />
                    </Field>
                  )}
                </>
              )}
            </div>
          );
        })}

        <Button variant="secondary" icon="plus" onClick={addConnection}>
          Add connection
        </Button>
      </FieldSet>

      <FieldSet label="Credential profiles" className={styles.section}>
        <p>
          Reusable credentials decoupled from any host. Referenced by connections (credential mode &quot;Credential profile&quot;)
          and by panels in Host mode.
        </p>
        {profiles.map((prof, index) => {
          const ppKey = profilePasswordKey(prof.name);
          const pkKey = profileKeyKey(prof.name);
          const prompt = prof.promptCredentials ?? false;
          return (
            <div key={index} className={styles.card}>
              <div className={styles.cardHeader}>
                <strong>{prof.name || 'Unnamed profile'}</strong>
                <IconButton name="trash-alt" tooltip="Delete profile" aria-label="Delete profile" onClick={() => removeProfile(index)} />
              </div>

              <div className={styles.row}>
                <Field label="Name" description="Unique key referenced by panels and connections.">
                  <Input value={prof.name} placeholder="linux-vnc" onChange={(e) => updateProfile(index, { name: e.currentTarget.value })} />
                </Field>
                <Field label="Protocol">
                  <Select options={protocolOptions} value={prof.protocol} onChange={(v) => changeProfileProtocol(index, (v.value as ConnectionType) ?? 'vnc')} />
                </Field>
                <Field label="Port" description="0 uses the protocol default.">
                  <Input type="number" value={prof.port} onChange={(e) => updateProfile(index, { port: Number(e.currentTarget.value) })} />
                </Field>
              </div>

              {prof.protocol === 'rdp' && (
                <div className={styles.row}>
                  <Field label="Default username">
                    <Input value={prof.username ?? ''} onChange={(e) => updateProfile(index, { username: e.currentTarget.value })} />
                  </Field>
                  <Field label="Domain">
                    <Input value={prof.domain ?? ''} onChange={(e) => updateProfile(index, { domain: e.currentTarget.value })} />
                  </Field>
                  <Field label="Security mode">
                    <Select options={securityOptions} value={prof.security ?? 'any'} onChange={(v) => updateProfile(index, { security: (v.value as RdpSecurity) ?? 'any' })} />
                  </Field>
                </div>
              )}

              {prof.protocol === 'ssh' && (
                <div className={styles.row}>
                  <Field label="Default username">
                    <Input value={prof.username ?? ''} onChange={(e) => updateProfile(index, { username: e.currentTarget.value })} />
                  </Field>
                </div>
              )}

              {prof.protocol === 'vnc' && (
                <div className={styles.row}>
                  <Field label="Color depth">
                    <Select options={colorDepthOptions} value={prof.colorDepth ?? 24} onChange={(v) => updateProfile(index, { colorDepth: (v.value as number) ?? 24 })} />
                  </Field>
                </div>
              )}

              {prof.protocol === 'rdp' && (
                <Field label="Ignore certificate errors" description="Accept untrusted/self-signed TLS certificates.">
                  <Switch value={prof.ignoreCert ?? false} onChange={(e) => updateProfile(index, { ignoreCert: e.currentTarget.checked })} />
                </Field>
              )}

              <Field label="Allowed hosts" description="Comma or newline separated glob allowlist for host mode. Empty = any host.">
                <Input
                  value={(prof.allowedHosts ?? []).join(', ')}
                  placeholder="10.0.*, test-target*"
                  onChange={(e) => updateProfile(index, { allowedHosts: parseHosts(e.currentTarget.value) })}
                />
              </Field>

              <Field label="Prompt for credentials" description="Ask the user per session instead of storing a credential.">
                <Switch value={prompt} onChange={(e) => updateProfile(index, { promptCredentials: e.currentTarget.checked })} />
              </Field>

              {!prompt && (
                <>
                  <Field label="Password">
                    <SecretInput
                      isConfigured={isSecretConfigured(ppKey)}
                      value={secretValues[ppKey] ?? ''}
                      placeholder="Profile password"
                      onChange={(e) => setSecretValue(ppKey, e.currentTarget.value)}
                      onReset={() => resetSecret(ppKey)}
                    />
                  </Field>
                  {prof.protocol === 'ssh' && (
                    <Field label="Private key" description="SSH private key for key-based auth (optional).">
                      <SecretTextArea
                        rows={4}
                        isConfigured={isSecretConfigured(pkKey)}
                        value={secretValues[pkKey] ?? ''}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                        onChange={(e) => setSecretValue(pkKey, e.currentTarget.value)}
                        onReset={() => resetSecret(pkKey)}
                      />
                    </Field>
                  )}
                </>
              )}
            </div>
          );
        })}

        <Button variant="secondary" icon="plus" onClick={addProfile}>
          Add profile
        </Button>
      </FieldSet>

      {saveError && (
        <Alert title="Could not save settings" severity="error">
          {saveError}
        </Alert>
      )}

      <div className={styles.actions}>
        <Button onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </Button>
        <Button variant="secondary" onClick={onHealthCheck}>
          Run health check
        </Button>
      </div>

      {health && (
        <div className={styles.healthResult}>
          <Alert title={health.status === 'ok' ? 'Healthy' : 'Unhealthy'} severity={health.status === 'ok' ? 'success' : 'error'}>
            {health.message}
          </Alert>
        </div>
      )}
    </div>
  );
};
