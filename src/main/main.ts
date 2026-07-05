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
import os from "os";
import AdmZip from "adm-zip";
import { setupStore, getStore } from "./store";
import { startServer, stopServer } from "./server";
import { startDiscovery, stopDiscovery, forgetPeer } from "./discovery";
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

  mainWindow.once("ready-to-show", () => { mainWindow?.show(); });

  mainWindow.on("close", (e) => {
    const store = getStore();
    const minimizeToTray = store.get("minimizeToTray") !== false;
    if (!isQuitting && minimizeToTray) { e.preventDefault(); mainWindow?.hide(); }
  });

  mainWindow.on("closed", () => { mainWindow = null; });
  createTray(iconExists ? iconPath : undefined);
}

function createTray(iconPath?: string) {
  if (tray) return;
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("LabSwift");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show LabSwift", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type: "separator" },
      { label: "Quit LabSwift", click: () => { isQuitting = true; app.quit(); } },
    ])
  );
  tray.on("click", () => { mainWindow?.show(); mainWindow?.focus(); });
}

app.setAppUserModelId("com.labswift.app");

process.on("uncaughtException", (err) => { console.error("[LabSwift] uncaughtException:", err); });
process.on("unhandledRejection", (reason) => { console.error("[LabSwift] unhandledRejection:", reason); });

