const mockDisplay = {
  getElement: jest.fn(() => document.createElement('div')),
  getWidth: jest.fn(() => 1024),
  getHeight: jest.fn(() => 768),
  scale: jest.fn(),
  onresize: null,
};

const mockClient = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  getDisplay: jest.fn(() => mockDisplay),
  sendKeyEvent: jest.fn(),
  sendMouseState: jest.fn(),
  onstatechange: null,
  onerror: null,
  onclipboard: null,
};

const MockClient = jest.fn(() => mockClient);
MockClient.State = { IDLE: 0, CONNECTING: 1, WAITING: 2, CONNECTED: 3, DISCONNECTING: 4, DISCONNECTED: 5 };

const mockTunnel = { onerror: null, onstatechange: null };
const MockWebSocketTunnel = jest.fn(() => mockTunnel);
MockWebSocketTunnel.State = { CLOSED: 0, OPEN: 1, UNSTABLE: 2 };

const mockMouse = { onmousedown: null, onmouseup: null, onmousemove: null };
const MockMouse = jest.fn(() => mockMouse);
MockMouse.State = jest.fn();

const mockKeyboard = { onkeydown: null, onkeyup: null };
const MockKeyboard = jest.fn(() => mockKeyboard);

module.exports = {
  Guacamole: {
    Client: MockClient,
    WebSocketTunnel: MockWebSocketTunnel,
    Mouse: MockMouse,
    Keyboard: MockKeyboard,
    Display: jest.fn(() => mockDisplay),
  },
};
