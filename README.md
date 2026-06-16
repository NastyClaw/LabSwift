# LabSwift — LAN File Transfer System

Fast, offline LAN file transfer for computer labs. Works over WiFi or Ethernet on the same router. No internet required.

## Features

- **Admin + Client roles** — set up once with a password, no repeated auth
- **Send to any/all PCs** on the LAN, or target by row/seat
- **File browser** — pick files from anywhere (C:\, D:\, USB, etc.)
- **Auto-discovery** — PCs appear instantly when connected
- **Rename & organize** computers by row and seat
- **Real-time progress** with green/red status per transfer
- **System notifications** when files arrive (works on locked screen)
- **Resume support** — reconnects and retries automatically
- **Zero internet use** — completely offline over LAN

## Quick Start

### Install (development)

```bash
pnpm install
pnpm --filter @workspace/labswift run dev
```

### Build for Windows

```bash
# 1. Build everything
build\build.bat

# 2. Create installer (requires Inno Setup 6)
build\installer.bat
```

## Structure

```
src/
  main/         # Electron main process (Node.js)
    main.ts     # App entry, IPC handlers
    store.ts    # Persistent config (electron-store)
    discovery.ts # mDNS peer discovery (bonjour)
    server.ts   # Express file receive server
    transfers.ts # Transfer manager
    preload.ts  # Context bridge API
  renderer/     # React + Vite frontend
    src/
      pages/
        Setup.tsx      # First-run wizard
        AdminApp.tsx   # Admin console
        ClientApp.tsx  # Client receiver
      components/
        TitleBar.tsx   # Custom window controls
        TransferRow.tsx # Transfer list item
installer/
  LabSwift.iss  # Inno Setup script
build/
  build.bat     # Build script
  installer.bat # Create .exe installer
assets/
  icon.ico      # Place your icon here
```

## Admin vs Client

**Admin** (one per lab):
- Sees all online client PCs
- Rename computers, assign rows/seats
- Select files and send to one, many, or all PCs
- Password protected — only this admin can push files

**Client** (every student PC):
- Enter the admin's password once during setup
- Runs in background, receives files automatically
- Notifications appear even on locked screen
- Choose where files are saved

## Building the Installer

1. Install [Inno Setup 6](https://jrsoftware.org/isdl.php)
2. Place your `icon.ico` in the `assets/` folder
3. Run `build\build.bat` (builds the app with electron-builder)
4. Run `build\installer.bat` (creates `LabSwift-Setup-1.0.0.exe` in `release\`)

The installer:
- Lets user choose install location
- Optional: run at Windows startup
- Optional: desktop shortcut
- One-click uninstall
