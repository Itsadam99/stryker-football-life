@echo off
setlocal
cd /d "%~dp0"
title STRYKER - Mode developpement
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 ou plus recent est requis pour lancer les sources.
  pause
  exit /b 1
)
call npm run desktop
if errorlevel 1 pause
