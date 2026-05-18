#!/usr/bin/env bash
# Build the Expo web bundle with prod Convex URLs, sync to S3, and invalidate CloudFront.
#
# Why we move .env.local out of the way:
#   `app.config.js` reads .env.local DIRECTLY (higher precedence than .env.production)
#   to support the loopback-port discovery used during dev. For a prod build we have to
#   bypass that or it can bake localhost / dev URLs into the bundle. The script restores
#   .env.local at the end (and on any error) so dev workflow is undisturbed.
#
# Usage:
#   timeplete-app/scripts/deploy-web.sh             # full: build + upload + invalidate
#   timeplete-app/scripts/deploy-web.sh --no-build  # upload existing dist-web only
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${AWS_PROFILE:=timeplete-prod-deployment}"
export AWS_PROFILE
BUCKET="timeplete-prod"
DIST_ID="EG1994EME4JS5"
DIST_DIR="dist-web"

PROD_CONVEX_URL="${PROD_CONVEX_URL:-https://aware-anaconda-159.convex.cloud}"
PROD_CONVEX_SITE_URL="${PROD_CONVEX_SITE_URL:-https://aware-anaconda-159.convex.site}"

DO_BUILD=1
if [[ "${1:-}" == "--no-build" ]]; then DO_BUILD=0; fi

if [[ "$DO_BUILD" == "1" ]]; then
  echo "==> Building web bundle with prod Convex URLs"

  # Stop any local convex dev that may be rewriting .env.local mid-build.
  pkill -f "convex dev" 2>/dev/null || true
  sleep 1

  ENV_LOCAL_BAK=""
  if [[ -f .env.local ]]; then
    ENV_LOCAL_BAK=".env.local.deploy-bak.$$"
    mv .env.local "$ENV_LOCAL_BAK"
  fi
  cleanup() {
    if [[ -n "$ENV_LOCAL_BAK" && -f "$ENV_LOCAL_BAK" ]]; then
      mv "$ENV_LOCAL_BAK" .env.local
    fi
  }
  trap cleanup EXIT

  rm -rf "$DIST_DIR" .expo node_modules/.cache

  EXPO_PUBLIC_CONVEX_URL="$PROD_CONVEX_URL" \
  EXPO_PUBLIC_CONVEX_SITE_URL="$PROD_CONVEX_SITE_URL" \
  npx expo export --platform web --output-dir "$DIST_DIR" --clear

  if ! grep -q "aware-anaconda-159.convex.cloud" "$DIST_DIR"/_expo/static/js/web/*.js 2>/dev/null \
    && ! grep -q "${PROD_CONVEX_URL#https://}" "$DIST_DIR"/_expo/static/js/web/*.js 2>/dev/null; then
    echo "ERROR: prod Convex URL not found in built bundle. Aborting before upload." >&2
    exit 1
  fi
fi

echo "==> Uploading hashed bundles to s3://$BUCKET/_expo/ (immutable)"
aws s3 sync "$DIST_DIR/_expo/" "s3://$BUCKET/_expo/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --no-progress

echo "==> Uploading root files to s3://$BUCKET/ (no-cache)"
aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" \
  --delete \
  --exclude "_expo/*" \
  --cache-control "public, max-age=0, must-revalidate" \
  --no-progress

echo "==> Invalidating CloudFront $DIST_ID"
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/index.html" "/" "/favicon.ico" "/metadata.json" \
  --query 'Invalidation.{Id:Id,Status:Status}'

echo "==> Done. https://d16qnayuev2mch.cloudfront.net"
