package plugin

import (
	"encoding/hex"
	"testing"
)

// TestSignEncryptKnownVector proves our sign+encrypt matches the
// guacamole-auth-json reference encoding. The expected value was produced with
// the OpenSSL CLI:
//
//	KEY=4c0b569e4c96df157eee1b65dd0e4d41
//	SIG=$(printf '%s' "$JSON" | openssl dgst -sha256 -mac HMAC -macopt hexkey:$KEY -binary)
//	{ printf '%s' "$SIG"; printf '%s' "$JSON"; } | \
//	    openssl enc -aes-128-cbc -K $KEY -iv 00000000000000000000000000000000 -nosalt | base64 -w0
func TestSignEncryptKnownVector(t *testing.T) {
	key, err := hex.DecodeString("4c0b569e4c96df157eee1b65dd0e4d41")
	if err != nil {
		t.Fatal(err)
	}
	json := `{"username":"viewport-alice","expires":1700000000000,"connections":{"Test VNC":{"protocol":"vnc","parameters":{"hostname":"test-target","port":"5900","color-depth":"24"}}}}`
	const want = "+rSLRrsVRPYvSBUmTj+OEglZSoajMrKDu/qkG+Bm7AJZi7HJJ4c4F3u8LRr3QvO9lffIw1T4sbGlwKDTHcafuxdcR+/WTftQp+MIhH9C8upnT9efKqIGYDlcX+1bUe3e/mMF4M8AlhonAIG0szTDfdZm15C3aW60Fx4BVuNr9jf77G7jCZybO3FU2uLwPAhy4BVjvd8TbVivE89Ki7womA+wmFxxEul+PHp6IyM2oD5VdYm96mlYZCm6vpX806rEtfBxuNND6ev7PxWn+TPhYw=="

	got, err := signEncrypt(key, []byte(json))
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Errorf("signEncrypt mismatch\n got: %s\nwant: %s", got, want)
	}
}

func TestBuildParameters(t *testing.T) {
	tests := []struct {
		name   string
		target resolvedTarget
		want   map[string]string
	}{
		{
			name:   "vnc defaults color-depth",
			target: resolvedTarget{protocol: "vnc", host: "vnc-host", port: 5900},
			want:   map[string]string{"hostname": "vnc-host", "port": "5900", "color-depth": "24"},
		},
		{
			name:   "vnc with password and color depth",
			target: resolvedTarget{protocol: "vnc", host: "h", port: 1, colorDepth: 16, password: "sekret"},
			want:   map[string]string{"hostname": "h", "port": "1", "password": "sekret", "color-depth": "16"},
		},
		{
			name:   "rdp full",
			target: resolvedTarget{protocol: "rdp", host: "rdp-host", port: 3389, username: "admin", domain: "CORP", security: "nla", ignoreCert: true, password: "pw"},
			want: map[string]string{
				"hostname": "rdp-host", "port": "3389", "username": "admin", "password": "pw",
				"domain": "CORP", "security": "nla", "ignore-cert": "true", "disable-auth": "false",
			},
		},
		{
			name:   "rdp defaults security and omits empty domain",
			target: resolvedTarget{protocol: "rdp", host: "h", port: 3389, username: "u"},
			want: map[string]string{
				"hostname": "h", "port": "3389", "username": "u",
				"security": "any", "ignore-cert": "false", "disable-auth": "false",
			},
		},
		{
			name:   "ssh with private key",
			target: resolvedTarget{protocol: "ssh", host: "ssh-host", port: 22, username: "root", privateKey: "-----BEGIN KEY-----"},
			want:   map[string]string{"hostname": "ssh-host", "port": "22", "username": "root", "private-key": "-----BEGIN KEY-----"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildParameters(tt.target)
			if len(got) != len(tt.want) {
				t.Fatalf("param count: got %v want %v", got, tt.want)
			}
			for k, v := range tt.want {
				if got[k] != v {
					t.Errorf("param %q: got %q want %q", k, got[k], v)
				}
			}
		})
	}
}

func TestGuacUsername(t *testing.T) {
	if got := guacUsername("alice"); got != "viewport-alice" {
		t.Errorf("got %q", got)
	}
	if got := guacUsername(""); got != "viewport" {
		t.Errorf("empty login: got %q", got)
	}
}
