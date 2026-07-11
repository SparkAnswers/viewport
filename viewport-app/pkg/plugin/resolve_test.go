package plugin

import (
	"net/http"
	"testing"
)

// resolveTestSettings returns a Settings populated with the range of connection
// credential modes and profiles the resolver must handle.
func resolveTestSettings() *Settings {
	return &Settings{
		Connections: []Connection{
			{Name: "stored-vnc", Protocol: "vnc", Host: "vnc-host", Port: 5900, ColorDepth: 24},
			{Name: "prompt-rdp", Protocol: "rdp", Host: "rdp-host", Port: 3389, Username: "admin", CredentialMode: "prompt"},
			{Name: "shared-vnc", Protocol: "vnc", Host: "vnc-host-2", Port: 5900, CredentialMode: "profile", CredentialProfile: "vnc-cred"},
			{Name: "bad-profile-ref", Protocol: "vnc", Host: "h", Port: 5900, CredentialMode: "profile", CredentialProfile: "does-not-exist"},
			{Name: "prompt-profile-vnc", Protocol: "vnc", Host: "h2", Port: 5900, CredentialMode: "profile", CredentialProfile: "vnc-prompt"},
		},
		Profiles: []Profile{
			{Name: "vnc-cred", Protocol: "vnc", Port: 5900, Username: "profuser"},
			{Name: "vnc-prompt", Protocol: "vnc", Port: 5900, PromptCredentials: true},
			{Name: "fleet-vnc", Protocol: "vnc", Port: 5900, AllowedHosts: []string{"10.0.*.*", "test-target*"}},
			{Name: "fleet-rdp", Protocol: "rdp", Username: "svc", Domain: "CORP", Security: "nla", PromptCredentials: true},
			{Name: "any-ssh", Protocol: "ssh", Port: 2222, Username: "root"},
		},
		passwords:   map[string]string{"stored-vnc": "stored-pw"},
		privateKeys: map[string]string{},
		profilePasswords: map[string]string{
			"vnc-cred": "profile-pw",
			"any-ssh":  "ssh-pw",
		},
		profileKeys: map[string]string{},
	}
}

func TestResolveTarget(t *testing.T) {
	s := resolveTestSettings()

	t.Run("stored connection", func(t *testing.T) {
		tgt, rerr := s.resolveTarget(sessionRequest{Connection: "stored-vnc"})
		if rerr != nil {
			t.Fatalf("unexpected error: %v", rerr)
		}
		if tgt.key != "stored-vnc" || tgt.host != "vnc-host" || tgt.port != 5900 || tgt.password != "stored-pw" {
			t.Errorf("bad target: %+v", tgt)
		}
	})

	t.Run("unknown connection is 404", func(t *testing.T) {
		_, rerr := s.resolveTarget(sessionRequest{Connection: "nope"})
		if rerr == nil || rerr.status != http.StatusNotFound {
			t.Fatalf("want 404, got %v", rerr)
		}
	})

	t.Run("prompt connection without password is 428", func(t *testing.T) {
		_, rerr := s.resolveTarget(sessionRequest{Connection: "prompt-rdp"})
		if rerr == nil || rerr.status != http.StatusPreconditionRequired {
			t.Fatalf("want 428, got %v", rerr)
		}
		if !rerr.needsCredentials || !rerr.usernameRequired {
			t.Errorf("rdp prompt should need creds + username: %+v", rerr)
		}
	})

	t.Run("prompt connection with credentials resolves and overrides username", func(t *testing.T) {
		tgt, rerr := s.resolveTarget(sessionRequest{Connection: "prompt-rdp", Username: "override", Password: "typed", Domain: "WORK"})
		if rerr != nil {
			t.Fatalf("unexpected error: %v", rerr)
		}
		if tgt.password != "typed" || tgt.username != "override" || tgt.domain != "WORK" {
			t.Errorf("prompt creds not applied: %+v", tgt)
		}
	})

	t.Run("profile-backed connection uses profile secret and username default", func(t *testing.T) {
		tgt, rerr := s.resolveTarget(sessionRequest{Connection: "shared-vnc"})
		if rerr != nil {
			t.Fatalf("unexpected error: %v", rerr)
		}
		if tgt.password != "profile-pw" {
			t.Errorf("want profile password, got %q", tgt.password)
		}
		if tgt.username != "profuser" {
			t.Errorf("want profile username default, got %q", tgt.username)
		}
		if tgt.key != "shared-vnc" {
			t.Errorf("key should be connection name: %q", tgt.key)
		}
	})

	t.Run("connection referencing missing profile is 500", func(t *testing.T) {
		_, rerr := s.resolveTarget(sessionRequest{Connection: "bad-profile-ref"})
		if rerr == nil || rerr.status != http.StatusInternalServerError {
			t.Fatalf("want 500, got %v", rerr)
		}
	})

	t.Run("profile connection with promptCredentials needs prompt", func(t *testing.T) {
		_, rerr := s.resolveTarget(sessionRequest{Connection: "prompt-profile-vnc"})
		if rerr == nil || rerr.status != http.StatusPreconditionRequired {
			t.Fatalf("want 428, got %v", rerr)
		}
		if rerr.usernameRequired {
			t.Errorf("vnc should not require username")
		}
	})
}

