#!/bin/bash
# Patch /opt/cody-scraper/server.js Jane detectors for the tags.cnna.io
# migration. Backs up the existing file first.

set -e
SRC=/opt/cody-scraper/server.js
BACKUP="${SRC}.bak-pre-jane-refresh-$(date +%s)"
cp "$SRC" "$BACKUP"
echo "Backed up to $BACKUP"

# 1) EMBED_PATTERNS entry for jane (around line 97)
perl -i -pe 's|\{ platform: "jane",     re: /iheartjane\\\.com/i \}|{ platform: "jane",     re: /iheartjane\\.com|tags\\.cnna\\.io\\/jane/i }|' "$SRC"

# 2) PLATFORM_SIGNATURES jane block
perl -i -pe 's|embed:  /iheartjane\\\.com/i|embed:  /iheartjane\\.com|tags\\.cnna\\.io\\/jane\\.[a-f0-9]+\\.js|tags\\.cnna\\.io\\/[^"\x27\\s]*environment=jane/i|' "$SRC"
perl -i -pe 's|widget: /\(\?:jane-app-settings\|window\\\.iHeartJane\|iHeartJaneConfig\)/i|widget: /(?:jane-app-settings|window\\.iHeartJane|iHeartJaneConfig|mj-snowplow-static-js\\.s3|tags\\.cnna\\.io\\/jane)/i|' "$SRC"

# Verify the edits landed.
echo "--- updated jane markers ---"
grep -nE 'cnna|iheartjane' "$SRC" | head -20
