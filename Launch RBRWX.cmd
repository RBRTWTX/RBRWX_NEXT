@echo off
setlocal
title RBRWX NEXT Launcher
pushd "%~dp0" || goto failure
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install the project-required Node 22-24 and try again.
  goto failure
)
node "scripts\desktop\launcher.mjs"
if errorlevel 1 goto failure
popd
exit /b 0
:failure
echo.
echo Launch did not complete. Review the error above. No application data was deleted.
pause
exit /b 1
