@echo off
cd /d "%~dp0"
node scripts/release/windows.mjs
if errorlevel 1 (
 echo Windows release build did not complete.
 pause
 exit /b 1
)
pause
