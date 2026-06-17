# Building LabSwift for Windows

Complete step-by-step guide to build and package LabSwift into a single Windows installer `.exe`.

## Prerequisites

Install these on your Windows build machine:

1. **Node.js 22+** — https://nodejs.org (LTS recommended; Node 18 is end-of-life and Vite 7 will refuse to run on it)
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

**Build fails on Windows with "...is not a valid Win32 application" during `install-app-deps`?**
- This is a long-standing electron-builder bug: when it needs to rebuild a
  *native* dependency (one with C/C++ code, compiled via node-gyp) for
  Electron's ABI, it tries to invoke pnpm's `pnpm.cjs` directly as if it
  were an `.exe`, which Windows refuses to run.
- `better-sqlite3` used to be listed as a dependency here and triggered
  exactly this, even though nothing in the codebase ever used it (the app
  persists data with `electron-store`, not SQLite) — it's been removed.
- If you ever add a genuinely native dependency in the future, don't rely
  on electron-builder's automatic `npmRebuild`. Instead add
  `@electron/rebuild` as a devDependency and run it explicitly
  (`npx electron-rebuild`) in a build step before `electron-builder`, since
  that invokes things through `node` directly and isn't affected by this bug.

**File transfer fails with 403 Unauthorized?**
- Verify the admin password matches on admin and client. As of this build,
  the password is saved correctly for both roles right after Setup — if
  you're rebuilding from an older copy of this project, an admin who never
  revisited Settings could have had no password saved at all.

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

## What's new

- **Real-time progress on both sides.** Outgoing transfers already reported
  live percentage; incoming transfers now do too (previously a received
  file only appeared once 100% done).
- **Automatic retry.** A failed send is retried automatically up to 3
  times with backoff before being marked failed; failed transfers also get
  a manual Retry button.
- **Background reliability.** Closing the window minimizes to the system
  tray instead of quitting (toggle in Settings), and a power-save blocker
  keeps an active transfer from being interrupted by the OS power plan.
  Note: this app already kept running while the screen is locked, since
  Windows only suspends background apps on actual sleep, not on lock — the
  tray + power-save-blocker changes are about not getting closed or
  throttled, not about "unlocking" something that was previously blocked.
- **Themes.** Dark (default), Light, and Midnight, switchable in Settings.
