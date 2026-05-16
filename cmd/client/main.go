package main

import (
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
)

type pageData struct {
	AppConfig template.JS
}

type appConfig struct {
	AnalyticsHTTPURL string `json:"analyticsHttpUrl"`
	AnalyticsWSURL   string `json:"analyticsWsUrl"`
}

func main() {
	addr := envOrDefault("CLIENT_ADDR", ":8080")
	analyticsHTTPURL := strings.TrimRight(envOrDefault("ANALYTICS_HTTP_URL", "http://localhost:8082"), "/")
	analyticsWSURL := strings.TrimSpace(os.Getenv("ANALYTICS_WS_URL"))
	if analyticsWSURL == "" {
		analyticsWSURL = deriveWSURL(analyticsHTTPURL)
	}

	analyticsBaseURL, err := url.Parse(analyticsHTTPURL)
	if err != nil {
		log.Fatalf("parse analytics http url: %v", err)
	}

	analyticsProxy := httputil.NewSingleHostReverseProxy(analyticsBaseURL)

	cfg := appConfig{
		AnalyticsHTTPURL: "/v1/events",
		AnalyticsWSURL:   deriveClientWSURL(),
	}

	appConfigJSON, err := json.Marshal(cfg)
	if err != nil {
		log.Fatalf("marshal app config: %v", err)
	}

	tmpl := template.Must(template.ParseFiles("web/index.html"))
	staticFS := http.FileServer(http.Dir("web"))

	mux := http.NewServeMux()
	mux.Handle("/styles.css", staticFS)
	mux.Handle("/app.js", staticFS)
	mux.Handle("/v1/events", analyticsProxy)
	mux.Handle("/v1/ws", analyticsProxy)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}

		if err := tmpl.Execute(w, pageData{
			AppConfig: template.JS(appConfigJSON),
		}); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})
	mux.HandleFunc("/config.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(cfg)
	})

	log.Printf("client is listening on %s", addr)
	log.Printf("analytics http base: %s", analyticsHTTPURL)
	log.Printf("analytics websocket url: %s", analyticsWSURL)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}

	return fallback
}

func deriveWSURL(httpURL string) string {
	switch {
	case strings.HasPrefix(httpURL, "https://"):
		return "wss://" + strings.TrimPrefix(httpURL, "https://") + "/v1/ws"
	case strings.HasPrefix(httpURL, "http://"):
		return "ws://" + strings.TrimPrefix(httpURL, "http://") + "/v1/ws"
	default:
		return httpURL + "/v1/ws"
	}
}

func deriveClientWSURL() string {
	return "__CLIENT_WS_ORIGIN__/v1/ws"
}
