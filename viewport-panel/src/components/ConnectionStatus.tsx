import React from 'react';
import { useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { ConnectionState } from '../types';

interface Props {
  state: ConnectionState;
  error?: string;
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
    pointer-events: none;
    max-width: 100%;
  `,
  dot: css`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  `,
  connected: css`
    background-color: ${theme.colors.success.main};
  `,
  connecting: css`
    background-color: ${theme.colors.warning.main};
    animation: pulse 1.5s ease-in-out infinite;
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `,
  disconnected: css`
    background-color: ${theme.colors.text.disabled};
  `,
  error: css`
    background-color: ${theme.colors.error.main};
  `,
});

const stateLabels: Record<ConnectionState, string> = {
  [ConnectionState.Disconnected]: 'Disconnected',
  [ConnectionState.Connecting]: 'Connecting...',
  [ConnectionState.Connected]: 'Connected',
  [ConnectionState.Error]: 'Error',
};

export const ConnectionStatus: React.FC<Props> = ({ state, error }) => {
  const styles = useStyles2(getStyles);

  const dotClass = {
    [ConnectionState.Connected]: styles.connected,
    [ConnectionState.Connecting]: styles.connecting,
    [ConnectionState.Disconnected]: styles.disconnected,
    [ConnectionState.Error]: styles.error,
  }[state];

  return (
    <div className={styles.container}>
      <span className={`${styles.dot} ${dotClass}`} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={error || ''}>
        {error && state === ConnectionState.Error ? error : stateLabels[state]}
      </span>
    </div>
  );
};
