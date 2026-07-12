package plugin

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testKeyHex = "4c0b569e4c96df157eee1b65dd0e4d41"

// decodeAuthPayload reverses signEncrypt: base64 -> AES-128-CBC decrypt -> strip
// PKCS#7 -> verify the 32-byte HMAC prefix -> return the JSON payload. It fails
// the test if the signature does not match, proving the server can trust it.
func decodeAuthPayload(t *testing.T, key []byte, blob string) authPayload {
	t.Helper()
	ciphertext, err := base64.StdEncoding.DecodeString(blob)
	if err != nil {
		t.Fatalf("blob not base64: %v", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	if len(ciphertext)%block.BlockSize() != 0 || len(ciphertext) == 0 {
		t.Fatalf("ciphertext length %d not a block multiple", len(ciphertext))
	}
	iv := make([]byte, block.BlockSize())
	plain := make([]byte, len(ciphertext))
	cipher.NewCBCDecrypter(block, iv).CryptBlocks(plain, ciphertext)

	pad := int(plain[len(plain)-1])
	if pad < 1 || pad > block.BlockSize() || pad > len(plain) {
		t.Fatalf("bad PKCS#7 padding: %d", pad)
	}
	plain = plain[:len(plain)-pad]

	if len(plain) < sha256.Size {
		t.Fatal("payload shorter than signature")
	}
	sig, jsonBytes := plain[:sha256.Size], plain[sha256.Size:]

	mac := hmac.New(sha256.New, key)
	mac.Write(jsonBytes)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		t.Fatal("HMAC signature does not verify")
	}

	var p authPayload
	if err := json.Unmarshal(jsonBytes, &p); err != nil {
		t.Fatalf("payload not valid JSON: %v", err)
	}
	return p
}

// fakeGuacamole stands in for a real Guacamole server and records the payload it
// received so the test can assert on it. It reports one connection (connName ->
// connID) in its connection listing so identifier resolution can be exercised.
func fakeGuacamole(t *testing.T, key []byte, got *authPayload, connName, connID string) *httptest.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/tokens", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Errorf("parse form: %v", err)
		}
		*got = decodeAuthPayload(t, key, r.PostForm.Get("data"))
		writeJSON(w, http.StatusOK, map[string]string{"authToken": "tok-123", "dataSource": "json"})
	})
	mux.HandleFunc("/api/session/data/json/connections", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("token") != "tok-123" {
			t.Errorf("connections list called with wrong token: %q", r.URL.Query().Get("token"))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			connID: map[string]string{"name": connName, "identifier": connID},
		})
	})
	return httptest.NewServer(mux)
}

func testApp(t *testing.T, guacURL string) *App {
	t.Helper()
	s := &Settings{
		GuacamoleURL: guacURL,
		ClientURL:    "/guacamole",
		Connections: []Connection{
			{Name: "Test VNC", Protocol: "vnc", Host: "test-target", Port: 5900, ColorDepth: 24},
		},
		jsonSecretKey: testKeyHex,
		passwords:     map[string]string{"Test VNC": "vnc-secret"},
		privateKeys:   map[string]string{},
	}
	return &App{settings: s, http: &http.Client{}}
}

func TestHandleSession(t *testing.T) {
	key, _ := hex.DecodeString(testKeyHex)
	var got authPayload
	guac := fakeGuacamole(t, key, &got, "Test VNC", "conn-id-1")
	defer guac.Close()

	app := testApp(t, guac.URL)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/session", strings.NewReader(`{"connection":"Test VNC"}`))
	app.handleSession(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body.String())
	}

	var resp sessionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Token != "tok-123" || resp.DataSource != "json" || resp.Identifier != "conn-id-1" || resp.ClientURL != "/guacamole" {
		t.Errorf("unexpected response: %+v", resp)
	}

	// The fake server verified the signature; now assert the decrypted payload.
	if got.Username != "viewport" {
		t.Errorf("username: %q (want viewport for anonymous request)", got.Username)
	}
	if got.Expires <= 0 {
		t.Errorf("expires not set: %d", got.Expires)
	}
	conn, ok := got.Connections["Test VNC"]
	if !ok {
		t.Fatalf("connection missing from payload: %+v", got.Connections)
	}
	if conn.Protocol != "vnc" {
		t.Errorf("protocol: %q", conn.Protocol)
	}
	if conn.Parameters["hostname"] != "test-target" || conn.Parameters["port"] != "5900" ||
		conn.Parameters["password"] != "vnc-secret" || conn.Parameters["color-depth"] != "24" {
		t.Errorf("parameters: %+v", conn.Parameters)
	}
}

