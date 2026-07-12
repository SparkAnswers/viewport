package plugin

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

// resolvedTarget is a fully resolved connection target: everything needed to
// build a Guacamole parameter map, with credentials already selected from the
// correct source (stored secret, profile secret, or per-session prompt).
type resolvedTarget struct {
	key        string // Guacamole connection map key / identifier
	protocol   string
	host       string
	port       int
	username   string
	domain     string
	security   string
	ignoreCert bool
	colorDepth int
	password   string
	privateKey string
}

// resolveError carries an HTTP status alongside the message, plus the extra
// fields the panel needs to drive its credential dialog on a 428.
type resolveError struct {
	status           int
	message          string
	needsCredentials bool
	usernameRequired bool
}

func (e *resolveError) Error() string { return e.message }

// defaultPort returns the well-known port for a protocol when none is configured.
func defaultPort(protocol string) int {
	switch protocol {
	case "rdp":
		return 3389
	case "ssh":
		return 22
	default: // vnc
		return 5900
	}
}

// resolveTarget dispatches on the request shape: a named connection, or dynamic
// host mode (host + profile). See ARCHITECTURE.md "POST /session".
func (s *Settings) resolveTarget(req sessionRequest) (*resolvedTarget, *resolveError) {
	connection := strings.TrimSpace(req.Connection)
	host := strings.TrimSpace(req.Host)
	profile := strings.TrimSpace(req.Profile)

	switch {
	case connection != "":
		req.Connection = connection
		return s.resolveConnection(req)
	case host != "" && profile != "":
		req.Host, req.Profile = host, profile
		return s.resolveDynamic(req)
	default:
		return nil, &resolveError{
			status:  http.StatusBadRequest,
			message: `request must specify either "connection", or both "host" and "profile"`,
		}
	}
}

// resolveConnection resolves a named connection, choosing the credential source
// from its credentialMode.
func (s *Settings) resolveConnection(req sessionRequest) (*resolvedTarget, *resolveError) {
	conn, ok := s.connection(req.Connection)
	if !ok {
		return nil, &resolveError{status: http.StatusNotFound, message: fmt.Sprintf("unknown connection %q", req.Connection)}
	}

	t := &resolvedTarget{
		key:        conn.Name,
		protocol:   conn.Protocol,
		host:       conn.Host,
		port:       int(conn.Port),
		username:   conn.Username,
		domain:     conn.Domain,
		security:   conn.Security,
		ignoreCert: conn.IgnoreCert,
		colorDepth: conn.ColorDepth,
	}
	if t.port == 0 {
		t.port = defaultPort(t.protocol)
	}

	mode := conn.CredentialMode
	if mode == "" {
		mode = "stored"
	}
	switch mode {
	case "stored":
		t.password = s.passwords[conn.Name]
		t.privateKey = s.privateKeys[conn.Name]
	case "prompt":
		if rerr := applyPrompt(t, req); rerr != nil {
			return nil, rerr
		}
	case "profile":
		prof, ok := s.profile(conn.CredentialProfile)
		if !ok {
			return nil, &resolveError{
				status:  http.StatusInternalServerError,
				message: fmt.Sprintf("connection %q references unknown profile %q", conn.Name, conn.CredentialProfile),
			}
		}
		// The profile supplies the shared credential and fills in username/domain
		// defaults the connection leaves blank; the connection keeps its target.
		if t.username == "" {
			t.username = prof.Username
		}
		if t.domain == "" {
			t.domain = prof.Domain
		}
		if prof.PromptCredentials {
			if rerr := applyPrompt(t, req); rerr != nil {
				return nil, rerr
			}
		} else {
			t.password = s.profilePasswords[prof.Name]
			t.privateKey = s.profileKeys[prof.Name]
		}
	default:
		return nil, &resolveError{
			status:  http.StatusInternalServerError,
			message: fmt.Sprintf("connection %q has invalid credentialMode %q", conn.Name, mode),
		}
	}
	return t, nil
}

