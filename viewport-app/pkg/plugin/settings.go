package plugin

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// Connection is one admin-defined target as stored in jsonData.
type Connection struct {
	Name       string  `json:"name"`
	Protocol   string  `json:"protocol"`
	Host       string  `json:"host"`
	Port       flexInt `json:"port"`
	Username   string  `json:"username"`
	Domain     string  `json:"domain"`
	Security   string  `json:"security"`
	IgnoreCert bool    `json:"ignoreCert"`
	ColorDepth int     `json:"colorDepth"`

	// CredentialMode selects where this connection's password comes from:
	// "stored" (default) the password.<name> secret, "prompt" the user per
	// session, or "profile" a shared credential profile.
	CredentialMode    string `json:"credentialMode"`
	CredentialProfile string `json:"credentialProfile"`
}

// Profile is a reusable credential + protocol defaults, decoupled from any host.
// It backs connections with credentialMode "profile" and the panel's dynamic
// host mode.
type Profile struct {
	Name              string   `json:"name"`
	Protocol          string   `json:"protocol"`
	Port              flexInt  `json:"port"`
	Username          string   `json:"username"`
	Domain            string   `json:"domain"`
	Security          string   `json:"security"`
	IgnoreCert        bool     `json:"ignoreCert"`
	ColorDepth        int      `json:"colorDepth"`
	AllowedHosts      []string `json:"allowedHosts"`
	PromptCredentials bool     `json:"promptCredentials"`
}

// Settings is the parsed app instance configuration: non-secret jsonData plus
// the decrypted secrets, indexed for lookup by connection name.
type Settings struct {
	GuacamoleURL string       `json:"guacamoleUrl"`
	ClientURL    string       `json:"clientUrl"`
	Connections  []Connection `json:"connections"`
	Profiles     []Profile    `json:"profiles"`

	jsonSecretKey    string            // raw 32-hex-char value from secureJsonData
	passwords        map[string]string // connection name -> password
	privateKeys      map[string]string // connection name -> SSH private key
	profilePasswords map[string]string // profile name -> password
	profileKeys      map[string]string // profile name -> SSH private key
}

// parseSettings decodes the app instance settings into a Settings value. It does
// not validate reachability; see CheckHealth for that.
func parseSettings(s backend.AppInstanceSettings) (*Settings, error) {
	settings := &Settings{
		passwords:        map[string]string{},
		privateKeys:      map[string]string{},
		profilePasswords: map[string]string{},
		profileKeys:      map[string]string{},
	}

	if len(s.JSONData) > 0 {
		if err := json.Unmarshal(s.JSONData, settings); err != nil {
			return nil, fmt.Errorf("invalid jsonData: %w", err)
		}
	}

	// Order matters: the profile-scoped prefixes are checked before the
	// connection-scoped ones so "profilePassword." is not mistaken for a
	// connection named "profilePassword...".
	for k, v := range s.DecryptedSecureJSONData {
		switch {
		case k == "jsonSecretKey":
			settings.jsonSecretKey = v
		case strings.HasPrefix(k, "profilePassword."):
			settings.profilePasswords[strings.TrimPrefix(k, "profilePassword.")] = v
		case strings.HasPrefix(k, "profileKey."):
			settings.profileKeys[strings.TrimPrefix(k, "profileKey.")] = v
		case strings.HasPrefix(k, "password."):
			settings.passwords[strings.TrimPrefix(k, "password.")] = v
		case strings.HasPrefix(k, "privateKey."):
			settings.privateKeys[strings.TrimPrefix(k, "privateKey.")] = v
		}
	}

	return settings, nil
}

// connection returns the named connection, or false if it is not defined.
func (s *Settings) connection(name string) (Connection, bool) {
	for _, c := range s.Connections {
		if c.Name == name {
			return c, true
		}
	}
	return Connection{}, false
}

// profile returns the named credential profile, or false if it is not defined.
func (s *Settings) profile(name string) (Profile, bool) {
	for _, p := range s.Profiles {
		if p.Name == name {
			return p, true
		}
	}
	return Profile{}, false
}

// keyBytes decodes and validates the jsonSecretKey (32 hex chars -> 16 bytes),
// the shared AES-128/HMAC key used by guacamole-auth-json.
func (s *Settings) keyBytes() ([]byte, error) {
	if s.jsonSecretKey == "" {
		return nil, fmt.Errorf("jsonSecretKey is not configured")
	}
	key, err := hex.DecodeString(s.jsonSecretKey)
	if err != nil {
		return nil, fmt.Errorf("jsonSecretKey is not valid hex")
	}
	if len(key) != 16 {
		return nil, fmt.Errorf("jsonSecretKey must be 32 hex characters (16 bytes), got %d bytes", len(key))
	}
	return key, nil
}

// flexInt is an int that unmarshals from either a JSON number or a JSON string,
// since Grafana config forms may store numeric fields as strings.
type flexInt int

func (n *flexInt) UnmarshalJSON(b []byte) error {
	b = []byte(strings.TrimSpace(string(b)))
	if len(b) == 0 || string(b) == "null" {
		*n = 0
		return nil
	}
	if b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		if s == "" {
			*n = 0
			return nil
		}
		v, err := strconv.Atoi(s)
		if err != nil {
			return err
		}
		*n = flexInt(v)
		return nil
	}
	var v int
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	*n = flexInt(v)
	return nil
}
