@echo off
setlocal
set "RBRWX_SHORTCUT_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\desktop\shortcut.ps1"
if errorlevel 1 (
  echo Shortcut creation failed. You can still double-click Launch RBRWX.cmd.
  pause
  exit /b 1
)
echo Desktop shortcut created. Double-click RBRWX NEXT on your desktop.
pause
