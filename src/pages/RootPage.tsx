import React from 'react';
import { AppRootProps, GrafanaTheme2 } from '@grafana/data';
import { PluginPage } from '@grafana/runtime';
import { Icon, LinkButton, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { ViewportAppJsonData } from '../types';

const PLUGIN_ID = 'sparkanswers-viewport-app';

const getStyles = (theme: GrafanaTheme2) => ({
  intro: css`
    max-width: 720px;
    color: ${theme.colors.text.secondary};
    margin-bottom: ${theme.spacing(3)};
  `,
  steps: css`
    max-width: 720px;
    margin: 0 0 ${theme.spacing(3)};
    padding-left: ${theme.spacing(3)};
    li {
      margin-bottom: ${theme.spacing(1)};
    }
  `,
  actions: css`
    display: flex;
    gap: ${theme.spacing(2)};
    align-items: center;
  `,
  proto: css`
    display: flex;
    gap: ${theme.spacing(1)};
    align-items: center;
    margin-bottom: ${theme.spacing(1)};
    color: ${theme.colors.text.primary};
  `,
});

// Root landing page for the app (route: /a/sparkanswers-viewport-app). App
// plugins need a root page component or Grafana renders "no root app page
// component found"; the substantive UI lives on the Configuration page and in
// the Viewport panel, so this is a lightweight overview that points there.
export const RootPage: React.FC<AppRootProps<ViewportAppJsonData>> = () => {
  const styles = useStyles2(getStyles);

  return (
    <PluginPage>
      <p className={styles.intro}>
        Viewport embeds live VNC, RDP, and SSH sessions directly in Grafana dashboards, brokered through Apache
        Guacamole. Credentials are handled server-side and never sent to the browser.
      </p>

      <div className={styles.proto}>
        <Icon name="monitor" /> VNC &nbsp;·&nbsp; <Icon name="calculator-alt" /> RDP &nbsp;·&nbsp;{' '}
        <Icon name="keyboard" /> SSH
      </div>

      <h3>Getting started</h3>
      <ol className={styles.steps}>
        <li>
          Open <strong>Configuration</strong> and set the Guacamole server URL, the shared JSON secret key, then define
          your connections and credential profiles.
        </li>
        <li>Run the health check to confirm the backend can reach Guacamole.</li>
        <li>
          Add a <strong>Viewport</strong> panel to any dashboard and pick a connection, or use Host mode with a
          credential profile for fleet drill-downs.
        </li>
      </ol>

      <div className={styles.actions}>
        <LinkButton icon="cog" href={`/plugins/${PLUGIN_ID}`}>
          Configuration
        </LinkButton>
        <LinkButton variant="secondary" icon="external-link-alt" href={`/plugins/${PLUGIN_ID}?page=configuration`}>
          Connections &amp; profiles
        </LinkButton>
      </div>
    </PluginPage>
  );
};
