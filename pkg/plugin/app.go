package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
)

// App is a configured instance of the Viewport app plugin.
type App struct {
	backend.CallResourceHandler
	settings *Settings
	http     *http.Client
}

// NewApp is the instance factory registered with the SDK app manager. Grafana
// calls it once per configuration and again whenever settings change.
func NewApp(_ context.Context, s backend.AppInstanceSettings) (instancemgmt.Instance, error) {
	settings, err := parseSettings(s)
	if err != nil {
		return nil, err
	}

	app := &App{
		settings: settings,
		http:     &http.Client{Timeout: guacTimeout},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/connections", app.handleConnections)
	mux.HandleFunc("/profiles", app.handleProfiles)
	mux.HandleFunc("/session", app.handleSession)
	app.CallResourceHandler = httpadapter.New(mux)

	return app, nil
}

// Dispose is called when the instance is replaced or removed.
func (a *App) Dispose() {}

// sessionResponse is the browser-facing result of POST /session. It contains no
// credentials.
type sessionResponse struct {
	Token      string `json:"token"`
	DataSource string `json:"dataSource"`
	Identifier string `json:"identifier"`
	ClientURL  string `json:"clientUrl"`
}

// sanitizedConnection is the subset of a connection safe to expose to panels.
type sanitizedConnection struct {
	Name     string `json:"name"`
	Protocol string `json:"protocol"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
}

// sanitizedProfile is the subset of a credential profile safe to expose to
// panels. It carries no secrets and not the allowedHosts allowlist.
type sanitizedProfile struct {
	Name              string `json:"name"`
	Protocol          string `json:"protocol"`
	Port              int    `json:"port"`
	Username          string `json:"username"`
	PromptCredentials bool   `json:"promptCredentials"`
}

// handleConnections returns the connection list for panel dropdowns, stripped of
// usernames and all secrets.
func (a *App) handleConnections(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	out := make([]sanitizedConnection, 0, len(a.settings.Connections))
	for _, c := range a.settings.Connections {
		out = append(out, sanitizedConnection{
			Name:     c.Name,
			Protocol: c.Protocol,
			Host:     c.Host,
			Port:     int(c.Port),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"connections": out})
}

// handleProfiles returns the credential-profile list for panel dropdowns,
// stripped of secrets and the allowedHosts allowlist.
func (a *App) handleProfiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	out := make([]sanitizedProfile, 0, len(a.settings.Profiles))
	for _, p := range a.settings.Profiles {
		out = append(out, sanitizedProfile{
			Name:              p.Name,
			Protocol:          p.Protocol,
			Port:              int(p.Port),
			Username:          p.Username,
			PromptCredentials: p.PromptCredentials,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"profiles": out})
}

// sessionRequest is the POST /session body: a named connection or dynamic host
// mode, plus optional ephemeral credentials used only for this mint.
type sessionRequest struct {
	Connection string  `json:"connection"`
	Host       string  `json:"host"`
	Port       flexInt `json:"port"`
	Profile    string  `json:"profile"`
	Username   string  `json:"username"`
	Password   string  `json:"password"`
	Domain     string  `json:"domain"`
}

// handleSession mints a short-lived, single-connection Guacamole token for the
// requested connection.
func (a *App) handleSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req sessionRequest
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<16))
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "request body must be valid JSON")
		return
	}

	if a.settings.GuacamoleURL == "" {
		writeError(w, http.StatusInternalServerError, "guacamoleUrl is not configured")
		return
	}
	key, err := a.settings.keyBytes()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	target, rerr := a.settings.resolveTarget(req)
	if rerr != nil {
		if rerr.needsCredentials {
			writeJSON(w, rerr.status, map[string]any{
				"error":            rerr.message,
				"needsCredentials": true,
				"usernameRequired": rerr.usernameRequired,
			})
			return
		}
		writeError(w, rerr.status, rerr.message)
		return
	}

	login := ""
	if u := backend.UserFromContext(r.Context()); u != nil {
		login = u.Login
	}

	guac := newGuacClient(a.settings.GuacamoleURL, a.http)
	session, err := guac.mintSession(r.Context(), key, login, *target)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	session.ClientURL = a.settings.ClientURL

	writeJSON(w, http.StatusOK, session)
}

// CheckHealth verifies the settings are complete and Guacamole is reachable.
func (a *App) CheckHealth(ctx context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	if a.settings.GuacamoleURL == "" {
		return healthError("guacamoleUrl is not configured"), nil
	}
	if _, err := a.settings.keyBytes(); err != nil {
		return healthError(err.Error()), nil
	}

	u := strings.TrimRight(a.settings.GuacamoleURL, "/") + "/api/languages"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return healthError(err.Error()), nil
	}
	resp, err := a.http.Do(req)
	if err != nil {
		return healthError(fmt.Sprintf("Guacamole unreachable: %v", err)), nil
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return healthError(fmt.Sprintf("Guacamole returned status %d", resp.StatusCode)), nil
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Guacamole reachable",
	}, nil
}

func healthError(msg string) *backend.CheckHealthResult {
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusError,
		Message: msg,
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
