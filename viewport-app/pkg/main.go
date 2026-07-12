package main

import (
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/app"

	"github.com/viewport/viewport-app/plugin"
)

func main() {
	if err := app.Manage("viewport-app", plugin.NewApp, app.ManageOpts{}); err != nil {
		backend.Logger.Error(err.Error())
		os.Exit(1)
	}
}