func TestResolveDynamic(t *testing.T) {
	s := resolveTestSettings()

	t.Run("missing host or profile is 400", func(t *testing.T) {
		for _, req := range []sessionRequest{
			{Host: "server-1"},
			{Profile: "fleet-vnc"},
			{},
		} {
			_, rerr := s.resolveTarget(req)
			if rerr == nil || rerr.status != http.StatusBadRequest {
				t.Errorf("req %+v: want 400, got %v", req, rerr)
			}
		}
	})

	t.Run("unknown profile is 400", func(t *testing.T) {
		_, rerr := s.resolveTarget(sessionRequest{Host: "test-target-2", Profile: "ghost"})
		if rerr == nil || rerr.status != http.StatusBadRequest {
			t.Fatalf("want 400, got %v", rerr)
		}
	})

	t.Run("host outside allowlist is 403", func(t *testing.T) {
		_, rerr := s.resolveTarget(sessionRequest{Host: "evil.example.com", Profile: "fleet-vnc"})
		if rerr == nil || rerr.status != http.StatusForbidden {
			t.Fatalf("want 403, got %v", rerr)
		}
	})

	t.Run("allowed host resolves with profile secret and composite key", func(t *testing.T) {
		tgt, rerr := s.resolveTarget(sessionRequest{Host: "test-target-2", Profile: "fleet-vnc"})
		if rerr != nil {
			t.Fatalf("unexpected error: %v", rerr)
		}
		if tgt.key != "fleet-vnc@test-target-2" {
			t.Errorf("composite key: %q", tgt.key)
		}
		if tgt.host != "test-target-2" || tgt.port != 5900 {
			t.Errorf("host/port: %+v", tgt)
		}
	})

	t.Run("port default chain: request over profile over protocol", func(t *testing.T) {
		// request port wins
		tgt, _ := s.resolveTarget(sessionRequest{Host: "test-target-9", Profile: "fleet-vnc", Port: 5999})
		if tgt.port != 5999 {
			t.Errorf("request port should win: %d", tgt.port)
		}
		// profile port when request omits it
		tgt, _ = s.resolveTarget(sessionRequest{Host: "root@anything", Profile: "any-ssh"})
		if tgt.port != 2222 {
			t.Errorf("profile port should apply: %d", tgt.port)
		}
	})

	t.Run("empty allowlist permits any host", func(t *testing.T) {
		tgt, rerr := s.resolveTarget(sessionRequest{Host: "anything.internal", Profile: "any-ssh"})
		if rerr != nil {
			t.Fatalf("unexpected error: %v", rerr)
		}
		if tgt.password != "ssh-pw" {
			t.Errorf("want profile ssh password, got %q", tgt.password)
		}
	})

	t.Run("prompt profile without password is 428, with password overrides defaults", func(t *testing.T) {
		_, rerr := s.resolveTarget(sessionRequest{Host: "10.0.0.5", Profile: "fleet-rdp"})
		if rerr == nil || rerr.status != http.StatusPreconditionRequired || !rerr.usernameRequired {
			t.Fatalf("want 428 needing username, got %v", rerr)
		}

		tgt, rerr := s.resolveTarget(sessionRequest{Host: "10.0.0.5", Profile: "fleet-rdp", Username: "me", Password: "pw"})
		if rerr != nil {
			t.Fatalf("unexpected error: %v", rerr)
		}
		if tgt.username != "me" || tgt.password != "pw" {
			t.Errorf("request creds should override profile defaults: %+v", tgt)
		}
	})
}

