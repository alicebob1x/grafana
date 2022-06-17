package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"path"
	"strings"

	"github.com/grafana/grafana/pkg/plugins/logger"
	"github.com/grafana/grafana/pkg/plugins/repository"
)

const (
	grafanaComAPIRoot = "https://grafana.com/api/plugins"
)

type Service struct {
	client *Client

	repoURL string
	log     logger.Logger
}

func New(skipTLSVerify bool, repoURL string, logger logger.Logger) *Service {
	return &Service{
		client:  newClient(skipTLSVerify, logger),
		repoURL: repoURL,
		log:     logger,
	}
}

func ProvideService() *Service {
	return New(false, grafanaComAPIRoot, logger.NewLogger("plugin.repository"))
}

// GetPluginArchive fetches the requested plugin archive
func (s *Service) GetPluginArchive(ctx context.Context, pluginID, version string, compatOpts repository.CompatabilityOpts) (*repository.PluginArchive, error) {
	dlOpts, err := s.GetPluginDownloadOptions(ctx, pluginID, version, compatOpts)
	if err != nil {
		return nil, err
	}

	return s.client.download(ctx, dlOpts.PluginZipURL, dlOpts.Checksum, compatOpts)
}

// GetPluginArchiveByURL fetches the requested plugin archive from the provided `pluginZipURL`
func (s *Service) GetPluginArchiveByURL(ctx context.Context, pluginZipURL string, compatOpts repository.CompatabilityOpts) (*repository.PluginArchive, error) {
	return s.client.download(ctx, pluginZipURL, "", compatOpts)
}

// GetPluginDownloadOptions returns the options for downloading the requested plugin (with optional `version`)
func (s *Service) GetPluginDownloadOptions(_ context.Context, pluginID, version string, compatOpts repository.CompatabilityOpts) (*repository.PluginDownloadOptions, error) {
	plugin, err := s.pluginMetadata(pluginID, compatOpts)
	if err != nil {
		return nil, err
	}

	v, err := s.selectVersion(&plugin, version, compatOpts)
	if err != nil {
		return nil, err
	}

	// Plugins which are downloaded just as sourcecode zipball from GitHub do not have checksum
	var checksum string
	if v.Arch != nil {
		archMeta, exists := v.Arch[compatOpts.OSAndArch()]
		if !exists {
			archMeta = v.Arch["any"]
		}
		checksum = archMeta.SHA256
	}

	return &repository.PluginDownloadOptions{
		Version:      v.Version,
		Checksum:     checksum,
		PluginZipURL: fmt.Sprintf("%s/%s/versions/%s/download", grafanaComAPIRoot, pluginID, v.Version),
	}, nil
}

func (s *Service) pluginMetadata(pluginID string, compatOpts repository.CompatabilityOpts) (repository.Plugin, error) {
	s.log.Debugf("Fetching metadata for plugin \"%s\" from repo %s", pluginID, s.repoURL)

	u, err := url.Parse(s.repoURL)
	if err != nil {
		return repository.Plugin{}, err
	}
	u.Path = path.Join(u.Path, "repo", pluginID)

	body, err := s.client.sendReq(u, compatOpts)
	if err != nil {
		return repository.Plugin{}, err
	}

	var data repository.Plugin
	err = json.Unmarshal(body, &data)
	if err != nil {
		s.log.Error("Failed to unmarshal plugin repo response error", err)
		return repository.Plugin{}, err
	}

	return data, nil
}

// selectVersion selects the most appropriate plugin version
// returns the specified version if supported.
// returns the latest version if no specific version is specified.
// returns error if the supplied version does not exist.
// returns error if supplied version exists but is not supported.
// NOTE: It expects plugin.Versions to be sorted so the newest version is first.
func (s *Service) selectVersion(plugin *repository.Plugin, version string, compatOpts repository.CompatabilityOpts) (*repository.Version, error) {
	version = normalizeVersion(version)

	var ver repository.Version
	latestForArch := latestSupportedVersion(plugin, compatOpts)
	if latestForArch == nil {
		return nil, repository.ErrVersionUnsupported{
			PluginID:         plugin.ID,
			RequestedVersion: version,
			SystemInfo:       compatOpts.String(),
		}
	}

	if version == "" {
		return latestForArch, nil
	}
	for _, v := range plugin.Versions {
		if v.Version == version {
			ver = v
			break
		}
	}

	if len(ver.Version) == 0 {
		s.log.Debugf("Requested plugin version %s v%s not found but potential fallback version '%s' was found",
			plugin.ID, version, latestForArch.Version)
		return nil, repository.ErrVersionNotFound{
			PluginID:         plugin.ID,
			RequestedVersion: version,
			SystemInfo:       compatOpts.String(),
		}
	}

	if !supportsCurrentArch(&ver, compatOpts) {
		s.log.Debugf("Requested plugin version %s v%s is not supported on your system but potential fallback version '%s' was found",
			plugin.ID, version, latestForArch.Version)
		return nil, repository.ErrVersionUnsupported{
			PluginID:         plugin.ID,
			RequestedVersion: version,
			SystemInfo:       compatOpts.String(),
		}
	}

	return &ver, nil
}

func supportsCurrentArch(version *repository.Version, compatOpts repository.CompatabilityOpts) bool {
	if version.Arch == nil {
		return true
	}
	for arch := range version.Arch {
		if arch == compatOpts.OSAndArch() || arch == "any" {
			return true
		}
	}
	return false
}

func latestSupportedVersion(plugin *repository.Plugin, compatOpts repository.CompatabilityOpts) *repository.Version {
	for _, v := range plugin.Versions {
		ver := v
		if supportsCurrentArch(&ver, compatOpts) {
			return &ver
		}
	}
	return nil
}

func normalizeVersion(version string) string {
	normalized := strings.ReplaceAll(version, " ", "")
	if strings.HasPrefix(normalized, "^") || strings.HasPrefix(normalized, "v") {
		return normalized[1:]
	}

	return normalized
}
