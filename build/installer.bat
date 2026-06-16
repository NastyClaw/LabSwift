@echo off
SETLOCAL EnableDelayedExpansion
echo =====================================
echo  LabSwift Inno Setup Packager
echo =====================================

:: Check for Inno Setup
set ISCC_PATH=
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe
) else if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set ISCC_PATH=C:\Program Files\Inno Setup 6\ISCC.exe
) else (
    echo ERROR: Inno Setup 6 not found.
    echo Please install from: https://jrsoftware.org/isdl.php
    pause
    exit /b 1
)

:: Check icon exists
if not exist "..\assets\icon.ico" (
    echo WARNING: assets\icon.ico not found. Using default icon.
    echo Place your icon.ico in the assets\ folder for a custom icon.
)

:: Check release dir exists from electron-builder
if not exist "..\release\win-unpacked" (
    echo ERROR: release\win-unpacked not found.
    echo Please run build\build.bat first.
    pause
    exit /b 1
)

echo Running Inno Setup compiler...
"%ISCC_PATH%" "..\installer\LabSwift.iss"
if errorlevel 1 (
    echo ERROR: Inno Setup compilation failed.
    pause
    exit /b 1
)

echo.
echo =====================================
echo  Installer created in release\ folder
echo =====================================
pause
