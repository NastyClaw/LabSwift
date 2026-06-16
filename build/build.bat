@echo off
SETLOCAL EnableDelayedExpansion
echo =====================================
echo  LabSwift Builder
echo =====================================

echo [1/3] Installing dependencies...
call pnpm install
if errorlevel 1 (echo ERROR: pnpm install failed & exit /b 1)

echo [2/3] Building app...
call pnpm --filter @workspace/labswift run build
if errorlevel 1 (echo ERROR: Build failed & exit /b 1)

echo [3/3] Packaging with electron-builder...
call pnpm --filter @workspace/labswift run dist
if errorlevel 1 (echo ERROR: electron-builder failed & exit /b 1)

echo.
echo =====================================
echo  Build complete! Check release/ folder
echo =====================================
pause
