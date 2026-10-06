@echo off
REM Double-click this file to start LOST AGES (opens the main menu in your browser)
cd /d "%~dp0"
title Lost Ages
node scripts\play.js
if errorlevel 1 pause