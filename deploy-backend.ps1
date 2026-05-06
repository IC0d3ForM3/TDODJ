# ============================================================
# deploy-backend.ps1
# Builds the TypeScript backend and deploys it to EC2 via SCP.
# On the server, PM2 restarts the process automatically.
#
# Prerequisites:
#   - EC2 instance running, key pair saved
#   - ec2-setup.sh already run on the server
#
# Usage:
#   .\deploy-backend.ps1
#   .\deploy-backend.ps1 -SkipBuild    # skip tsc, just upload
# ============================================================

param(
    [switch]$SkipBuild
)

# -------- CONFIGURE THESE --------
$EC2_HOST   = "44.222.133.132"
$EC2_USER   = "ec2-user"
$KEY_PATH   = "$HOME\.ssh\tdodj-ec2.pem"
$REMOTE_DIR = "/opt/tdodj-backend"
# ---------------------------------

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== TDODJ Backend Deploy ===" -ForegroundColor Cyan

# 1. Build
if (-not $SkipBuild) {
    Write-Host "`n[1/3] Building backend (tsc)..." -ForegroundColor Yellow
    Push-Location backend
    npm run build
    if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "Build failed." -ForegroundColor Red; exit 1 }
    Pop-Location
    Write-Host "Build complete." -ForegroundColor Green
} else {
    Write-Host "`n[1/3] Skipping build (--SkipBuild specified)." -ForegroundColor DarkGray
}

# 2. Upload via SCP
Write-Host "`n[2/3] Uploading to EC2 ($EC2_HOST)..." -ForegroundColor Yellow

# Ensure remote dist dir exists, then upload compiled JS
# FIX: Use -r src/. to copy contents (not src/ which creates nested dir on Windows)
ssh -i $KEY_PATH -o StrictHostKeyChecking=no "${EC2_USER}@${EC2_HOST}" "mkdir -p ${REMOTE_DIR}/dist"
scp -i $KEY_PATH -r "backend/dist/." "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/dist/"

# Upload package.json (prod deps only)
scp -i $KEY_PATH backend\package.json "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/package.json"

# Upload .prod.env as .env
scp -i $KEY_PATH backend\.prod.env "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/.env"

# 3. Remote: install prod deps + restart PM2
Write-Host "`n[3/3] Restarting app on server..." -ForegroundColor Yellow
$remoteCmd = "cd /opt/tdodj-backend && npm install --omit=dev && pm2 delete tdodj-backend 2>/dev/null; pm2 start dist/index.js --name tdodj-backend && pm2 save"
ssh -i $KEY_PATH -o StrictHostKeyChecking=no "${EC2_USER}@${EC2_HOST}" $remoteCmd

if ($LASTEXITCODE -ne 0) { Write-Host "Remote restart failed." -ForegroundColor Red; exit 1 }

Write-Host "`nDeploy complete!" -ForegroundColor Cyan
Write-Host "API: https://api.tdodj.com`n"
