import React, { useEffect, useRef, useCallback } from 'react';
import { useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import Guacamole from 'guacamole-common-js';
import { ConnectionState } from '../types';

interface Props {
  tunnelUrl: string;
  connectString: string;
  readOnly: boolean;
  onStateChange: (state: ConnectionState) => void;
  onError: (message: string) => void;
}

const getStyles = () => ({
  container: css`
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    background: #000;
  `,
  display: css`
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: top left;
  `,
});

export const GuacamoleDisplay: React.FC<Props> = ({
  tunnelUrl,
  connectString,
  readOnly,
  onStateChange,
  onError,
}) => {
  const styles = useStyles2(getStyles);
  const containerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<Guacamole.Client | null>(null);
  const mouseRef = useRef<Guacamole.Mouse | null>(null);
  const keyboardRef = useRef<Guacamole.Keyboard | null>(null);
  const scaleRef = useRef<number>(1);

  const scaleDisplay = useCallback(() => {
    const client = clientRef.current;
    const container = containerRef.current;
    if (!client || !container) {
      return;
    }

    const display = client.getDisplay();
    const displayWidth = display.getWidth();
    const displayHeight = display.getHeight();
    if (displayWidth === 0 || displayHeight === 0) {
      return;
    }

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const scale = Math.min(containerWidth / displayWidth, containerHeight / displayHeight);
    scaleRef.current = scale;
    display.scale(scale);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !tunnelUrl) {
      return;
    }

    const container = containerRef.current;

    // Create tunnel and client
    const tunnel = new Guacamole.WebSocketTunnel(tunnelUrl);
    const client = new Guacamole.Client(tunnel);
    clientRef.current = client;

    // Append display element
    const displayElement = client.getDisplay().getElement();
    container.appendChild(displayElement);

    // Handle state changes
    client.onstatechange = (state: number) => {
      switch (state) {
        case 1: // CONNECTING
        case 2: // WAITING
          onStateChange(ConnectionState.Connecting);
          break;
        case 3: // CONNECTED
          onStateChange(ConnectionState.Connected);
          scaleDisplay();
          break;
        case 4: // DISCONNECTING
        case 5: // DISCONNECTED
          onStateChange(ConnectionState.Disconnected);
          break;
      }
    };

    // Map Guacamole status codes to human-readable messages
    const describeStatus = (status: Guacamole.Status): string => {
      const codeDescriptions: Record<number, string> = {
        0x0200: 'Internal server error',
        0x0201: 'Server busy',
        0x0202: 'Upstream timeout',
        0x0203: 'Server refused connection — check credentials and security mode',
        0x0204: 'Resource not found',
        0x0205: 'Resource already in use',
        0x0206: 'Insufficient permissions',
        0x0207: 'Invalid credentials — check username/password',
        0x0301: 'Upstream unavailable — is the target host reachable?',
        0x0303: 'Session conflict',
        0x0308: 'Upstream not found — check hostname and port',
        0x030D: 'Session timed out',
        0x0310: 'Upstream error — RDP/VNC server rejected the connection (check security mode, certificates, or credentials)',
      };
      const desc = codeDescriptions[status.code];
      const detail = status.message && status.message !== 'Connection error' && status.message !== 'Tunnel error'
        ? status.message
        : '';
      const codeHex = `0x${status.code.toString(16).toUpperCase().padStart(4, '0')}`;
      if (desc && detail) {
        return `${desc}: ${detail} (${codeHex})`;
      }
      if (desc) {
        return `${desc} (${codeHex})`;
      }
      if (detail) {
        return `${detail} (${codeHex})`;
      }
      return `Connection failed (${codeHex})`;
    };

    // Handle errors
    client.onerror = (status: Guacamole.Status) => {
      onError(describeStatus(status));
      onStateChange(ConnectionState.Error);
    };

    tunnel.onerror = (status: Guacamole.Status) => {
      onError(describeStatus(status));
      onStateChange(ConnectionState.Error);
    };

    // Handle display resize
    client.getDisplay().onresize = () => {
      scaleDisplay();
    };

    // Shared handler reference for cleanup
    const stopPropagation = (e: Event) => e.stopPropagation();

    // Focus the container on any click inside the display so keyboard
    // events are captured. Guacamole.Mouse may stopPropagation, so
    // we attach directly to the display element with `capture: true`.
    const focusContainer = () => container.focus();
    displayElement.addEventListener('mousedown', focusContainer, true);

    // Set up input if not read-only
    if (!readOnly) {
      // Attach mouse to the container so coordinates are relative to
      // the unscaled container bounds, then translate to remote desktop
      // coordinates by dividing by the CSS scale factor.
      const mouse = new Guacamole.Mouse(displayElement);
      mouseRef.current = mouse;

      mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = (state) => {
        // Unscale mouse coordinates: the display element is CSS-scaled,
        // so browser coordinates are in scaled space but the server
        // expects coordinates in the original (unscaled) remote desktop space.
        // IMPORTANT: Do NOT mutate state directly — it is the shared
        // currentState from Guacamole.Mouse.Event.Target.  Mutating it
        // causes subsequent events (mousedown/mouseup) to double-scale.
        const scale = scaleRef.current;
        client.sendMouseState(Object.assign(new Guacamole.Mouse.State(), state, {
          x: state.x / scale,
          y: state.y / scale,
        }));
      };

      // Attach keyboard to the container (not document) so Grafana
      // doesn't intercept keystrokes. The container has tabIndex={0}
      // to make it focusable.
      const keyboard = new Guacamole.Keyboard(container);
      keyboardRef.current = keyboard;

      keyboard.onkeydown = (keysym: number) => {
        // Pass 1/0 instead of true/false — guacd parses the pressed field
        // as an integer, so boolean "true"/"false" strings are treated as 0.
        client.sendKeyEvent(1 as unknown as boolean, keysym);
        // Return false to tell Guacamole.Keyboard to preventDefault on the
        // DOM event so the browser does not also handle the keystroke.
        return false;
      };

      keyboard.onkeyup = (keysym: number) => {
        client.sendKeyEvent(0 as unknown as boolean, keysym);
      };

      // Prevent keyboard events from bubbling to Grafana
      container.addEventListener('keydown', stopPropagation);
      container.addEventListener('keyup', stopPropagation);
      container.addEventListener('keypress', stopPropagation);
    }

    // Connect — pass connection parameters to the tunnel
    onStateChange(ConnectionState.Connecting);
    client.connect(connectString);

    // Handle container resize
    const resizeObserver = new ResizeObserver(() => {
      scaleDisplay();
    });
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      resizeObserver.disconnect();

      displayElement.removeEventListener('mousedown', focusContainer, true);
      container.removeEventListener('keydown', stopPropagation);
      container.removeEventListener('keyup', stopPropagation);
      container.removeEventListener('keypress', stopPropagation);

      keyboardRef.current = null;
      mouseRef.current = null;

      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }

      // Remove display element
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [tunnelUrl, connectString, readOnly, onStateChange, onError, scaleDisplay]);

  const handleContainerClick = useCallback(() => {
    // Focus the container so keyboard events are captured
    containerRef.current?.focus();
  }, []);

  return (
    <div
      ref={containerRef}
      className={styles.container}
      tabIndex={0}
      onClick={handleContainerClick}
      style={{ outline: 'none' }}
    />
  );
};
