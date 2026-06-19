import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Notification,
  shell,
  nativeImage,
  Tray,
  Menu,
} from "electron";
import path from "path";
import fs from "fs";
import { setupStore, getStore } from "./store";
import { startServer, stopServer } from "./server";
import { startDiscovery, stopDiscovery } from "./discovery";
import { TransferManager } from "./transfers";

let mainWindow: BrowserWindow | null = null;
let transferManager: TransferManager | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === "development";
function createWindow() {
  const iconPath = path.join(app.getAppPath(), "assets/icon.ico");
  const iconExists = fs.existsSync(iconPath);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    icon: iconExists ? iconPath : undefined,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist-main/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), "dist-renderer/index.html"));
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (e) => {
    const store = getStore();
    const minimizeToTray = store.get("minimizeToTray") !== false;
    if (!isQuitting && minimizeToTray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  createTray(iconExists ? iconPath : undefined);
}

function createTray(iconPath?: string) {
  if (tray) return;
  const icon = iconPath
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("LabSwift");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show LabSwift",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      { type: "separator" },
      {
        label: "Quit LabSwift",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

app.setAppUserModelId("com.labswift.app");

app.whenReady().then(async () => {
  setupStore();
  createWindow();

  const store = getStore();
  const role = store.get("role") as string | undefined;

  if (role) {
    const port = role === "admin" ? 7890 : 7891;
    transferManager = new TransferManager(mainWindow!);
    await startServer(port, transferManager, mainWindow!);
    startDiscovery(role, port, mainWindow!);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (isQuitting || process.platform !== "darwin") {
    stopDiscovery();
    stopServer();
    app.quit();
  }
});

// ── Window controls ──
ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle("window:close", () => mainWindow?.close());

// ── Store ──
ipcMain.handle("store:get", (_e, key: string) => {
  return getStore().get(key);
});
ipcMain.handle("store:set", (_e, key: string, value: unknown) => {
  getStore().set(key, value);
});
ipcMain.handle("store:delete", (_e, key: string) => {
  getStore().delete(key);
});

// ── Setup ──
ipcMain.handle(
  "setup:complete",
  async (_e, role: "admin" | "client", password: string) => {
    const store = getStore();
    if (role === "admin") {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash(password, 10);
      store.set("adminPasswordHash", hash);
    }
    store.set("adminPassword", password);
    store.set("role", role);

    const port = role === "admin" ? 7890 : 7891;
    transferManager = new TransferManager(mainWindow!);
    await startServer(port, transferManager, mainWindow!);
    startDiscovery(role, port, mainWindow!);

    return { success: true };
  }
);

ipcMain.handle("setup:verifyAdmin", async (_e, password: string) => {
  const store = getStore();
  const hash = store.get("adminPasswordHash") as string | undefined;
  if (!hash) return false;
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(password, hash);
});

// ── Reset setup (lets admin/client re-run the first-time wizard) ──
ipcMain.handle("setup:reset", async () => {
  stopDiscovery();
  stopServer();
  const store = getStore();
  store.delete("role");
  store.delete("adminPasswordHash");
  store.delete("adminPassword");
  store.delete("peers");
  store.delete("peerId");
  store.delete("pcName");
  transferManager = null;
  return { success: true };
});

// ── File selection ──
ipcMain.handle("dialog:openFile", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory"],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:saveFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory", "createDirectory"],
    title: "Select folder to save received files",
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ── Transfers ──
ipcMain.handle(
  "transfer:send",
  async (
    _e,
    targetIds: string[],
    filePaths: string[],
    adminPassword: string
  ) => {
    if (!transferManager) return { error: "Transfer manager not ready" };
    return transferManager.sendFiles(targetIds, filePaths, adminPassword);
  }
);

ipcMain.handle("transfer:list", () => {
  return transferManager?.getTransfers() ?? [];
});

ipcMain.handle("transfer:cancel", (_e, transferId: string) => {
  transferManager?.cancelTransfer(transferId);
});

ipcMain.handle(
  "transfer:retry",
  (_e, transferId: string, adminPassword: string) => {
    transferManager?.retryTransfer(transferId, adminPassword);
  }
);

// ── Peers ──
ipcMain.handle("peers:list", () => {
  const store = getStore();
  return store.get("peers") ?? [];
});

ipcMain.handle("peer:rename", (_e, peerId: string, name: string) => {
  const store = getStore();
  const peers = (store.get("peers") as Peer[]) ?? [];
  const updated = peers.map((p) => (p.id === peerId ? { ...p, name } : p));
  store.set("peers", updated);
  return updated;
});

ipcMain.handle(
  "peer:setRow",
  (_e, peerId: string, row: string, seat: string) => {
    const store = getStore();
    const peers = (store.get("peers") as Peer[]) ?? [];
    const updated = peers.map((p) =>
      p.id === peerId ? { ...p, row, seat } : p
    );
    store.set("peers", updated);
    return updated;
  }
);

// ── Save path ──
ipcMain.handle("savePath:get", () => {
  const store = getStore();
  return (
    (store.get("savePath") as string) ||
    app.getPath("downloads") + "/LabSwift"
  );
});

ipcMain.handle("savePath:set", (_e, p: string) => {
  getStore().set("savePath", p);
  fs.mkdirSync(p, { recursive: true });
});

// ── Open folder ──
ipcMain.handle("shell:openPath", (_e, p: string) => {
  shell.openPath(p);
});

// ── Notification ──
ipcMain.handle(
  "notify",
  (_e, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  }
);

export interface Peer {
  id: string;
  name: string;
  host: string;
  port: number;
  role: string;
  online: boolean;
  row?: string;
  seat?: string;
  lastSeen?: number;
}
