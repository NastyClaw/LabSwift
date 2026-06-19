import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("labswift", {
  // Window controls
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),

  // Store
  storeGet: (key: string) => ipcRenderer.invoke("store:get", key),
  storeSet: (key: string, value: unknown) =>
    ipcRenderer.invoke("store:set", key, value),
  storeDelete: (key: string) => ipcRenderer.invoke("store:delete", key),

  // Setup
  setupComplete: (role: "admin" | "client", password: string) =>
    ipcRenderer.invoke("setup:complete", role, password),
  verifyAdmin: (password: string) =>
    ipcRenderer.invoke("setup:verifyAdmin", password),
  setupReset: () => ipcRenderer.invoke("setup:reset"),

  // Dialogs
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  saveFolder: () => ipcRenderer.invoke("dialog:saveFolder"),

  // Transfers
  sendFiles: (targetIds: string[], filePaths: string[], adminPassword: string) =>
    ipcRenderer.invoke("transfer:send", targetIds, filePaths, adminPassword),
  listTransfers: () => ipcRenderer.invoke("transfer:list"),
  cancelTransfer: (id: string) => ipcRenderer.invoke("transfer:cancel", id),
  retryTransfer: (id: string, adminPassword: string) =>
    ipcRenderer.invoke("transfer:retry", id, adminPassword),

  // Peers
  listPeers: () => ipcRenderer.invoke("peers:list"),
  renamePeer: (id: string, name: string) =>
    ipcRenderer.invoke("peer:rename", id, name),
  setPeerRow: (id: string, row: string, seat: string) =>
    ipcRenderer.invoke("peer:setRow", id, row, seat),

  // Save path
  getSavePath: () => ipcRenderer.invoke("savePath:get"),
  setSavePath: (p: string) => ipcRenderer.invoke("savePath:set", p),

  // Shell
  openPath: (p: string) => ipcRenderer.invoke("shell:openPath", p),

  // Notifications
  notify: (title: string, body: string) =>
    ipcRenderer.invoke("notify", title, body),

  // IPC events from main
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => cb(...args));
  },
  off: (channel: string, cb: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, cb);
  },
});
