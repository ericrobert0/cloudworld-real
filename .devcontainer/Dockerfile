FROM mcr.microsoft.com/devcontainers/javascript-node:5-24-bookworm
RUN mkdir -p /etc/docker && printf '%s\n' '{"features":{"containerd-snapshotter":false},"storage-driver":"overlay2"}' > /etc/docker/daemon.json && chmod 600 /etc/docker/daemon.json
