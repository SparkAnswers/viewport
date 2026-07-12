package plugin

import (
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestParseSettings(t *testing.T) {
	s := backend.AppInstanceSettings{
		JSONData: []byte(`{
			"guacamoleUrl": "http://guac:8080/guacamole",
			"clientUrl": "/guacamole",
			"connections": [
				{"name":"Test VNC","protocol":"vnc","host":"vnc-host","port":5900,"colorDepth":24},
				{"name":"Box RDP","protocol":"rdp","host":"rdp-host","port":"3389","username":"admin","domain":"CORP","security":"nla","ignoreCert":true,"credentialMode":"profile","credentialProfile":"shared"}
			],
			"profiles": [
				{"name":"shared","protocol":"rdp","port":3389,"username":"svc","allowedHosts":["10.0.*"],"promptCredentials":false}
			]
		}`),
		DecryptedSecureJSONData: map[string]string{
			"jsonSecretKey":          "4c0b569e4c96df157eee1b65dd0e4d41",
			"password.Test VNC":      "vncpw",
			"password.Box RDP":       "rdppw",
			"privateKey.Test VNC":    "ignored-for-vnc",
			"profilePassword.shared": "profpw",
			"profileKey.shared":      "profkey",
		},
	}

	settings, err := parseSettings(s)
	if err != nil {
		t.Fatal(err)
	}

	if settings.GuacamoleURL != "http://guac:8080/guacamole" {
		t.Errorf("guacamoleUrl: %q", settings.GuacamoleURL)
	}
	if settings.ClientURL != "/guacamole" {
		t.Errorf("clientUrl: %q", settings.ClientURL)
	}
	if len(settings.Connections) != 2 {
		t.Fatalf("connections: got %d", len(settings.Connections))
	}

	// port parses from both number and string forms.
	if settings.Connections[0].Port != 5900 {
		t.Errorf("vnc port: %d", settings.Connections[0].Port)
	}
	if settings.Connections[1].Port != 3389 {
		t.Errorf("rdp port (from string): %d", settings.Connections[1].Port)
	}

	if settings.passwords["Test VNC"] != "vncpw" || settings.passwords["Box RDP"] != "rdppw" {
		t.Errorf("passwords not indexed by name: %v", settings.passwords)
	}
	if settings.privateKeys["Test VNC"] != "ignored-for-vnc" {
		t.Errorf("privateKeys not indexed by name: %v", settings.privateKeys)
	}

	if _, ok := settings.connection("Box RDP"); !ok {
		t.Error("connection lookup failed for Box RDP")
	}
	if _, ok := settings.connection("nope"); ok {
		t.Error("connection lookup should fail for unknown name")
	}

	// credentialMode fields parse.
	if settings.Connections[1].CredentialMode != "profile" || settings.Connections[1].CredentialProfile != "shared" {
		t.Errorf("credentialMode/profile not parsed: %+v", settings.Connections[1])
	}

	// Profiles parse and their secrets are indexed separately from connection
	// secrets (profilePassword. must not be mistaken for password.).
	prof, ok := settings.profile("shared")
	if !ok {
		t.Fatal("profile lookup failed for shared")
	}
	if prof.Protocol != "rdp" || prof.Port != 3389 || prof.Username != "svc" || len(prof.AllowedHosts) != 1 || prof.AllowedHosts[0] != "10.0.*" {
		t.Errorf("profile fields not parsed: %+v", prof)
	}
	if settings.profilePasswords["shared"] != "profpw" || settings.profileKeys["shared"] != "profkey" {
		t.Errorf("profile secrets not indexed: pw=%q key=%q", settings.profilePasswords["shared"], settings.profileKeys["shared"])
	}
	if _, leaked := settings.passwords["shared"]; leaked {
		t.Error("profilePassword.shared leaked into connection passwords map")
	}
}

func TestKeyBytes(t *testing.T) {
	tests := []struct {
		name    string
		key     string
		wantErr bool
	}{
		{"valid", "4c0b569e4c96df157eee1b65dd0e4d41", false},
		{"empty", "", true},
		{"non-hex", "zzzz569e4c96df157eee1b65dd0e4d41", true},
		{"wrong length", "4c0b569e", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Settings{jsonSecretKey: tt.key}
			key, err := s.keyBytes()
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if len(key) != 16 {
				t.Errorf("key length: %d", len(key))
			}
		})
	}
}
