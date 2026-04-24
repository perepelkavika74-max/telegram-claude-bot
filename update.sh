#!/bin/bash
cd /root/telegram-claude-bot
git pull origin main
npm install --production
pm2 restart telegram-claude-bot
