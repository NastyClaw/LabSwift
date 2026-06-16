import { BrowserWindow, Notification } from "electron";
import fs from "fs";
import http from "http";
import path from "path";
import { getStore } from "./store";
import type { Peer } from "./main";

export type TransferStatus =
  | "pending"
  | "sending"
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
}

export class TransferManager {
  private transfers: Map<string, Transfer> = new Map();
  private win: BrowserWindow;

  constructor(win: BrowserWindow) {
    this.win = win;
  }

  getTransfers(): Transfer[] {
    return Array.from(this.transfers.values()).sort(
      (a, b) => b.startedAt - a.startedAt
    );
  }

  recordIncoming(transferId: string, fileName: string, savedPath: string) {
    const t: Transfer = {
      id: transferId,
      fileName,
      filePath: savedPath,
      fileSize: fs.existsSync(savedPath) ? fs.statSync(savedPath).size : 0,
      targetId: "admin",
      targetName: "Admin",
      direction: "incoming",
      status: "done",
      progress: 100,
      savedPath,
      startedAt: Date.now(),
    };
    this.transfers.set(transferId, t);
    this.emit();

    // Show OS notification even on locked screen
    if (Notification.isSupported()) {
      new Notification({
        title: "LabSwift — File Received",
        body: `${fileName} has been saved to your LabSwift folder.`,
      }).show();
    }
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
        };
        this.transfers.set(id, t);
        queued++;

        // Send asynchronously
        this.sendFile(t, peer, adminPassword).catch(() => {});
      }
    }

    this.emit();
    return { queued };
  }

  private async sendFile(
    transfer: Transfer,
    peer: Peer,
    adminPassword: string
  ): Promise<void> {
    transfer.status = "sending";
    this.emit();

    try {
      await this.uploadFile(transfer, peer, adminPassword);
      transfer.status = "done";
      transfer.progress = 100;
    } catch (err) {
      const t = this.transfers.get(transfer.id);
      if (t?.status === "cancelled") return;
      transfer.status = "failed";
      transfer.error = String(err);
    }

    this.emit();
  }

  private uploadFile(
    transfer: Transfer,
    peer: Peer,
    adminPassword: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileSize = transfer.fileSize;
      const fileName = encodeURIComponent(transfer.fileName);
      const boundary = `----LabSwiftBoundary${Date.now()}`;

      const header = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
      );
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const totalLength = header.length + fileSize + footer.length;

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

      // Check if cancelled
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
      this.win.webContents.send("transfers:updated", this.getTransfers());
    }
  }
}
