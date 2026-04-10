#!/bin/bash
# Deploy revinjun.com (static site + tractor game) to production
# Pulls latest from Cyxh/website, rebuilds tractor, restarts pm2, reloads nginx
set -e

ssh root@157.180.75.10 "
  set -e
  cd /opt/website
  git checkout -- .
  git pull
  cd /opt/website/tractor
  npm install
  npm run build
  pm2 restart tractor
  pm2 restart spotify-proxy gaming-proxy
  systemctl reload nginx
"
