import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { PanelProps } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { ViewportOptions, ConnectionState } from '../types';
import { GuacamoleService } from '../services/GuacamoleService';
import { GuacamoleDisplay } from './GuacamoleDisplay';
import { ConnectionToolbar } from './ConnectionToolbar';
import { ConnectionStatus } from './ConnectionStatus';
import { CredentialPrompt } from './CredentialPrompt';

type Props = PanelProps<ViewportOptions>;

const getStyles = (theme: GrafanaTheme2) => ({
  panel: css`
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: ${theme.colors.background.primary};
  `,
  toolbarOverlay: css`
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  `,
  toolbarVisible: css`
    opacity: 1;
    pointer-events: auto;
  `,
  statusBar: css`
    position: absolute;
    bottom: 0;
    left: 0;
    z-index: 10;
  `,
  fullscreenOverlay: css`
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: #000;
    display: flex;
    flex-direction: column;
  `,
  fullscreenHeader: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    background: ${theme.colors.background.secondary};
    flex-shrink: 0;
  `,
  fullscreenDisplay: css`
    flex: 1;
    overflow: hidden;
  `,
  placeholder: css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.h5.fontSize};
  `,
  hoverTrigger: css`
    &:hover .toolbar-overlay {
      opacity: 1;
    }
  `,
});

