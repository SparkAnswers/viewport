package plugin

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// guacTimeout bounds every outbound call to the Guacamole server.
const guacTimeout = 15 * time.Second

// authPayload is the cleartext guacamole-auth-json document.
type authPayload struct {
	Username    string                    `json:"username"`
	Expires     int64                     `json:"expires"`
	Connections map[string]authConnection `json:"connections"`
}

type authConnection struct {
	Protocol   string            `json:"protocol"`
	Parameters map[string]string `json:"parameters"`
}

// signEncrypt implements the guacamole-auth-json encoding: the payload is signed
// with HMAC-SHA256, the signature is prepended to the JSON, the result is
// encrypted with AES-128-CBC (all-zero IV, PKCS#7 padding) and base64-encoded.
// key must be 16 bytes.
func signEncrypt(key, jsonBytes []byte) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	mac := hmac.New(sha256.New, key)
	mac.Write(jsonBytes)
	signed := append(mac.Sum(nil), jsonBytes...)

	padded := pkcs7Pad(signed, block.BlockSize())
	iv := make([]byte, block.BlockSize()) // all-zero IV, per the reference
	ciphertext := make([]byte, len(padded))
	cipher.NewCBCEncrypter(block, iv).CryptBlocks(ciphertext, padded)

	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func pkcs7Pad(data []byte, blockSize int) []byte {
	pad := blockSize - len(data)%blockSize
	return append(data, bytes.Repeat([]byte{byte(pad)}, pad)...)
}

// buildParameters maps a resolved target plus its secrets to Guacamole protocol
// parameters. Secrets are only ever included here, server-side.
func buildParameters(t resolvedTarget) map[string]string {
	params := map[string]string{
		"hostname": t.host,
		"port":     strconv.Itoa(t.port),
	}
	switch t.protocol {
	case "vnc":
		if t.password != "" {
			params["password"] = t.password
		}
		depth := t.colorDepth
		if depth == 0 {
			depth = 24
		}
		params["color-depth"] = strconv.Itoa(depth)
	case "rdp":
		params["username"] = t.username
		if t.password != "" {
			params["password"] = t.password
		}
		if t.domain != "" {
			params["domain"] = t.domain
		}
		security := t.security
		if security == "" {
			security = "any"
		}
		params["security"] = security
		params["ignore-cert"] = strconv.FormatBool(t.ignoreCert)
		params["disable-auth"] = "false"
	case "ssh":
		params["username"] = t.username
		if t.password != "" {
			params["password"] = t.password
		}
		if t.privateKey != "" {
			params["private-key"] = t.privateKey
		}
	}
	return params
}

// guacClient talks to a Guacamole server. It is constructed per request so the
// base URL and HTTP client can be injected (including in tests).
type guacClient struct {
	baseURL string
	http    *http.Client
}

func newGuacClient(baseURL string, client *http.Client) *guacClient {
	return &guacClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    client,
	}
}

type tokenResponse struct {
	AuthToken  string `json:"authToken"`
	DataSource string `json:"dataSource"`
}

// createToken posts the encrypted blob to /api/tokens and returns the scoped
// auth token and its data source.
func (g *guacClient) createToken(ctx context.Context, blob string) (tokenResponse, error) {
	form := url.Values{"data": {blob}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.baseURL+"/api/tokens", strings.NewReader(form.Encode()))
	if err != nil {
		return tokenResponse{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := g.http.Do(req)
	if err != nil {
		return tokenResponse{}, fmt.Errorf("guacamole unreachable: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return tokenResponse{}, fmt.Errorf("guacamole token request failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var tr tokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return tokenResponse{}, fmt.Errorf("could not parse guacamole token response: %w", err)
	}
	if tr.AuthToken == "" {
		return tokenResponse{}, fmt.Errorf("guacamole returned an empty auth token")
	}
	if tr.DataSource == "" {
		tr.DataSource = "json"
	}
	return tr, nil
}

// resolveIdentifier looks up the Guacamole connection identifier by display
// name. Guacamole keys the connection map by identifier, so we scan for a
// matching name. Returns the name as a fallback identifier on any failure.
func (g *guacClient) resolveIdentifier(ctx context.Context, dataSource, token, name string) string {
	u := fmt.Sprintf("%s/api/session/data/%s/connections?token=%s",
		g.baseURL, url.PathEscape(dataSource), url.QueryEscape(token))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return name
	}
	resp, err := g.http.Do(req)
	if err != nil {
		return name
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return name
	}

	var connections map[string]struct {
		Name       string `json:"name"`
		Identifier string `json:"identifier"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&connections); err != nil {
		return name
	}
	for id, c := range connections {
		if c.Name == name {
			if c.Identifier != "" {
				return c.Identifier
			}
			return id
		}
	}
	return name
}

// mintSession runs the full guacamole-auth-json exchange for one resolved target
// and returns the browser-facing session details.
func (g *guacClient) mintSession(ctx context.Context, key []byte, login string, t resolvedTarget) (sessionResponse, error) {
	payload := authPayload{
		Username: guacUsername(login),
		Expires:  time.Now().Add(5 * time.Minute).UnixMilli(),
		Connections: map[string]authConnection{
			t.key: {
				Protocol:   t.protocol,
				Parameters: buildParameters(t),
			},
		},
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return sessionResponse{}, err
	}
	blob, err := signEncrypt(key, jsonBytes)
	if err != nil {
		return sessionResponse{}, err
	}

	tr, err := g.createToken(ctx, blob)
	if err != nil {
		return sessionResponse{}, err
	}

	return sessionResponse{
		Token:      tr.AuthToken,
		DataSource: tr.DataSource,
		Identifier: g.resolveIdentifier(ctx, tr.DataSource, tr.AuthToken, t.key),
	}, nil
}

// guacUsername derives the ephemeral Guacamole username from the Grafana login.
func guacUsername(login string) string {
	if login == "" {
		return "viewport"
	}
	return "viewport-" + login
}
