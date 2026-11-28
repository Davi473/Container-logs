package config

import (
	"os"
)

type Config struct {
	Port       string
	DockerHost string
	StaticDir  string
}

func Load() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dockerHost := os.Getenv("DOCKER_HOST")
	if dockerHost == "" {
		dockerHost = "unix:///var/run/docker.sock"
	}
	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "./static"
	}
	return Config{
		Port:       port,
		DockerHost: dockerHost,
		StaticDir:  staticDir,
	}
}
