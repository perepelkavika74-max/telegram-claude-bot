#!/bin/bash
cd /root/telegram-claude-bot
git pull origin main
pm2 restart telegram-claude-bot