func TestHandleSessionErrors(t *testing.T) {
	key, _ := hex.DecodeString(testKeyHex)
	var got authPayload
	guac := fakeGuacamole(t, key, &got, "Test VNC", "conn-id-1")
	defer guac.Close()

	t.Run("bad body", func(t *testing.T) {
		app := testApp(t, guac.URL)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/session", strings.NewReader(`not json`))
		app.handleSession(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status %d", rec.Code)
		}
		assertErrorBody(t, rec.Body.Bytes())
	})

	t.Run("unknown connection", func(t *testing.T) {
		app := testApp(t, guac.URL)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/session", strings.NewReader(`{"connection":"nope"}`))
		app.handleSession(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("status %d", rec.Code)
		}
		assertErrorBody(t, rec.Body.Bytes())
	})

	t.Run("missing secret key", func(t *testing.T) {
		app := testApp(t, guac.URL)
		app.settings.jsonSecretKey = ""
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/session", strings.NewReader(`{"connection":"Test VNC"}`))
		app.handleSession(rec, req)
		if rec.Code != http.StatusInternalServerError {
			t.Fatalf("status %d", rec.Code)
		}
		assertErrorBody(t, rec.Body.Bytes())
	})
}

func TestHandleConnectionsSanitizes(t *testing.T) {
	app := testApp(t, "http://unused")
	app.settings.Connections = []Connection{
		{Name: "Box RDP", Protocol: "rdp", Host: "rdp-host", Port: 3389, Username: "administrator", Domain: "CORP"},
	}
	app.settings.passwords["Box RDP"] = "super-secret-pw"

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/connections", nil)
	app.handleConnections(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	body := rec.Body.String()
	for _, leak := range []string{"super-secret-pw", "administrator", "username", "domain", "password"} {
		if strings.Contains(body, leak) {
			t.Errorf("response leaks %q: %s", leak, body)
		}
	}

	var resp struct {
		Connections []sanitizedConnection `json:"connections"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Connections) != 1 {
		t.Fatalf("connections: %d", len(resp.Connections))
	}
	c := resp.Connections[0]
	if c.Name != "Box RDP" || c.Protocol != "rdp" || c.Host != "rdp-host" || c.Port != 3389 {
		t.Errorf("unexpected sanitized connection: %+v", c)
	}
}

func assertErrorBody(t *testing.T, body []byte) {
	t.Helper()
	var e struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(body, &e); err != nil || e.Error == "" {
		t.Errorf("expected {\"error\":...} body, got %s", body)
	}
}

// profileApp builds an app whose settings exercise profiles, prompt mode, and
// allowedHosts, wired to the given Guacamole URL.
func profileApp(t *testing.T, guacURL string) *App {
	t.Helper()
	s := resolveTestSettings()
	s.GuacamoleURL = guacURL
	s.ClientURL = "/guacamole"
	s.jsonSecretKey = testKeyHex
	return &App{settings: s, http: &http.Client{}}
}

func TestHandleProfilesSanitizes(t *testing.T) {
	app := profileApp(t, "http://unused")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/profiles", nil)
	app.handleProfiles(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	body := rec.Body.String()
	// The allowlist globs and profile secrets must never reach the panel.
	for _, leak := range []string{"allowedHosts", "10.0.*", "test-target*", "profile-pw", "ssh-pw"} {
		if strings.Contains(body, leak) {
			t.Errorf("profiles response leaks %q: %s", leak, body)
		}
	}

	var resp struct {
		Profiles []sanitizedProfile `json:"profiles"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Profiles) != len(app.settings.Profiles) {
		t.Fatalf("profiles: got %d want %d", len(resp.Profiles), len(app.settings.Profiles))
	}
	var promptSeen bool
	for _, p := range resp.Profiles {
		if p.Name == "vnc-prompt" && p.PromptCredentials {
			promptSeen = true
		}
	}
	if !promptSeen {
		t.Error("promptCredentials flag not surfaced")
	}
}

func TestHandleSessionPrompt428(t *testing.T) {
	app := profileApp(t, "http://unused")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/session", strings.NewReader(`{"connection":"prompt-rdp"}`))
	app.handleSession(rec, req)

	if rec.Code != http.StatusPreconditionRequired {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Error            string `json:"error"`
		NeedsCredentials bool   `json:"needsCredentials"`
		UsernameRequired bool   `json:"usernameRequired"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if !resp.NeedsCredentials || !resp.UsernameRequired || resp.Error == "" {
		t.Errorf("unexpected 428 body: %+v", resp)
	}
}

func TestHandleSessionPromptSuccess(t *testing.T) {
	key, _ := hex.DecodeString(testKeyHex)
	var got authPayload
	guac := fakeGuacamole(t, key, &got, "prompt-rdp", "rdp-id-9")
	defer guac.Close()

	app := profileApp(t, guac.URL)

	const typed = "typed-secret-42"
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/session",
		strings.NewReader(`{"connection":"prompt-rdp","username":"operator","password":"`+typed+`","domain":"WORK"}`))
	app.handleSession(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body.String())
	}

	// The supplied credentials must reach the encrypted payload...
	conn, ok := got.Connections["prompt-rdp"]
	if !ok {
		t.Fatalf("connection missing from payload: %+v", got.Connections)
	}
	if conn.Parameters["password"] != typed || conn.Parameters["username"] != "operator" || conn.Parameters["domain"] != "WORK" {
		t.Errorf("prompt creds not in payload: %+v", conn.Parameters)
	}

	// ...but never be echoed back to the browser.
	if strings.Contains(rec.Body.String(), typed) || strings.Contains(rec.Body.String(), "operator") {
		t.Errorf("response leaked ephemeral credentials: %s", rec.Body.String())
	}
}

func TestHandleSessionForbiddenHost(t *testing.T) {
	app := profileApp(t, "http://unused")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/session", strings.NewReader(`{"host":"evil.example.com","profile":"fleet-vnc"}`))
	app.handleSession(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body.String())
	}
	assertErrorBody(t, rec.Body.Bytes())
}

func TestHandleSessionDynamicHost(t *testing.T) {
	key, _ := hex.DecodeString(testKeyHex)
	var got authPayload
	guac := fakeGuacamole(t, key, &got, "fleet-vnc@test-target-2", "dyn-id-7")
	defer guac.Close()

	app := profileApp(t, guac.URL)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/session", strings.NewReader(`{"host":"test-target-2","profile":"fleet-vnc"}`))
	app.handleSession(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body.String())
	}
	var resp sessionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Identifier != "dyn-id-7" || resp.ClientURL != "/guacamole" {
		t.Errorf("unexpected response: %+v", resp)
	}

	// The Guacamole connection map must be keyed by <profile>@<host>.
	conn, ok := got.Connections["fleet-vnc@test-target-2"]
	if !ok {
		t.Fatalf("dynamic connection key missing: %+v", got.Connections)
	}
	if conn.Protocol != "vnc" || conn.Parameters["hostname"] != "test-target-2" {
		t.Errorf("unexpected dynamic params: %+v", conn)
	}
}
