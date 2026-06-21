import { BrowserWindow, Notification, powerSaveBlocker } from "electron";
import fs from "fs";
import http from "http";
import path from "path";
import { getStore } from "./store";
import type { Peer } from "./main";

export type TransferStatus =
  | "pending"
  | "sending"
  | "retrying"
  | "done"
  | "failed"
  | "cancelled";

export interface Transfer {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  targetId: string;
  targetName: string;
  direction: "outgoing" | "incoming";
  status: TransferStatus;
  progress: number;
  savedPath?: string;
  error?: string;
  startedAt: number;
  attempt?: number;
  maxAttempts?: number;
  /** True when this transfer carries a zipped folder. */
  isFolder?: boolean;
  /** Original folder name shown in the UI (zip file has an internal name). */
  originalFolderName?: string;
}

export class TransferManager {
  private transfers: Map<string, Transfer> = new Map();
  private win: BrowserWindow;
  private powerSaveBlockerId: number | null = null;
  private readonly maxAttempts = 3;
  private readonly retryDelaysMs = [1500, 4000];

  constructor(win: BrowserWindow) {
    this.win = win;
  }

  getTransfers(): Transfer[] {
    return Array.from(this.transfers.values()).sort(
      (a, b) => b.startedAt - a.startedAt
    );
  }

  recordIncoming(transferId: string, fileName: string, savedPath: string) {
    const existing = this.transfers.get(transferId);
    const t: Transfer = {
      id: transferId,
      fileName,
      filePath: savedPath,
      fileSize: fs.existsSync(savedPath)
        ? fs.statSync(savedPath).isDirectory()
          ? this.getDirSize(savedPath)
          : fs.statSync(savedPath).size
        : 0,
      targetId: existing?.targetId ?? "admin",
      targetName: existing?.targetName ?? "Admin",
      direction: "incoming",
      status: "done",
      progress: 100,
      savedPath,
      startedAt: existing?.startedAt ?? Date.now(),
    };
    this.transfers.set(transferId, t);
    this.emit();

    if (Notification.isSupported()) {
      new Notification({
        title: "LabSwift — File Received",
        body: `${fileName} has been saved to your LabSwift folder.`,
      }).show();
    }
  }

  updateIncomingProgress(
    transferId: string,
    fileName: string,
    fileSize: number,
    receivedBytes: number
  ) {
    const existing = this.transfers.get(transferId);
    const progress =
      fileSize > 0 ? Math.min(99, Math.round((receivedBytes / fileSize) * 100)) : 0;

    const t: Transfer = existing ?? {
      id: transferId,
      fileName,
      filePath: "",
      fileSize,
      targetId: "admin",
      targetName: "Admin",
      direction: "incoming",
      status: "sending",
      progress: 0,
      startedAt: Date.now(),
    };
    t.fileSize = fileSize;
    t.status = "sending";
    t.progress = progress;
    this.transfers.set(transferId, t);
    this.emit();
  }

  cancelTransfer(transferId: string) {
    const t = this.transfers.get(transferId);
    if (t) {
      t.status = "cancelled";
      this.emit();
    }
  }

  async sendFiles(
    targetIds: string[],
    filePaths: string[],
    adminPassword: string
  ): Promise<{ queued: number }> {
    const store = getStore();
    const peers = (store.get("peers") as Peer[]) ?? [];

    let queued = 0;
    for (const targetId of targetIds) {
      const peer = peers.find((p) => p.id === targetId);
      if (!peer) continue;

      for (const filePath of filePaths) {
        if (!fs.existsSync(filePath)) continue;
        const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const fileName = path.basename(filePath);
        const fileSize = fs.statSync(filePath).size;

        const t: Transfer = {
          id,
          fileName,
          filePath,
          fileSize,
          targetId,
          targetName: peer.name,
          direction: "outgoing",
          status: "pending",
          progress: 0,
          startedAt: Date.now(),
          attempt: 1,
          maxAttempts: this.maxAttempts,
        };
        this.transfers.set(id, t);
        queued++;

        this.sendFile(t, peer, adminPassword).catch(() => {});
      }
    }

    this.emit();
    return { queued };
  }

  /**
   * Send a pre-zipped folder to the target peers.
   * The zip was created in main.ts; we pass along the original folder name
   * so the server side knows what to extract it as.
   */
  async sendFolderZip(
    targetIds: string[],
    zipPath: string,
    originalFolderName: string,
    adminPassword: string
  ): Promise<{ queued: number }> {
    const store = getStore();
    const peers = (store.get("peers") as Peer[]) ?? [];

    let queued = 0;
    for (const targetId of targetIds) {
      const peer = peers.find((p) => p.id === targetId);
      if (!peer) continue;
      if (!fs.existsSync(zipPath)) continue;

      const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const fileName = path.basename(zipPath);
      const fileSize = fs.statSync(zipPath).size;

      const t: Transfer = {
        id,
        fileName,
        // Display the folder name in the UI, not the temp zip name
        filePath: zipPath,
        fileSize,
        targetId,
        targetName: peer.name,
        direction: "outgoing",
        status: "pending",
        progress: 0,
        startedAt: Date.now(),
        attempt: 1,
        maxAttempts: this.maxAttempts,
        isFolder: true,
        originalFolderName,
      };
      // Override fileName for UI display
      t.fileName = `📁 ${originalFolderName}`;
      this.transfers.set(id, t);
      queued++;

      this.sendFile(t, peer, adminPassword).catch(() => {});
    }

    this.emit();
    return { queued };
  }

