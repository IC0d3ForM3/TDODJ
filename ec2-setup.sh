#!/bin/bash
# ============================================================
# ec2-setup.sh
# Run this ONCE on a fresh Amazon Linux 2023 EC2 instance to
# install Node 22, PM2, and Caddy, then configure the server.
#
# Usage (as ec2-user):
#   chmod +x ec2-setup.sh && ./ec2-setup.sh
# ============================================================

set -e

echo ""
echo "=== TDODJ EC2 Setup ==="

# ---- 1. System updates ----
echo "[1/6] Updating system..."
sudo dnf update -y

# ---- 2. Node 22 via NodeSource ----
echo "[2/6] Installing Node 22..."
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
node -v
npm -v

# ---- 3. PM2 ----
echo "[3/6] Installing PM2..."
sudo npm install -g pm2
pm2 -v

# ---- 4. Caddy ----
echo "[4/6] Installing Caddy..."
sudo dnf install -y 'dnf-command(copr)'
sudo yum-config-manager --add-repo https://copr.fedorainfracloud.org/coprs/g/caddy/caddy/repo/epel-9/group_caddy-caddy-epel-9.repo 2>/dev/null || true
# Fallback: install via rpm directly
CADDY_VERSION="2.9.1"
sudo rpm -i "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.rpm" 2>/dev/null || \
  sudo dnf install -y caddy 2>/dev/null || \
  (curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.tar.gz" | sudo tar -xz -C /usr/local/bin caddy && echo "Caddy installed from tarball")
caddy version

# ---- 5. App directory ----
echo "[5/6] Creating app directory..."
sudo mkdir -p /opt/tdodj-backend
sudo chown ec2-user:ec2-user /opt/tdodj-backend

# ---- 6. Caddyfile ----
echo "[6/6] Writing Caddyfile..."
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
api.tdodj.com {
    reverse_proxy localhost:3000
}
EOF

# Enable and start Caddy
sudo systemctl enable caddy
sudo systemctl restart caddy

# PM2 startup
pm2 startup systemd -u ec2-user --hp /home/ec2-user | tail -1 | bash || true

echo ""
echo "=== Setup complete! ==="
echo "Next: upload backend files to /opt/tdodj-backend/ and run deploy-backend.sh"
