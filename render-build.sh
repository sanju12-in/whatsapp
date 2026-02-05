#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -o errexit

echo "--- STARTING BUILD ---"

echo "1. Installing NPM Dependencies..."
npm install

echo "2. Downloading Chrome for Puppeteer..."
npx puppeteer browsers install chrome

echo "--- BUILD COMPLETED SUCCESSFULLY ---"
