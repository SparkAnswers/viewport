declare module 'guacamole-common-js' {
  namespace Guacamole {
    class Client {
      constructor(tunnel: Tunnel);
      connect(data?: string): void;
      disconnect(): void;
      getDisplay(): Display;
      sendKeyEvent(pressed: boolean, keysym: number): void;
      sendMouseState(state: Mouse.State): void;
      onclipboard: ((stream: InputStream, mimetype: string) => void) | null;
      onstatechange: ((state: number) => void) | null;
      onerror: ((status: Status) => void) | null;

      static State: {
        IDLE: 0;
        CONNECTING: 1;
        WAITING: 2;
        CONNECTED: 3;
        DISCONNECTING: 4;
        DISCONNECTED: 5;
      };
    }

    class WebSocketTunnel {
      constructor(url: string);
      onerror: ((status: Status) => void) | null;
      onstatechange: ((state: number) => void) | null;

      static State: {
        CLOSED: 0;
        OPEN: 1;
        UNSTABLE: 2;
      };
    }

    class HTTPTunnel {
      constructor(url: string, crossDomain?: boolean, extraHeaders?: Record<string, string>);
    }

    type Tunnel = WebSocketTunnel | HTTPTunnel;

    class Display {
      getElement(): HTMLElement;
      getWidth(): number;
      getHeight(): number;
      scale(factor: number): void;
      onresize: ((width: number, height: number) => void) | null;
    }

    class Mouse {
      constructor(element: HTMLElement);
      onmousedown: ((state: Mouse.State) => void) | null;
      onmouseup: ((state: Mouse.State) => void) | null;
      onmousemove: ((state: Mouse.State) => void) | null;

      static State: new () => Mouse.State;
    }

    namespace Mouse {
      interface State {
        x: number;
        y: number;
        left: boolean;
        middle: boolean;
        right: boolean;
        up: boolean;
        down: boolean;
      }
    }

    class Keyboard {
      constructor(element: HTMLElement | Document);
      onkeydown: ((keysym: number) => boolean | void) | null;
      onkeyup: ((keysym: number) => void) | null;
    }

    class InputStream {
      onblob: ((data: string) => void) | null;
      onend: (() => void) | null;
    }

    class Status {
      code: number;
      message: string;
      isError(): boolean;
    }

    class StringReader {
      constructor(stream: InputStream);
      ontext: ((text: string) => void) | null;
      onend: (() => void) | null;
    }
  }

  export default Guacamole;
}