// resolveDynamic resolves dynamic host mode: a profile supplies protocol,
// defaults, and credentials while the request supplies the hostname. The
// profile's allowedHosts globs are enforced.
func (s *Settings) resolveDynamic(req sessionRequest) (*resolvedTarget, *resolveError) {
	prof, ok := s.profile(req.Profile)
	if !ok {
		return nil, &resolveError{status: http.StatusBadRequest, message: fmt.Sprintf("unknown profile %q", req.Profile)}
	}
	if !hostAllowed(req.Host, prof.AllowedHosts) {
		return nil, &resolveError{
			status:  http.StatusForbidden,
			message: fmt.Sprintf("host %q is not permitted by profile %q", req.Host, prof.Name),
		}
	}

	t := &resolvedTarget{
		key:        prof.Name + "@" + req.Host,
		protocol:   prof.Protocol,
		host:       req.Host,
		port:       int(req.Port),
		username:   prof.Username,
		domain:     prof.Domain,
		security:   prof.Security,
		ignoreCert: prof.IgnoreCert,
		colorDepth: prof.ColorDepth,
	}
	if t.port == 0 {
		t.port = int(prof.Port)
	}
	if t.port == 0 {
		t.port = defaultPort(t.protocol)
	}

	if prof.PromptCredentials {
		if rerr := applyPrompt(t, req); rerr != nil {
			return nil, rerr
		}
	} else {
		t.password = s.profilePasswords[prof.Name]
		t.privateKey = s.profileKeys[prof.Name]
	}
	return t, nil
}

// applyPrompt applies per-session credentials from the request. Request-supplied
// username/domain override any defaults. If no password is present it returns a
// 428 so the panel can prompt and retry.
func applyPrompt(t *resolvedTarget, req sessionRequest) *resolveError {
	if req.Username != "" {
		t.username = req.Username
	}
	if req.Domain != "" {
		t.domain = req.Domain
	}
	if req.Password == "" {
		return &resolveError{
			status:           http.StatusPreconditionRequired, // 428
			message:          "credentials are required for this session",
			needsCredentials: true,
			usernameRequired: t.protocol != "vnc",
		}
	}
	t.password = req.Password
	return nil
}

// hostAllowed reports whether host matches the glob allowlist. An empty list
// means any host is allowed.
func hostAllowed(host string, allowed []string) bool {
	if len(allowed) == 0 {
		return true
	}
	for _, pattern := range allowed {
		if matchHostPattern(pattern, host) {
			return true
		}
	}
	return false
}

// matchHostPattern matches a host against a single glob pattern with
// label-aware wildcards: '*' and '?' match within one hostname label and never
// cross a '.' or '/' separator. This is the security boundary for dynamic host
// mode — with a naive path.Match, "db-*" would also match "db-01.attacker.com",
// letting a viewer who overrides the ${server} dashboard variable aim a shared
// profile credential at an arbitrary host that merely shares a prefix.
//
// The glob is translated to an anchored regexp where '*' -> "[^./]*" and
// '?' -> "[^./]" (so neither crosses a label separator), and every other
// character is escaped to a literal — including '.', which must then line up on
// both sides, and which keeps ordinary glob metacharacters (e.g. '[') from
// having any special meaning. An un-compilable pattern fails closed (no match).
// A /16 must therefore be written "10.0.*.*".
func matchHostPattern(pattern, host string) bool {
	var b strings.Builder
	b.WriteByte('^')
	for _, r := range pattern {
		switch r {
		case '*':
			b.WriteString("[^./]*")
		case '?':
			b.WriteString("[^./]")
		default:
			b.WriteString(regexp.QuoteMeta(string(r)))
		}
	}
	b.WriteByte('$')

	re, err := regexp.Compile(b.String())
	if err != nil {
		return false // fail closed
	}
	return re.MatchString(host)
}
