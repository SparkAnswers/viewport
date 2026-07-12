import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { PanelProps, GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { ViewportPanelOptions, ConnectionState, SessionRequest, SessionCredentials } from '../types';
import { createSession, buildTunnelUrl, buildConnectString, extractError, isNeedsCredentials } from '../services/BackendService';
import { GuacamoleDisplay } from './GuacamoleDisplay';
import { ConnectionToolbar } from './ConnectionToolbar';
import { ConnectionStatus } from './ConnectionStatus';
import { CredentialPrompt } from './CredentialPrompt';

type Props = PanelProps<ViewportPanelOptions>;

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
    text-align: center;
    padding: 0 16px;
  `,
  hoverTrigger: css`
    &:hover .toolbar-overlay {
      opacity: 1;
    }
  `,
});

export const ViewportPanel: React.FC<Props> = ({ options, width, height, replaceVariables }) => {
  const styles = useStyles2(getStyles);

  // Resolve the target from panel options (variables allowed in string fields).
  // The panel never holds credentials in options — those arrive from the prompt.
  const mode = options.mode ?? 'connection';
  const connection = replaceVariables(options.connection || '').trim();
  const host = replaceVariables(options.host || '').trim();
  const profile = replaceVariables(options.profile || '').trim();
  const port = options.port || 0;

  const hasTarget = mode === 'host' ? Boolean(host && profile) : Boolean(connection);
  // Stable identity of the current target; changing it clears session + prompted creds.
  const targetKey = mode === 'host' ? `h:${profile}@${host}:${port}` : `c:${connection}`;

  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string>('');
  const [connectString, setConnectString] = useState<string>('');
  const [credPrompt, setCredPrompt] = useState<{ usernameRequired: boolean; error: string } | null>(null);
  // Prompted credentials live only here, in component memory — never in options,
  // dashboard JSON, or storage.
  const credsRef = useRef<SessionCredentials | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doConnect = useCallback(async () => {
    if (!hasTarget) {
      setErrorMessage(mode === 'host' ? 'Set a host and profile in panel options' : 'No connection selected');
      setConnectionState(ConnectionState.Error);
      return;
    }

    const req: SessionRequest = mode === 'host' ? { host, profile, port } : { connection };
    if (credsRef.current) {
      req.username = credsRef.current.username;
      req.password = credsRef.current.password;
      req.domain = credsRef.current.domain;
    }

    try {
      setConnectionState(ConnectionState.Connecting);
      setErrorMessage('');
      const session = await createSession(req);
      setTunnelUrl(buildTunnelUrl(session.clientUrl));
      setConnectString(
        buildConnectString(session.token, session.dataSource, session.identifier, Math.round(width), Math.round(height))
      );
    } catch (err) {
      if (isNeedsCredentials(err)) {
        // Backend answered 428: open the prompt (retaining any prior message) and wait.
        setConnectionState(ConnectionState.Disconnected);
        setCredPrompt({ usernameRequired: err.usernameRequired, error: credsRef.current ? err.message : '' });
      } else {
        setErrorMessage(extractError(err));
        setConnectionState(ConnectionState.Error);
      }
    }
  }, [hasTarget, mode, connection, host, profile, port, width, height]);

  const handleDisconnect = useCallback(() => {
    setTunnelUrl('');
    setConnectString('');
    setConnectionState(ConnectionState.Disconnected);
    setErrorMessage('');
    setCredPrompt(null);
  }, []);

  const handleCredentialSubmit = useCallback(
    (creds: SessionCredentials) => {
      credsRef.current = creds;
      setCredPrompt(null);
      doConnect();
    },
    [doConnect]
  );

  const handleCredentialCancel = useCallback(() => {
    setCredPrompt(null);
    setConnectionState(ConnectionState.Disconnected);
  }, []);

  // When the resolved target changes, drop the old session and any prompted
  // credentials so a different host/connection starts clean. Resetting state in
  // this effect is intentional (a target change is an external input).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    credsRef.current = null;
    setTunnelUrl('');
    setConnectString('');
    setCredPrompt(null);
    setErrorMessage('');
    setConnectionState(ConnectionState.Disconnected);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [targetKey]);

  // Auto-connect on load and reconnect when the resolved target changes.
  useEffect(() => {
    if (options.autoConnect && hasTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      doConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.autoConnect, targetKey]);

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

  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    setShowToolbar(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => setShowToolbar(false), 500);
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // Recent Grafana versions open the panel editor on double-click; keep the
      // event to ourselves so double-click means "go fullscreen" instead.
      e.stopPropagation();
      e.preventDefault();
      if (connectionState === ConnectionState.Connected) {
        setIsFullscreen(true);
      }
    },
    [connectionState]
  );

  const renderDisplay = () => {
    if (!hasTarget) {
      return (
        <div className={styles.placeholder}>
          {mode === 'host' ? 'Set a host and profile in panel options' : 'Select a connection in panel options'}
        </div>
      );
    }
    if (!tunnelUrl) {
      return <div className={styles.placeholder}>Double-click or use toolbar to connect</div>;
    }

    return (
      <GuacamoleDisplay
        tunnelUrl={tunnelUrl}
        connectString={connectString}
        readOnly={options.readOnly}
        autoFocus={isFullscreen}
        onStateChange={setConnectionState}
        onError={setErrorMessage}
      />
    );
  };

  const renderToolbar = () => (
    <div className={`${styles.toolbarOverlay} toolbar-overlay ${showToolbar ? styles.toolbarVisible : ''}`}>
      <ConnectionToolbar
        state={connectionState}
        isFullscreen={isFullscreen}
        onConnect={doConnect}
        onDisconnect={handleDisconnect}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
      />
    </div>
  );

  const renderCredentialPrompt = () =>
    credPrompt && (
      <CredentialPrompt
        usernameRequired={credPrompt.usernameRequired}
        error={credPrompt.error}
        onSubmit={handleCredentialSubmit}
        onCancel={handleCredentialCancel}
      />
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
            onConnect={doConnect}
            onDisconnect={handleDisconnect}
            onToggleFullscreen={() => setIsFullscreen(false)}
          />
        </div>
        <div className={styles.fullscreenDisplay}>{renderDisplay()}</div>
        {renderCredentialPrompt()}
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
      {renderCredentialPrompt()}
    </div>
  );
};
