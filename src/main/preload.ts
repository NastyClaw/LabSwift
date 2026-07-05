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

  // Lock screen
  verifyLockScreen: (password: string) =>
    ipcRenderer.invoke("lockScreen:verify", password),

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
  sendFolder: (targetIds: string[], folderPath: string, adminPassword: string) =>
    ipcRenderer.invoke("transfer:sendFolder", targetIds, folderPath, adminPassword),

  // Chat
  broadcastMessage: (targetIds: string[], text: string, adminPassword: string) =>
    ipcRenderer.invoke("chat:broadcast", targetIds, text, adminPassword),
  onChatMessage: (cb: (msg: { from: string; text: string; at: number }) => void) => {
    const listener = (_e: unknown, msg: { from: string; text: string; at: number }) => cb(msg);
    ipcRenderer.on("chat:message", listener);
    return () => ipcRenderer.removeListener("chat:message", listener);
  },

  // Remote save path push (admin → clients)
  pushSavePathToClients: (targetIds: string[], savePath: string, adminPassword: string) =>
    ipcRenderer.invoke("savePath:pushToClients", targetIds, savePath, adminPassword),
  // Client: listen for save path changes pushed by admin
  onSavePathUpdated: (cb: (newPath: string) => void) => {
    const listener = (_e: unknown, newPath: string) => cb(newPath);
    ipcRenderer.on("savePath:updated", listener);
    return () => ipcRenderer.removeListener("savePath:updated", listener);
  },

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
  forgetPeer: (id: string) => ipcRenderer.invoke("peer:forget", id),

  // Remote lock / unlock
  remoteLock: (targetIds: string[], adminPassword: string) =>
    ipcRenderer.invoke("remote:lock", targetIds, adminPassword),
  remoteUnlock: (targetIds: string[], adminPassword: string) =>
    ipcRenderer.invoke("remote:unlock", targetIds, adminPassword),

  // Security settings (extension filter, malware scan)
  getSecuritySettings: () => ipcRenderer.invoke("security:getSettings"),
  setSecuritySettings: (settings: { extensionFilter?: boolean; malwareScan?: boolean }) =>
    ipcRenderer.invoke("security:setSettings", settings),

  // Threat notification (server → renderer when Defender flags a file)
  onThreatDetected: (cb: (info: { fileName: string; detail?: string }) => void) => {
    const listener = (_e: unknown, info: { fileName: string; detail?: string }) => cb(info);
    ipcRenderer.on("notify:threat", listener);
    return () => ipcRenderer.removeListener("notify:threat", listener);
  },

  // Lock screen commands (pushed from admin via /lock and /unlock endpoints)
  onLockEngage: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("lock:engage", listener);
    return () => ipcRenderer.removeListener("lock:engage", listener);
  },
  onLockRelease: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("lock:release", listener);
    return () => ipcRenderer.removeListener("lock:release", listener);
  },

  // Save path (local)
  getSavePath: () => ipcRenderer.invoke("savePath:get"),
  setSavePath: (p: string) => ipcRenderer.invoke("savePath:set", p),

  // Work collection (admin pulls from clients)
  collectWork: (targetIds: string[], destFolder: string, adminPassword: string) =>
    ipcRenderer.invoke("collection:pull", targetIds, destFolder, adminPassword),

  // Open URL on client PCs
  pushUrl: (targetIds: string[], url: string, adminPassword: string) =>
    ipcRenderer.invoke("url:push", targetIds, url, adminPassword),
  openUrlLocal: (url: string) => ipcRenderer.invoke("url:openLocal", url),
  onOpenUrl: (cb: (url: string) => void) => {
    const listener = (_e: unknown, url: string) => cb(url);
    ipcRenderer.on("url:open", listener);
    return () => ipcRenderer.removeListener("url:open", listener);
  },

  // Shutdown / Restart
  remoteShutdown: (targetIds: string[], action: "shutdown" | "restart", adminPassword: string) =>
    ipcRenderer.invoke("remote:shutdown", targetIds, action, adminPassword),
  remoteCancelShutdown: (targetIds: string[], adminPassword: string) =>
    ipcRenderer.invoke("remote:cancelShutdown", targetIds, adminPassword),
  systemShutdown: (action: "shutdown" | "restart") =>
    ipcRenderer.invoke("system:shutdown", action),
  onShutdownCountdown: (cb: (data: { action: "shutdown" | "restart" }) => void) => {
    const listener = (_e: unknown, data: { action: "shutdown" | "restart" }) => cb(data);
    ipcRenderer.on("shutdown:countdown", listener);
    return () => ipcRenderer.removeListener("shutdown:countdown", listener);
  },
  onShutdownCancel: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("shutdown:cancel", listener);
    return () => ipcRenderer.removeListener("shutdown:cancel", listener);
  },

  // Multi-admin approval
  requestAdminApproval: (peerId: string, pcName: string) =>
    ipcRenderer.invoke("admin:requestApproval", peerId, pcName),
  respondToAdminRequest: (requesterIp: string, requesterPort: number, approved: boolean) =>
    ipcRenderer.invoke("admin:respond", requesterIp, requesterPort, approved),
  revokeAdminAccess: (ip: string) => ipcRenderer.invoke("admin:revoke", ip),
  listApprovedAdmins: () => ipcRenderer.invoke("admin:listApproved"),
  isAdminApproved: () => ipcRenderer.invoke("admin:isApproved"),
  onApprovalRequest: (cb: (req: { peerId: string; pcName: string; ip: string; at: number }) => void) => {
    const listener = (_e: unknown, req: { peerId: string; pcName: string; ip: string; at: number }) => cb(req);
    ipcRenderer.on("admin:approvalRequest", listener);
    return () => ipcRenderer.removeListener("admin:approvalRequest", listener);
  },
  onAdminApproved: (cb: (data: { token: string }) => void) => {
    const listener = (_e: unknown, data: { token: string }) => cb(data);
    ipcRenderer.on("admin:approved", listener);
    return () => ipcRenderer.removeListener("admin:approved", listener);
  },
  onAdminDenied: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("admin:denied", listener);
    return () => ipcRenderer.removeListener("admin:denied", listener);
  },
  onApprovedListUpdated: (cb: (list: unknown[]) => void) => {
    const listener = (_e: unknown, list: unknown[]) => cb(list);
    ipcRenderer.on("admin:approvedListUpdated", listener);
    return () => ipcRenderer.removeListener("admin:approvedListUpdated", listener);
  },

  // Audit log
  getLog: () => ipcRenderer.invoke("log:get"),
  clearLog: () => ipcRenderer.invoke("log:clear"),
  addLogEntry: (entry: { type: string; direction: "incoming" | "outgoing"; from: string; fromIp: string; detail: string }) =>
    ipcRenderer.invoke("log:addFromRenderer", entry),
  onLogUpdated: (cb: (entries: unknown[]) => void) => {
    const listener = (_e: unknown, entries: unknown[]) => cb(entries);
    ipcRenderer.on("log:updated", listener);
    return () => ipcRenderer.removeListener("log:updated", listener);
  },

  // Shell
  openPath: (p: string) => ipcRenderer.invoke("shell:openPath", p),

  // Notifications
  notify: (title: string, body: string) =>
    ipcRenderer.invoke("notify", title, body),

  // IPC events
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => cb(...args));
  },
  off: (channel: string, cb: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, cb);
  },
});
