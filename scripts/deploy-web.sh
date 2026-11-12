#!/usr/bin/env bash
# Build the Expo web bundle with prod Convex URLs, sync to S3, and invalidate CloudFront.
#
# The build runs with your normal dev setup untouched: `.env.local` stays in
# place and `convex dev` keeps running. That is safe because the two Convex
# URLs are the only values that differ between dev and prod, and this script
# passes them in the shell environment, which wins over `.env.local` both in
# Expo's own env loading and in `app.config.js`. As a backstop the script
# refuses to upload a bundle that lacks the prod URL or contains the dev one.
#
# Usage:
#   timeplete-app/scripts/deploy-web.sh             # full: build + upload + invalidate
#   timeplete-app/scripts/deploy-web.sh --no-build  # upload existing dist-web only
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${AWS_PROFILE:=productivity-app-dev}"
export AWS_PROFILE
BUCKET="timeplete-prod"
DIST_ID="EG1994EME4JS5"
DIST_DIR="dist-web"

PROD_CONVEX_URL="${PROD_CONVEX_URL:-https://earnest-herring-755.convex.cloud}"
PROD_CONVEX_SITE_URL="${PROD_CONVEX_SITE_URL:-https://earnest-herring-755.convex.site}"

DO_BUILD=1
if [[ "${1:-}" == "--no-build" ]]; then DO_BUILD=0; fi

if [[ "$DO_BUILD" == "1" ]]; then
  echo "==> Building web bundle with prod Convex URLs"

  rm -rf "$DIST_DIR" .expo node_modules/.cache

  EXPO_PUBLIC_CONVEX_URL="$PROD_CONVEX_URL" \
  EXPO_PUBLIC_CONVEX_SITE_URL="$PROD_CONVEX_SITE_URL" \
  npx expo export --platform web --output-dir "$DIST_DIR" --clear

  if ! grep -q "${PROD_CONVEX_URL#https://}" "$DIST_DIR"/_expo/static/js/web/*.js 2>/dev/null; then
    echo "ERROR: prod Convex URL not found in built bundle. Aborting before upload." >&2
    exit 1
  fi

  # The dev backend address from .env.local must not have leaked in.
  DEV_CONVEX_URL="$(sed -n 's/^EXPO_PUBLIC_CONVEX_URL=//p' .env.local 2>/dev/null | tr -d "\"'" | head -1)"
  if [[ -n "$DEV_CONVEX_URL" && "$DEV_CONVEX_URL" != "$PROD_CONVEX_URL" ]] &&
    grep -qF "$DEV_CONVEX_URL" "$DIST_DIR"/_expo/static/js/web/*.js 2>/dev/null; then
    echo "ERROR: dev Convex URL from .env.local found in built bundle. Aborting before upload." >&2
    exit 1
  fi

  # Kill leftover service workers / Cache Storage from the previous Angular
  # app on www.timeplete.com (and any other host that used to serve it).
  # Runs before the Expo bundle so a stale SW can't keep controlling the page.
  python3 - <<'PY'
from pathlib import Path
p = Path("dist-web/index.html")
html = p.read_text()
snippet = """<script>
(function () {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) { r.unregister(); });
      });
    }
    if (window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        keys.forEach(function (k) { caches.delete(k); });
      });
    }
  } catch (e) {}
})();
</script>"""
if "serviceWorker' in navigator" not in html and "serviceWorker\" in navigator" not in html:
    html = html.replace("</head>", snippet + "\n</head>", 1)
    p.write_text(html)
    print("Injected service-worker / cache cleanup into index.html")
else:
    print("Cleanup script already present in index.html")
PY
fi

# Upload new hashed bundles FIRST (no --delete), then prune orphans.
# `--delete` on the first pass can briefly remove the previous entry-*.js
# while CloudFront still serves an index.html that points at it — SPA
# fallback then returns HTML for the missing JS and the site goes blank.
echo "==> Uploading hashed bundles to s3://$BUCKET/_expo/ (immutable)"
aws s3 sync "$DIST_DIR/_expo/" "s3://$BUCKET/_expo/" \
  --cache-control "public, max-age=31536000, immutable" \
  --no-progress
aws s3 sync "$DIST_DIR/_expo/" "s3://$BUCKET/_expo/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --no-progress

ENTRY_COUNT=$(find "$DIST_DIR/_expo/static/js/web" -name 'entry-*.js' | wc -l | tr -d ' ')
REMOTE_ENTRY=$(aws s3 ls "s3://$BUCKET/_expo/static/js/web/" | awk '/entry-.*\.js/ {print $4}' | head -1)
if [[ "$ENTRY_COUNT" -lt 1 || -z "$REMOTE_ENTRY" ]]; then
  echo "ERROR: entry-*.js missing after upload (local=$ENTRY_COUNT remote='$REMOTE_ENTRY'). Aborting." >&2
  exit 1
fi
echo "    verified $REMOTE_ENTRY on S3"

echo "==> Uploading root files to s3://$BUCKET/ (no-cache)"
aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" \
  --delete \
  --exclude "_expo/*" \
  --cache-control "public, max-age=0, must-revalidate" \
  --no-progress

# Self-unregistering stubs so any leftover Angular / MSW worker that
# re-fetches its script URL gets replaced by a kill-switch (SPA fallback
# would otherwise serve index.html as JS and leave the old SW in place).
cat > "$DIST_DIR/sw.js" <<'EOF'
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(
    self.registration.unregister().then(() =>
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((c) => c.navigate(c.url));
      }),
    ),
  );
});
EOF
cp "$DIST_DIR/sw.js" "$DIST_DIR/ngsw-worker.js"
cp "$DIST_DIR/sw.js" "$DIST_DIR/mockServiceWorker.js"
printf '%s\n' '{}' > "$DIST_DIR/ngsw.json"

aws s3 cp "$DIST_DIR/sw.js" "s3://$BUCKET/sw.js" \
  --cache-control "public, max-age=0, must-revalidate" --content-type "application/javascript" --no-progress
aws s3 cp "$DIST_DIR/ngsw-worker.js" "s3://$BUCKET/ngsw-worker.js" \
  --cache-control "public, max-age=0, must-revalidate" --content-type "application/javascript" --no-progress
aws s3 cp "$DIST_DIR/mockServiceWorker.js" "s3://$BUCKET/mockServiceWorker.js" \
  --cache-control "public, max-age=0, must-revalidate" --content-type "application/javascript" --no-progress
aws s3 cp "$DIST_DIR/ngsw.json" "s3://$BUCKET/ngsw.json" \
  --cache-control "public, max-age=0, must-revalidate" --content-type "application/json" --no-progress

echo "==> Invalidating CloudFront $DIST_ID"
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --query 'Invalidation.{Id:Id,Status:Status}'

echo "==> Done. https://www.timeplete.com (also beta / apex)"
