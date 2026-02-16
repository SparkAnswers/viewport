import React from 'react';
import { useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { ConnectionState } from '../types';

interface Props {
  state: ConnectionState;
  isFullscreen: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleFullscreen: () => void;
}

const getStyles = (theme: GrafanaTheme2) => ({
  toolbar: css`
    display: flex;
    gap: 4px;
    padding: 4px;
    background: ${theme.colors.background.secondary};
    border-radius: ${theme.shape.radius.default};
    box-shadow: ${theme.shadows.z2};
  `,
  button: css`
    padding: 4px 12px;
    border: none;
    border-radius: ${theme.shape.radius.default};
    background: ${theme.colors.background.primary};
    color: ${theme.colors.text.primary};
    font-size: ${theme.typography.bodySmall.fontSize};
    cursor: pointer;
    white-space: nowrap;
    &:hover {
      background: ${theme.colors.action.hover};
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
  connectBtn: css`
    background: ${theme.colors.success.main};
    color: ${theme.colors.success.contrastText};
    &:hover {
      background: ${theme.colors.success.shade};
    }
  `,
  disconnectBtn: css`
    background: ${theme.colors.error.main};
    color: ${theme.colors.error.contrastText};
    &:hover {
      background: ${theme.colors.error.shade};
    }
  `,
});

export const ConnectionToolbar: React.FC<Props> = ({
  state,
  isFullscreen,
  onConnect,
  onDisconnect,
  onToggleFullscreen,
}) => {
  const styles = useStyles2(getStyles);
  const isConnected = state === ConnectionState.Connected;
  const isConnecting = state === ConnectionState.Connecting;

  return (
    <div className={styles.toolbar}>
      {isConnected || isConnecting ? (
        <button
          className={`${styles.button} ${styles.disconnectBtn}`}
          onClick={onDisconnect}
          title="Disconnect"
        >
          Disconnect
        </button>
      ) : (
        <button
          className={`${styles.button} ${styles.connectBtn}`}
          onClick={onConnect}
          title="Connect"
        >
          Connect
        </button>
      )}
      <button
        className={styles.button}
        onClick={onToggleFullscreen}
        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? 'Minimize' : 'Fullscreen'}
      </button>
    </div>
  );
};
