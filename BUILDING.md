# Building LabSwift for Windows

Complete step-by-step guide to build and package LabSwift into a single Windows installer `.exe`.

## Prerequisites

Install these on your Windows build machine:

1. **Node.js 20+** — https://nodejs.org (LTS recommended)
2. **pnpm** — `npm install -g pnpm`
3. **Inno Setup 6** — https://jrsoftware.org/isdl.php (for the installer)
4. **Git** (optional, for cloning)

## Step 1: Get the source

Copy the `labswift` project folder to your Windows machine, or clone the repo.

## Step 2: Install dependencies

Open a terminal in the project root:

```cmd
pnpm install
```

If prompted about native build scripts, run:

```cmd
pnpm approve-builds
pnpm install
```

## Step 3: Add your icon (optional)

Place your `icon.ico` file at:

```
artifacts\labswift\assets\icon.ico
```

If no icon is provided, Electron will use its default icon.

## Step 4: Build the app

```cmd
build\build.bat
```

This will:
- Build the React renderer (Vite)
- Compile the Electron main process (TypeScript)
- Package everything with electron-builder into `release\win-unpacked\`

## Step 5: Create the installer

```cmd
build\installer.bat
```

This will:
- Check that Inno Setup 6 is installed
- Compile `installer\LabSwift.iss`
- Output `release\LabSwift-Setup-1.0.0.exe`

## Step 6: Distribute

Send `LabSwift-Setup-1.0.0.exe` to all lab PCs.

The installer:
- Lets the user choose install location (default: Program Files)
- Optional: run at Windows startup
- Optional: create desktop shortcut
- Includes uninstaller

## First-time setup on each PC

1. Run `LabSwift-Setup-1.0.0.exe`
2. Launch LabSwift
3. **Admin PC**: Choose "Admin", create a password
4. **Client PCs**: Choose "Client", enter the admin's password
5. All PCs must be on the same WiFi/Ethernet network (same router)

## Troubleshooting

**Clients not showing up on admin?**
- Make sure all PCs are on the same network (same router/switch)
- Check Windows Firewall — allow LabSwift through on ports 7890 and 7891
- Try disabling firewall temporarily to test

**File transfer fails?**
- Verify the admin password matches on admin and client
- Check the client's save folder exists and is writable

**Build fails with native module errors?**
- Run `pnpm approve-builds` then `pnpm install` again
- Make sure you have Visual Studio Build Tools installed (for better-sqlite3)
- Or remove better-sqlite3 from dependencies if not used

**Inno Setup not found?**
- Install from https://jrsoftware.org/isdl.php
- Use version 6.x (not 5.x)

## Firewall rules (Windows)

To avoid firewall popups, add rules via Group Policy or run:

```cmd
netsh advfirewall firewall add rule name="LabSwift Admin" dir=in action=allow program="%PROGRAMFILES%\LabSwift\LabSwift.exe" enable=yes
netsh advfirewall firewall add rule name="LabSwift Port 7890" dir=in action=allow protocol=TCP localport=7890
netsh advfirewall firewall add rule name="LabSwift Port 7891" dir=in action=allow protocol=TCP localport=7891
```
