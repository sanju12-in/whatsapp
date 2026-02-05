#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "--- STARTING BUILD ---"

echo "1. Installing Dependencies..."
# Use --production to skip unnecessary dev tools and save RAM
npm install --production

# 2. Check if Chrome exists before downloading
if [ -d "/opt/render/.cache/puppeteer" ]; then
    echo "✅ Chrome cache found! Skipping download to save memory."
else
    echo "⚠️ Cache miss. Downloading Chrome now..."
    npx puppeteer browsers install chrome
fi

echo "--- BUILD COMPLETED SUCCESSFULLY ---"