app.whenReady().then(async () => {
  setupStore();
  createWindow();

  const store = getStore();
  const role = store.get("role") as string | undefined;

  if (role) {
    const port = role === "admin" ? 7890 : 7891;
    transferManager = new TransferManager(mainWindow!);
    try {
      await startServer(port, transferManager, mainWindow!);
    } catch (err) {
      console.error("[LabSwift] Failed to start server:", err);
    }
    startDiscovery(role, port, mainWindow!);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on("before-quit", () => { isQuitting = true; });

app.on("window-all-closed", () => {
  if (isQuitting || process.platform !== "darwin") {
    stopDiscovery();
    stopServer().finally(() => app.quit());
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
ipcMain.handle("store:get", (_e, key: string) => getStore().get(key));
ipcMain.handle("store:set", (_e, key: string, value: unknown) => getStore().set(key, value));
ipcMain.handle("store:delete", (_e, key: string) => getStore().delete(key));

// ── Lock screen ──
ipcMain.handle("lockScreen:verify", (_e, password: string) => {
  const store = getStore();
  const stored = store.get("adminPassword") as string | undefined;
  if (!stored) return false;
  return password === stored;
});

// ── Setup ──
ipcMain.handle("setup:complete", async (_e, role: "admin" | "client", password: string) => {
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
  try {
    await startServer(port, transferManager, mainWindow!);
  } catch (err) {
    console.error("[LabSwift] Failed to start server after setup:", err);
  }
  startDiscovery(role, port, mainWindow!);
  return { success: true };
});

ipcMain.handle("setup:verifyAdmin", async (_e, password: string) => {
  const store = getStore();
  const hash = store.get("adminPasswordHash") as string | undefined;
  if (!hash) return false;
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(password, hash);
});

// ── Reset ──
ipcMain.handle("setup:reset", async () => {
  stopDiscovery();
  await stopServer();
  const store = getStore();
  store.delete("role");
  store.delete("adminPasswordHash");
  store.delete("adminPassword");
  store.delete("peers");
  store.delete("peerId");
  store.delete("pcName");
  store.delete("savePath");
  // Keep extensionFilter / malwareScan — these are admin policy, not per-machine identity
  transferManager = null;
  return { success: true };
});

// ── Dialogs ──
ipcMain.handle("dialog:openFile", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ["openFile", "multiSelections"] });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ["openDirectory"] });
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
ipcMain.handle("transfer:send", async (_e, targetIds: string[], filePaths: string[], adminPassword: string) => {
  if (!transferManager) return { error: "Transfer manager not ready" };
  const pcName = (getStore().get("pcName") as string) || os.hostname();
  const result = await transferManager.sendFiles(targetIds, filePaths, adminPassword);
  for (const fp of filePaths) {
    addAuditEntry({ type: "send", direction: "outgoing", from: pcName, fromIp: "localhost", detail: `Sent: ${path.basename(fp)} to ${targetIds.length} PC(s)` });
  }
  return result;
});

ipcMain.handle("transfer:sendFolder", async (_e, targetIds: string[], folderPath: string, adminPassword: string) => {
  if (!transferManager) return { error: "Transfer manager not ready" };
  if (!fs.existsSync(folderPath)) return { error: "Folder not found" };
  if (!fs.statSync(folderPath).isDirectory()) return { error: "Path is not a folder" };

  const folderName = path.basename(folderPath);
  const tmpDir = path.join(os.tmpdir(), "labswift-zip");
  fs.mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, `${folderName}-${Date.now()}.zip`);

  try {
    const zip = new AdmZip();
    zip.addLocalFolder(folderPath, folderName);
    zip.writeZip(zipPath);
  } catch (err) {
    return { error: `Failed to zip folder: ${err}` };
  }

  return transferManager.sendFolderZip(targetIds, zipPath, folderName, adminPassword);
});

ipcMain.handle("transfer:list", () => transferManager?.getTransfers() ?? []);
ipcMain.handle("transfer:cancel", (_e, transferId: string) => transferManager?.cancelTransfer(transferId));
ipcMain.handle("transfer:retry", (_e, transferId: string, adminPassword: string) => {
  transferManager?.retryTransfer(transferId, adminPassword);
});

// ── Chat / Broadcast ──
ipcMain.handle("chat:broadcast", async (_e, targetIds: string[], text: string, adminPassword: string) => {
  const store = getStore();
  const peers = (store.get("peers") as Peer[]) ?? [];
  const pcName = (store.get("pcName") as string) || os.hostname();
  const targets = peers.filter((p) => targetIds.includes(p.id) && p.online);
  let sent = 0;
  const errors: { peerId: string; reason: string }[] = [];

  for (const peer of targets) {
    try {
      const res = await fetch(`http://${peer.host}:${peer.port}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        body: JSON.stringify({ text, from: pcName, at: Date.now() }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        sent++;
      } else {
        const reason = res.status === 403 ? "Unauthorized (password mismatch)" : `HTTP ${res.status}`;
        console.error(`[LabSwift] chat send to ${peer.id} failed: ${reason}`);
        errors.push({ peerId: peer.id, reason });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[LabSwift] chat send to ${peer.id} failed:`, err);
      errors.push({ peerId: peer.id, reason });
    }
  }

  return { sent, total: targets.length, errors };
});

// ── Remote save path push (admin → clients) ──
// Admin picks a path on their side and pushes it to selected client PCs via HTTP.
// Each client stores it locally so the folder persists after restart.
ipcMain.handle(
  "savePath:pushToClients",
  async (_e, targetIds: string[], savePath: string, adminPassword: string) => {
    const store = getStore();
    const peers = (store.get("peers") as Peer[]) ?? [];
    const targets = peers.filter((p) => targetIds.includes(p.id) && p.online);
    let pushed = 0;

    for (const peer of targets) {
      try {
        const res = await fetch(`http://${peer.host}:${peer.port}/set-save-path`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
          body: JSON.stringify({ savePath }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          pushed++;
        } else {
          console.error(`[LabSwift] savePath push to ${peer.id} failed: HTTP ${res.status}`);
        }
      } catch (err) {
        console.error(`[LabSwift] savePath push to ${peer.id} failed:`, err);
      }
    }

    return { pushed, total: targets.length };
  }
);

// ── Peers ──
ipcMain.handle("peers:list", () => (getStore().get("peers") ?? []) as Peer[]);

ipcMain.handle("peer:rename", (_e, peerId: string, name: string) => {
  const store = getStore();
  const peers = (store.get("peers") as Peer[]) ?? [];
  const updated = peers.map((p) => (p.id === peerId ? { ...p, name } : p));
  store.set("peers", updated);
  return updated;
});

ipcMain.handle("peer:setRow", (_e, peerId: string, row: string, seat: string) => {
  const store = getStore();
  const peers = (store.get("peers") as Peer[]) ?? [];
  const updated = peers.map((p) => (p.id === peerId ? { ...p, row, seat } : p));
  store.set("peers", updated);
  return updated;
});

// ── Peer management ──
ipcMain.handle("peer:forget", (_e, peerId: string) => {
  forgetPeer(peerId);
  const store = getStore();
  const peers = (store.get("peers") as Peer[]) ?? [];
  const updated = peers.filter((p) => p.id !== peerId);
  store.set("peers", updated);
  mainWindow?.webContents.send("peers:updated", updated);
  return updated;
});

// ── Remote lock / unlock (admin → clients) ──────────────────────────────────
ipcMain.handle("remote:lock", async (_e, targetIds: string[], adminPassword: string) => {
  const store = getStore();
  const peers = (store.get("peers") as Peer[]) ?? [];
  const targets = peers.filter((p) => targetIds.includes(p.id) && p.online);
  let sent = 0;
  const errors: { peerId: string; reason: string }[] = [];

  for (const peer of targets) {
    try {
      const res = await fetch(`http://${peer.host}:${peer.port}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) sent++;
      else errors.push({ peerId: peer.id, reason: `HTTP ${res.status}` });
    } catch (err) {
      errors.push({ peerId: peer.id, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { sent, total: targets.length, errors };
});

ipcMain.handle("remote:unlock", async (_e, targetIds: string[], adminPassword: string) => {
  const store = getStore();
  const peers = (store.get("peers") as Peer[]) ?? [];
  const targets = peers.filter((p) => targetIds.includes(p.id) && p.online);
  let sent = 0;

  for (const peer of targets) {
    try {
      const res = await fetch(`http://${peer.host}:${peer.port}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) sent++;
    } catch { /* ignore */ }
  }
  return { sent, total: targets.length };
});

// ── Security settings ────────────────────────────────────────────────────────
// These are stored in electron-store and read by server.ts on each request so
// they take effect immediately without restarting the app.
ipcMain.handle("security:getSettings", () => {
  const store = getStore();
  return {
    extensionFilter: store.get("extensionFilter") !== false,
    malwareScan: store.get("malwareScan") !== false,
  };
});

ipcMain.handle("security:setSettings", (_e, settings: { extensionFilter?: boolean; malwareScan?: boolean }) => {
  const store = getStore();
  if (typeof settings.extensionFilter === "boolean") store.set("extensionFilter", settings.extensionFilter);
  if (typeof settings.malwareScan === "boolean") store.set("malwareScan", settings.malwareScan);
  return { success: true };
});

// ── Save path (local) ──
ipcMain.handle("savePath:get", () => {
  const store = getStore();
  const p = (store.get("savePath") as string) || path.join(app.getPath("downloads"), "LabSwift");
  try { fs.mkdirSync(p, { recursive: true }); } catch { /* ignore */ }
  return p;
});

ipcMain.handle("savePath:set", (_e, p: string) => {
  getStore().set("savePath", p);
  fs.mkdirSync(p, { recursive: true });
});

// ── Shell ──
ipcMain.handle("shell:openPath", (_e, p: string) => { shell.openPath(p); });

// ── Notification ──
ipcMain.handle("notify", (_e, title: string, body: string) => {
  if (Notification.isSupported()) new Notification({ title, body }).show();
});

// ── Work Collection (admin pulls files from clients) ──────────────────────
ipcMain.handle(
  "collection:pull",
  async (_e, targetIds: string[], destFolder: string, adminPassword: string) => {
    const store = getStore();
    const peers = (store.get("peers") as Peer[]) ?? [];
    const targets = peers.filter((p) => targetIds.includes(p.id) && p.online);
    const results: { peerId: string; pcName: string; files: number; skipped: number; error?: string }[] = [];

    fs.mkdirSync(destFolder, { recursive: true });

    for (const peer of targets) {
      try {
        const res = await fetch(`http://${peer.host}:${peer.port}/collect`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
          signal: AbortSignal.timeout(30_000),
        });

        if (res.status === 204) {
          results.push({ peerId: peer.id, pcName: peer.name, files: 0, skipped: 0 });
          continue;
        }

        if (!res.ok) {
          results.push({ peerId: peer.id, pcName: peer.name, files: 0, skipped: 0, error: `HTTP ${res.status}` });
          continue;
        }

        const fileCount  = Number(res.headers.get("x-file-count") || 0);
        const skipCount  = Number(res.headers.get("x-skipped-count") || 0);
        const buffer     = Buffer.from(await res.arrayBuffer());
        const pcDestDir  = path.join(destFolder, peer.name);
        fs.mkdirSync(pcDestDir, { recursive: true });

        const zip = new AdmZip(buffer);
        zip.extractAllTo(pcDestDir, true);

        // Audit log
        addAuditEntry({
          type: "collect", direction: "incoming",
          from: peer.name, fromIp: peer.host,
          detail: `Collected ${fileCount} file(s) from ${peer.name}`,
        });

        results.push({ peerId: peer.id, pcName: peer.name, files: fileCount, skipped: skipCount });
      } catch (err) {
        results.push({ peerId: peer.id, pcName: peer.name, files: 0, skipped: 0, error: String(err) });
      }
    }

    return { results, destFolder };
  }
);

// ── Open URL on client PCs ────────────────────────────────────────────────
ipcMain.handle("url:push", async (_e, targetIds: string[], url: string, adminPassword: string) => {
  const store  = getStore();
  const peers  = (store.get("peers") as Peer[]) ?? [];
  const pcName = (store.get("pcName") as string) || os.hostname();
  const targets = peers.filter((p) => targetIds.includes(p.id) && p.online);
  let sent = 0;

  for (const peer of targets) {
    try {
      const res = await fetch(`http://${peer.host}:${peer.port}/open-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) sent++;
    } catch { /* ignore */ }
  }

  addAuditEntry({ type: "url", direction: "outgoing", from: pcName, fromIp: "localhost", detail: `Pushed URL to ${sent}/${targets.length} PCs: ${url}` });
  return { sent, total: targets.length };
});

// Admin: listen for URL open command from another admin (local shell open)
ipcMain.handle("url:openLocal", (_e, url: string) => {
  try { shell.openExternal(url); } catch { /* ignore */ }
});

// ── Remote Shutdown / Restart ──────────────────────────────────────────────
ipcMain.handle("remote:shutdown", async (_e, targetIds: string[], action: "shutdown" | "restart", adminPassword: string) => {
  const store  = getStore();
  const peers  = (store.get("peers") as Peer[]) ?? [];
  const pcName = (store.get("pcName") as string) || os.hostname();
  const targets = peers.filter((p) => targetIds.includes(p.id) && p.online);
  let sent = 0;

  for (const peer of targets) {
    try {
      const res = await fetch(`http://${peer.host}:${peer.port}/shutdown`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        body: JSON.stringify({ action }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) sent++;
    } catch { /* ignore */ }
  }

  addAuditEntry({ type: action, direction: "outgoing", from: pcName, fromIp: "localhost", detail: `${action} sent to ${sent}/${targets.length} PCs` });
  return { sent, total: targets.length };
});

ipcMain.handle("remote:cancelShutdown", async (_e, targetIds: string[], adminPassword: string) => {
  const store  = getStore();
  const peers  = (store.get("peers") as Peer[]) ?? [];
  const targets = peers.filter((p) => targetIds.includes(p.id) && p.online);
  let sent = 0;

  for (const peer of targets) {
    try {
      const res = await fetch(`http://${peer.host}:${peer.port}/cancel-shutdown`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) sent++;
    } catch { /* ignore */ }
  }
  return { sent, total: targets.length };
});

// Execute OS-level shutdown/restart — called by the client renderer when countdown hits zero
ipcMain.handle("system:shutdown", (_e, action: "shutdown" | "restart") => {
  const flag = action === "restart" ? "/r" : "/s";
  const { exec } = require("child_process") as typeof import("child_process");
  exec(`shutdown ${flag} /t 0 /f`, (err) => {
    if (err) console.error("[LabSwift] shutdown exec failed:", err);
  });
});

// ── Multi-admin approval system ────────────────────────────────────────────
// Secondary admin → finds primary admin on network → sends request → waits
ipcMain.handle("admin:requestApproval", async (_e, requesterPeerId: string, requesterPcName: string) => {
  const store  = getStore();
  const peers  = (store.get("peers") as Peer[]) ?? [];
  const primaryAdmin = peers.find((p) => p.role === "admin" && p.online);

  if (!primaryAdmin) {
    return { success: false, error: "No admin PC found on the network. Make sure the lab admin PC is on and LabSwift is open." };
  }

  try {
    const localIp = (() => {
      const ifaces = os.networkInterfaces();
      for (const iface of Object.values(ifaces)) {
        for (const info of iface ?? []) {
          if (info.family === "IPv4" && !info.internal) return info.address;
        }
      }
      return "unknown";
    })();

    const res = await fetch(`http://${primaryAdmin.host}:${primaryAdmin.port}/admin-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId: requesterPeerId, pcName: requesterPcName, ip: localIp }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) return { success: true, primaryName: primaryAdmin.name };
    return { success: false, error: `Primary admin returned HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

// Primary admin → approves or denies a secondary admin request
ipcMain.handle("admin:respond", async (_e, requesterIp: string, requesterPort: number, approved: boolean) => {
  const token = approved ? `approved-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` : undefined;
  try {
    await fetch(`http://${requesterIp}:${requesterPort}/admin-respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved, token }),
      signal: AbortSignal.timeout(5000),
    });

    if (approved) {
      // Record this approval on the primary so they can revoke later
      const store = getStore();
      const approvedAdmins = (store.get("approvedAdmins") as ApprovedAdmin[]) ?? [];
      const exists = approvedAdmins.find((a) => a.ip === requesterIp);
      if (!exists) {
        approvedAdmins.push({ ip: requesterIp, port: requesterPort, token: token!, approvedAt: Date.now() });
        store.set("approvedAdmins", approvedAdmins);
        mainWindow?.webContents.send("admin:approvedListUpdated", approvedAdmins);
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

// Primary admin → revoke a previously approved secondary admin
ipcMain.handle("admin:revoke", (_e, ip: string) => {
  const store = getStore();
  const approvedAdmins = (store.get("approvedAdmins") as ApprovedAdmin[]) ?? [];
  const updated = approvedAdmins.filter((a) => a.ip !== ip);
  store.set("approvedAdmins", updated);
  mainWindow?.webContents.send("admin:approvedListUpdated", updated);
  return updated;
});

ipcMain.handle("admin:listApproved", () => {
  return (getStore().get("approvedAdmins") as ApprovedAdmin[]) ?? [];
});

ipcMain.handle("admin:isApproved", () => {
  const store = getStore();
  return !!(store.get("approvedAdminToken") as string | undefined);
});

// ── Audit Log ──────────────────────────────────────────────────────────────
export interface AuditEntry {
  id: string;
  type: string;
  direction: "incoming" | "outgoing";
  from: string;
  fromIp: string;
  detail: string;
  at: number;
}

interface ApprovedAdmin {
  ip: string;
  port: number;
  token: string;
  approvedAt: number;
}

function addAuditEntry(entry: Omit<AuditEntry, "id" | "at">) {
  const store = getStore();
  const log = (store.get("auditLog") as AuditEntry[]) ?? [];
  const newEntry: AuditEntry = { ...entry, id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now() };
  const trimmed = [newEntry, ...log].slice(0, 500); // keep last 500 entries
  store.set("auditLog", trimmed);
  mainWindow?.webContents.send("log:updated", trimmed);
}

// Expose addAuditEntry so server.ts can call it via IPC from within electron
ipcMain.handle("log:add", (_e, entry: Omit<AuditEntry, "id" | "at">) => { addAuditEntry(entry); });
ipcMain.handle("log:addFromRenderer", (_e, entry: Omit<AuditEntry, "id" | "at">) => { addAuditEntry(entry); });
ipcMain.handle("log:get", () => (getStore().get("auditLog") as AuditEntry[]) ?? []);
ipcMain.handle("log:clear", () => { getStore().delete("auditLog"); mainWindow?.webContents.send("log:updated", []); });

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