export const ViewportPanel: React.FC<Props> = ({ options, width, height, replaceVariables }) => {
  // Resolve Grafana template variables in string options
  const resolvedOptions = {
    ...options,
    guacamoleUrl: replaceVariables(options.guacamoleUrl),
    guacamoleUsername: replaceVariables(options.guacamoleUsername || 'guacadmin'),
    guacamolePassword: replaceVariables(options.guacamolePassword || 'guacadmin'),
    host: replaceVariables(options.host),
    username: replaceVariables(options.username),
    password: replaceVariables(options.password),
    domain: replaceVariables(options.domain),
    sshPrivateKey: replaceVariables(options.sshPrivateKey),
  };
  const styles = useStyles2(getStyles);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string>('');
  const [connectString, setConnectString] = useState<string>('');
  const [showCredentialPrompt, setShowCredentialPrompt] = useState(false);
  const serviceRef = useRef<GuacamoleService | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize service when URL changes
  useEffect(() => {
    if (resolvedOptions.guacamoleUrl) {
      serviceRef.current = new GuacamoleService(resolvedOptions.guacamoleUrl);
    }
  }, [resolvedOptions.guacamoleUrl]);

  // Auto-connect if configured
  useEffect(() => {
    if (resolvedOptions.autoConnect && resolvedOptions.host && resolvedOptions.guacamoleUsername && resolvedOptions.guacamolePassword) {
      handleConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedOptions.autoConnect]);

  // Escape key exits fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const handleConnect = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) {
      setErrorMessage('Guacamole URL not configured');
      setConnectionState(ConnectionState.Error);
      return;
    }

    // Prompt for target credentials if needed (RDP/SSH require username+password; VNC only needs password)
    const needsTargetCreds = resolvedOptions.connectionType !== 'vnc'
      && (!resolvedOptions.username || !resolvedOptions.password);
    if (needsTargetCreds) {
      setShowCredentialPrompt(true);
      return;
    }

    await doConnect(resolvedOptions.username, resolvedOptions.password);
  }, [resolvedOptions]);

  const doConnect = async (targetUsername: string, targetPassword: string) => {
    const service = serviceRef.current;
    if (!service) {
      return;
    }

    try {
      setConnectionState(ConnectionState.Connecting);
      setErrorMessage('');

      // Authenticate with Guacamole API using separate guacamole credentials
      const auth = await service.authenticate(
        resolvedOptions.guacamoleUsername,
        resolvedOptions.guacamolePassword
      );

      // Build target connection parameters
      const parameters: Record<string, string> = {
        hostname: resolvedOptions.host,
        port: String(resolvedOptions.port),
      };

      // Add target credentials based on protocol
      if (resolvedOptions.connectionType === 'vnc') {
        // VNC uses only a password, no username
        if (resolvedOptions.password || targetPassword) {
          parameters.password = resolvedOptions.password || targetPassword;
        }
        parameters['color-depth'] = String(resolvedOptions.colorDepth);
      } else if (resolvedOptions.connectionType === 'rdp') {
        // RDP uses username + password + security/cert settings
        parameters.username = resolvedOptions.username || targetUsername;
        parameters.password = resolvedOptions.password || targetPassword;
        if (resolvedOptions.domain) {
          parameters.domain = resolvedOptions.domain;
        }
        parameters.security = resolvedOptions.security || 'any';
        parameters['ignore-cert'] = resolvedOptions.ignoreCert ? 'true' : 'false';
        parameters['disable-auth'] = 'false';
      } else {
        // SSH uses username + password/key
        parameters.username = resolvedOptions.username || targetUsername;
        parameters.password = resolvedOptions.password || targetPassword;
        if (resolvedOptions.sshPrivateKey) {
          parameters['private-key'] = resolvedOptions.sshPrivateKey;
        }
      }

      // Create connection for this session
      const conn = await service.createConnection(auth.authToken, {
        name: `viewport-${Date.now()}`,
        protocol: resolvedOptions.connectionType,
        parameters,
      });

      // Build tunnel URL and connect string, then start display
      const url = service.buildTunnelUrl();
      const data = service.buildConnectString(auth.authToken, conn.identifier);
      setTunnelUrl(url);
      setConnectString(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Connection failed';
      setErrorMessage(message);
      setConnectionState(ConnectionState.Error);
    }
  };

  const handleDisconnect = useCallback(() => {
    setTunnelUrl('');
    setConnectString('');
    setConnectionState(ConnectionState.Disconnected);
    setErrorMessage('');
  }, []);

  const handleCredentialSubmit = useCallback((username: string, password: string) => {
    setShowCredentialPrompt(false);
    doConnect(username, password);
  }, [resolvedOptions]);

  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    setShowToolbar(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => setShowToolbar(false), 500);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (connectionState === ConnectionState.Connected) {
      setIsFullscreen(true);
    }
  }, [connectionState]);

  const renderDisplay = () => {
    if (!tunnelUrl) {
      return <div className={styles.placeholder}>Double-click or use toolbar to connect</div>;
    }

    return (
      <GuacamoleDisplay
        tunnelUrl={tunnelUrl}
        connectString={connectString}
        readOnly={resolvedOptions.readOnly}
        onStateChange={setConnectionState}
        onError={setErrorMessage}
      />
    );
  };

  const renderToolbar = () => (
    <div
      className={`${styles.toolbarOverlay} toolbar-overlay ${showToolbar ? styles.toolbarVisible : ''}`}
    >
      <ConnectionToolbar
        state={connectionState}
        isFullscreen={isFullscreen}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
      />
    </div>
  );

  // Fullscreen mode renders via portal
  if (isFullscreen) {
    return ReactDOM.createPortal(
      <div className={styles.fullscreenOverlay}>
        <div className={styles.fullscreenHeader}>
          <ConnectionStatus state={connectionState} error={errorMessage} />
          <ConnectionToolbar
            state={connectionState}
            isFullscreen={true}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onToggleFullscreen={() => setIsFullscreen(false)}
          />
        </div>
        <div className={styles.fullscreenDisplay}>{renderDisplay()}</div>
      </div>,
      document.body
    );
  }

  return (
    <div
      className={`${styles.panel} ${styles.hoverTrigger}`}
      style={{ width, height }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
    >
      {renderDisplay()}
      {renderToolbar()}
      <div className={styles.statusBar}>
        <ConnectionStatus state={connectionState} error={errorMessage} />
      </div>
      {showCredentialPrompt && (
        <CredentialPrompt
          onSubmit={handleCredentialSubmit}
          onCancel={() => setShowCredentialPrompt(false)}
        />
      )}
    </div>
  );
};