func TestHostAllowed(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		allowed []string
		want    bool
	}{
		// Empty list allows any host.
		{"empty allows all", "anything.internal", nil, true},
		{"empty slice allows all", "anything", []string{}, true},

		// Single-label wildcards.
		{"suffix wildcard matches label", "test-target-2", []string{"test-target*"}, true},
		{"suffix wildcard matches bare label", "test-target", []string{"test-target*"}, true},
		{"non-matching prefix", "prod-db", []string{"10.0.*.*", "test-target*"}, false},
		{"one of several patterns matches", "prod-db", []string{"10.0.*.*", "prod-*"}, true},
		{"question mark matches single char", "db-1", []string{"db-?"}, true},
		{"question mark does not match two chars", "db-12", []string{"db-?"}, false},

		// Label-aware octet matching for IPs. A /16 must be written 10.0.*.*.
		{"octet wildcard matches one octet", "10.0.5", []string{"10.0.*"}, true},
		{"full ip needs a label per octet", "10.0.0.5", []string{"10.0.*.*"}, true},
		{"different second octet", "10.1.0.5", []string{"10.0.*.*"}, false},

		// --- Adversarial: wildcards must NOT cross '.' (the LOW finding). ---
		{"star does not cross dot into attacker domain", "test-target.attacker.com", []string{"test-target*"}, false},
		{"star does not cross dot with hyphen suffix", "test-target.evil.com", []string{"test-target-*"}, false},
		{"star does not cross dot after matching a suffix", "test-target-2.attacker.com", []string{"test-target*"}, false},
		{"octet star does not swallow extra labels", "10.0.0.evil.com", []string{"10.0.*"}, false},
		{"pattern shorter than host is rejected", "10.0.0.5", []string{"10.0.*"}, false},
		{"single label pattern rejects multi-label host", "internal.corp", []string{"internal"}, false},
		{"trailing dot changes label count", "test-target.", []string{"test-target*"}, false},
		{"question mark does not match a dot", "db-.x", []string{"db-?"}, false},

		// Glob metacharacters other than * and ? are literal, and any
		// un-matchable/odd pattern fails closed; a valid sibling still matches.
		{"bare bracket is literal, matches no real host", "anything", []string{"["}, false},
		{"bracket pattern does not block a valid one", "test-target", []string{"[", "test-target*"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := hostAllowed(tt.host, tt.allowed); got != tt.want {
				t.Errorf("hostAllowed(%q, %v) = %v, want %v", tt.host, tt.allowed, got, tt.want)
			}
		})
	}
}

func TestDefaultPort(t *testing.T) {
	for proto, want := range map[string]int{"vnc": 5900, "rdp": 3389, "ssh": 22, "unknown": 5900} {
		if got := defaultPort(proto); got != want {
			t.Errorf("defaultPort(%q) = %d, want %d", proto, got, want)
		}
	}
}
