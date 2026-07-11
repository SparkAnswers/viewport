import { getBackendSrv } from '@grafana/runtime';
import type { ConnectionSummary, ProfileSummary, SessionRequest, SessionResponse } from '../types';

const RESOURCE_BASE = '/api/plugins/sparkanswers-viewport-app/resources';

/**
 * Signals that the backend answered POST /session with 428 Precondition Required:
 * the resolved target needs credentials the request didn't carry. The panel opens
 * a credential dialog and retries.
 */
export interface NeedsCredentials {
  needsCredentials: true;
  usernameRequired: boolean;
  message: string;
}

export function isNeedsCredentials(x: unknown): x is NeedsCredentials {
  return typeof x === 'object' && x !== null && (x as { needsCredentials?: unknown }).needsCredentials === true;
}

/**
 * Extract a human-readable message from a getBackendSrv() rejection.
 * The backend returns errors as `{ error: "..." }` with a matching status.
 */
export function extractError(err: unknown): string {
  if (typeof err === 'string') {
    return err;
  }
  const e = err as { data?: { error?: string; message?: string }; statusText?: string; message?: string };
  return e?.data?.error || e?.data?.message || e?.statusText || e?.message || 'Request failed';
}

/**
 * Build the base WebSocket tunnel URL from the configured clientUrl.
 * guacamole-common-js WebSocketTunnel expects just the endpoint; connection
 * parameters are passed separately via client.connect(data).
 *
 * Absolute http(s) URLs are converted to ws(s). Relative URLs (e.g. `/guacamole`,
 * honoring Grafana sub-path deployments) are resolved against the current origin.
 */
export function buildTunnelUrl(clientUrl: string): string {
  const base = (clientUrl || '').replace(/\/+$/, '');
  if (/^https?:\/\//i.test(base)) {
    return base.replace(/^http/i, 'ws') + '/websocket-tunnel';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = base.startsWith('/') ? base : `/${base}`;
  return `${protocol}//${window.location.host}${path}/websocket-tunnel`;
}

/**
 * Build the URL-encoded connection parameter string passed to client.connect().
 */
export function buildConnectString(
  token: string,
  dataSource: string,
  identifier: string,
  width = 1024,
  height = 768,
  dpi = 96
): string {
  const params = new URLSearchParams({
    token,
    GUAC_DATA_SOURCE: dataSource,
    GUAC_ID: identifier,
    GUAC_TYPE: 'c',
    GUAC_WIDTH: String(width),
    GUAC_HEIGHT: String(height),
    GUAC_DPI: String(dpi),
  });
  return params.toString();
}

/**
 * Fetch the sanitized connection list for panel dropdowns.
 */
export async function listConnections(): Promise<ConnectionSummary[]> {
  const res = await getBackendSrv().get<{ connections?: ConnectionSummary[] }>(
    `${RESOURCE_BASE}/connections`,
    undefined,
    undefined,
    { showErrorAlert: false }
  );
  return res?.connections ?? [];
}

/**
 * Fetch the sanitized credential-profile list for panel dropdowns.
 */
export async function listProfiles(): Promise<ProfileSummary[]> {
  const res = await getBackendSrv().get<{ profiles?: ProfileSummary[] }>(
    `${RESOURCE_BASE}/profiles`,
    undefined,
    undefined,
    { showErrorAlert: false }
  );
  return res?.profiles ?? [];
}

/**
 * Mint a short-lived, single-connection Guacamole session. Accepts either a named
 * connection or a dynamic host+profile target, plus optional ephemeral credentials.
 * The response carries only the token and locators — no credentials.
 *
 * Throws a {@link NeedsCredentials} object when the backend responds 428, so the
 * caller can prompt for credentials and retry.
 */
export async function createSession(req: SessionRequest): Promise<SessionResponse> {
  try {
    return await getBackendSrv().post<SessionResponse>(`${RESOURCE_BASE}/session`, req, { showErrorAlert: false });
  } catch (err) {
    const e = err as { status?: number; data?: { needsCredentials?: boolean; usernameRequired?: boolean; error?: string } };
    if (e?.status === 428 || e?.data?.needsCredentials) {
      const needs: NeedsCredentials = {
        needsCredentials: true,
        usernameRequired: e?.data?.usernameRequired ?? true,
        message: e?.data?.error || 'This connection requires credentials.',
      };
      throw needs;
    }
    throw err;
  }
}
