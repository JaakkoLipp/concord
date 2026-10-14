#!/usr/bin/env bash
# One-time base setup of the Concord VPS (Ubuntu 26.04): firewall, swap, Docker.
# Run on the server as a sudo-capable user: bash server-setup.sh
set -euo pipefail

# 1. Firewall: allow SSH before enabling, then web and LiveKit media.
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw allow 7881/tcp
sudo ufw allow 50000:50100/udp
sudo ufw --force enable

# 2. Swap: 4 GB, persistent, low swappiness. Binding addresses that aren't up yet (99-concord-net.conf).
if [ ! -f /swapfile ]; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-concord-swap.conf
sudo install -m 0644 "$(dirname "$0")/99-concord-net.conf" /etc/sysctl.d/99-concord-net.conf
sudo sysctl --system >/dev/null

# 3. Docker Engine and Compose plugin from Docker's official apt repository.
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

# 4. Reboot for security updates that need it, at 05:30 (docs/m3-plan.md decision 8).
sudo install -m 0644 "$(dirname "$0")/52concord-auto-reboot" /etc/apt/apt.conf.d/52concord-auto-reboot

# 5. Scheduled jobs: the weekly LiveKit restart.
sudo install -m 0644 "$(dirname "$0")/concord-cron" /etc/cron.d/concord
