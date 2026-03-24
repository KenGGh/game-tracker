@echo off
echo 正在启动游戏追踪器服务器...
cd /d "%~dp0"
start http://localhost:3000
node server.js