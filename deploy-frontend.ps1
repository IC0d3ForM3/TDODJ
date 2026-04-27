# ============================================================
# deploy-frontend.ps1
# Builds Angular for production and syncs to S3, then
# optionally invalidates the CloudFront cache.
#
# Prerequisites:
#   - AWS CLI installed and configured (aws configure)
#   - S3 bucket created and CloudFront distribution set up
#
# Usage:
#   .\deploy-frontend.ps1
#   .\deploy-frontend.ps1 -SkipBuild        # skip ng build, just sync
#   .\deploy-frontend.ps1 -SkipInvalidation # skip CloudFront invalidation
# ============================================================

param(
    [switch]$SkipBuild,
    [switch]$SkipInvalidation
)

# -------- CONFIGURE THESE --------
$S3_BUCKET      = "tdodj.com"          # S3 bucket name
$CF_DIST_ID     = "E2FHMVKCK5QKSV"    # CloudFront distribution ID
$DIST_DIR       = "dist\DandDanny\browser"
# ---------------------------------

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== TDODJ Frontend Deploy ===" -ForegroundColor Cyan

# 1. Build
if (-not $SkipBuild) {
    Write-Host "`n[1/3] Building Angular (production)..." -ForegroundColor Yellow
    npx ng build --configuration production
    if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }
    Write-Host "Build complete." -ForegroundColor Green
} else {
    Write-Host "`n[1/3] Skipping build (--SkipBuild specified)." -ForegroundColor DarkGray
}

# 2. Sync to S3
Write-Host "`n[2/3] Syncing to s3://$S3_BUCKET ..." -ForegroundColor Yellow

# HTML files: no cache (always fresh)
aws s3 sync $DIST_DIR "s3://$S3_BUCKET" `
    --exclude "*" `
    --include "*.html" `
    --content-type "text/html" `
    --cache-control "no-cache, no-store, must-revalidate" `
    --delete

# Hashed JS/CSS assets: cache aggressively (filenames change on rebuild)
aws s3 sync $DIST_DIR "s3://$S3_BUCKET" `
    --exclude "*.html" `
    --cache-control "public, max-age=31536000, immutable" `
    --delete

if ($LASTEXITCODE -ne 0) { Write-Host "S3 sync failed." -ForegroundColor Red; exit 1 }
Write-Host "S3 sync complete." -ForegroundColor Green

# 3. CloudFront invalidation
if (-not $SkipInvalidation) {
    if ($CF_DIST_ID -eq "") {
        Write-Host "`n[3/3] Skipping CloudFront invalidation (CF_DIST_ID not set yet)." -ForegroundColor DarkGray
    } else {
        Write-Host "`n[3/3] Invalidating CloudFront cache for $CF_DIST_ID ..." -ForegroundColor Yellow
        aws cloudfront create-invalidation `
            --distribution-id $CF_DIST_ID `
            --paths "/*"
        if ($LASTEXITCODE -ne 0) { Write-Host "Invalidation failed." -ForegroundColor Red; exit 1 }
        Write-Host "Invalidation submitted." -ForegroundColor Green
    }
} else {
    Write-Host "`n[3/3] Skipping CloudFront invalidation (--SkipInvalidation specified)." -ForegroundColor DarkGray
}

Write-Host "`nDeploy complete!" -ForegroundColor Cyan
Write-Host "Site: https://$S3_BUCKET`n"
