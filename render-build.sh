#!/usr/bin/env bash
# Exit on error
set -o errexit

npm install
# Force Puppeteer to download Chrome
npx puppeteer browsers install chrome
