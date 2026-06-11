@echo off
cd /d "%~dp0"
echo Starting command_center dev stack...
echo.
call npm run dev
if errorlevel 1 (
  echo.
  echo Dev stack exited with code %errorlevel%.
  pause
)