  async retryTransfer(transferId: string, adminPassword: string): Promise<void> {
    const t = this.transfers.get(transferId);
    if (!t || t.direction !== "outgoing") return;
    const store = getStore();
    const peers = (store.get("peers") as Peer[]) ?? [];
    const peer = peers.find((p) => p.id === t.targetId);
    if (!peer || !fs.existsSync(t.filePath)) return;

    t.status = "pending";
    t.progress = 0;
    t.error = undefined;
    t.attempt = 1;
    this.emit();
    this.sendFile(t, peer, adminPassword).catch(() => {});
  }

  private async sendFile(
    transfer: Transfer,
    peer: Peer,
    adminPassword: string
  ): Promise<void> {
    const maxAttempts = transfer.maxAttempts ?? this.maxAttempts;

    for (let attempt = transfer.attempt ?? 1; attempt <= maxAttempts; attempt++) {
      transfer.attempt = attempt;
      transfer.status = attempt === 1 ? "sending" : "retrying";
      transfer.progress = 0;
      this.updatePowerSaveBlocker();
      this.emit();

      try {
        await this.uploadFile(transfer, peer, adminPassword);
        transfer.status = "done";
        transfer.progress = 100;
        this.emit();
        this.updatePowerSaveBlocker();

        // Clean up temp zip after successful folder transfer
        if (transfer.isFolder && fs.existsSync(transfer.filePath)) {
          try { fs.unlinkSync(transfer.filePath); } catch { /* ignore */ }
        }

        return;
      } catch (err) {
        const current = this.transfers.get(transfer.id);
        if (current?.status === "cancelled") {
          // Clean up temp zip on cancel
          if (transfer.isFolder && fs.existsSync(transfer.filePath)) {
            try { fs.unlinkSync(transfer.filePath); } catch { /* ignore */ }
          }
          this.updatePowerSaveBlocker();
          return;
        }

        const isLastAttempt = attempt >= maxAttempts;
        if (isLastAttempt) {
          transfer.status = "failed";
          transfer.error = String(err);
          this.emit();
          this.updatePowerSaveBlocker();
          return;
        }

        const delay = this.retryDelaysMs[attempt - 1] ?? 5000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        const stillThere = this.transfers.get(transfer.id);
        if (stillThere?.status === "cancelled") {
          this.updatePowerSaveBlocker();
          return;
        }
      }
    }
  }

  private uploadFile(
    transfer: Transfer,
    peer: Peer,
    adminPassword: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileSize = transfer.fileSize;
      // Use the zip file's basename for the Content-Disposition filename
      const fileName = encodeURIComponent(path.basename(transfer.filePath));
      const boundary = `----LabSwiftBoundary${Date.now()}`;

      const header = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
      );
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const totalLength = header.length + fileSize + footer.length;

      const extraHeaders: Record<string, string> = {};
      if (transfer.isFolder && transfer.originalFolderName) {
        extraHeaders["x-is-folder"] = "true";
        extraHeaders["x-folder-name"] = encodeURIComponent(transfer.originalFolderName);
      }

      const options: http.RequestOptions = {
        hostname: peer.host,
        port: peer.port,
        path: "/receive",
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": totalLength,
          "x-admin-password": adminPassword,
          "x-transfer-id": transfer.id,
          ...extraHeaders,
        },
        timeout: 300000,
      };

      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Connection timed out"));
      });

      const checkCancel = setInterval(() => {
        const t = this.transfers.get(transfer.id);
        if (t?.status === "cancelled") {
          clearInterval(checkCancel);
          req.destroy();
          reject(new Error("Cancelled"));
        }
      }, 500);

      req.write(header);

      const fileStream = fs.createReadStream(transfer.filePath);
      let sent = 0;

      fileStream.on("data", (chunk) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        sent += buf.length;
        transfer.progress = Math.round((sent / fileSize) * 100);
        this.emit();
      });

      fileStream.on("end", () => {
        clearInterval(checkCancel);
        req.write(footer);
        req.end();
      });

      fileStream.on("error", (err) => {
        clearInterval(checkCancel);
        reject(err);
      });

      fileStream.pipe(req, { end: false });
    });
  }

  private emit() {
    if (!this.win.isDestroyed()) {
      const all = this.getTransfers();
      this.win.webContents.send("transfers:updated", all);
      this.updateTaskbarProgress(all);
    }
  }

  private updateTaskbarProgress(all: Transfer[]) {
    if (this.win.isDestroyed()) return;
    const active = all.filter(
      (t) => t.status === "sending" || t.status === "retrying"
    );
    if (active.length === 0) {
      this.win.setProgressBar(-1);
      return;
    }
    const avg =
      active.reduce((sum, t) => sum + t.progress, 0) / active.length / 100;
    this.win.setProgressBar(Math.min(0.99, Math.max(0, avg)));
  }

  private updatePowerSaveBlocker() {
    const hasActive = Array.from(this.transfers.values()).some(
      (t) => t.status === "sending" || t.status === "retrying"
    );
    if (hasActive && this.powerSaveBlockerId === null) {
      this.powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
    } else if (!hasActive && this.powerSaveBlockerId !== null) {
      powerSaveBlocker.stop(this.powerSaveBlockerId);
      this.powerSaveBlockerId = null;
    }
  }

  /** Rough size of a directory (sum of all file sizes recursively). */
  private getDirSize(dirPath: string): number {
    let total = 0;
    try {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) total += this.getDirSize(full);
        else if (entry.isFile()) total += fs.statSync(full).size;
      }
    } catch { /* ignore */ }
    return total;
  }
}
