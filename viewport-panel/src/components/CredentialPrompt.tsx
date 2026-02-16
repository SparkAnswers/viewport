import React, { useState } from 'react';
import { useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';

interface Props {
  onSubmit: (username: string, password: string) => void;
  onCancel: () => void;
}

const getStyles = (theme: GrafanaTheme2) => ({
  overlay: css`
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    z-index: 1000;
  `,
  modal: css`
    background: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: 24px;
    min-width: 320px;
    box-shadow: ${theme.shadows.z3};
  `,
  title: css`
    margin: 0 0 16px;
    font-size: ${theme.typography.h4.fontSize};
    color: ${theme.colors.text.primary};
  `,
  field: css`
    margin-bottom: 12px;
  `,
  label: css`
    display: block;
    margin-bottom: 4px;
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
  `,
  input: css`
    width: 100%;
    padding: 8px;
    border: 1px solid ${theme.colors.border.medium};
    border-radius: ${theme.shape.radius.default};
    background: ${theme.colors.background.canvas};
    color: ${theme.colors.text.primary};
    font-size: ${theme.typography.body.fontSize};
    box-sizing: border-box;
    &:focus {
      outline: none;
      border-color: ${theme.colors.primary.border};
    }
  `,
  actions: css`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  `,
  button: css`
    padding: 6px 16px;
    border: none;
    border-radius: ${theme.shape.radius.default};
    cursor: pointer;
    font-size: ${theme.typography.body.fontSize};
  `,
  submitBtn: css`
    background: ${theme.colors.primary.main};
    color: ${theme.colors.primary.contrastText};
    &:hover {
      background: ${theme.colors.primary.shade};
    }
  `,
  cancelBtn: css`
    background: ${theme.colors.background.secondary};
    color: ${theme.colors.text.primary};
    &:hover {
      background: ${theme.colors.action.hover};
    }
  `,
});

export const CredentialPrompt: React.FC<Props> = ({ onSubmit, onCancel }) => {
  const styles = useStyles2(getStyles);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(username, password);
  };

  return (
    <div className={styles.overlay}>
      <form className={styles.modal} onSubmit={handleSubmit}>
        <h3 className={styles.title}>Connection Credentials</h3>
        <div className={styles.field}>
          <label className={styles.label}>Username</label>
          <input
            className={styles.input}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Password</label>
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.cancelBtn}`}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="submit" className={`${styles.button} ${styles.submitBtn}`}>
            Connect
          </button>
        </div>
      </form>
    </div>
  );
};
