import express from "express";
import multer from "multer";
import http from "http";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import { BrowserWindow } from "electron";
import { app as electronApp } from "electron";
import { getStore } from "./store";
import type { TransferManager } from "./transfers";

let httpServer: http.Server | null = null;

function resolveSavePath(): string {
  const store = getStore();
  const savePath =
    (store.get("savePath") as string) ||
    path.join(electronApp.getPath("downloads"), "LabSwift");
  fs.mkdirSync(savePath, { recursive: true });
  return savePath;
}

class ProgressTrackingStorage implements multer.StorageEngine {
  constructor(private transferManager: TransferManager) {}

  _handleFile(
    req: express.Request,
    file: Express.Multer.File,
    cb: (error?: Error | null, info?: Partial<Express.Multer.File>) => void
  ) {
    const savePath = resolveSavePath();
    const fileName = decodeURIComponent(file.originalname);
    const isFolder = req.headers["x-is-folder"] === "true";
    const diskName = isFolder ? `__ls_folder_${Date.now()}_${fileName}` : fileName;
    const finalPath = path.join(savePath, diskName);
    const transferId = (req.headers["x-transfer-id"] as string) || "";
    const contentLength = Number(req.headers["content-length"] || 0);

    const writeStream = fs.createWriteStream(finalPath);
    let received = 0;

    file.stream.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (transferId) {
        this.transferManager.updateIncomingProgress(transferId, fileName, contentLength, received);
      }
    });

    file.stream.on("error", (err) => { writeStream.destroy(); cb(err); });
    writeStream.on("error", (err) => cb(err));
    writeStream.on("finish", () => {
      cb(null, { path: finalPath, size: writeStream.bytesWritten, destination: savePath, filename: diskName });
    });

    file.stream.pipe(writeStream);
  }

  _removeFile(_req: express.Request, file: Express.Multer.File, cb: (error: Error | null) => void) {
    fs.unlink(file.path, () => cb(null));
  }
}

export async function startServer(
  port: number,
  transferManager: TransferManager,
  win: BrowserWindow
): Promise<void> {
  if (httpServer) await stopServer();

  return new Promise((resolve, reject) => {
    const expressApp = express();
    expressApp.use(express.json());

    const upload = multer({ storage: new ProgressTrackingStorage(transferManager) });

    // Health check — used by active peer polling
    expressApp.get("/health", (_req, res) => {
      res.json({ status: "ok" });
    });

    // ── Remote save-path push (admin → client) ──
    // Admin calls POST /set-save-path on each client to set where files are saved.
    expressApp.post("/set-save-path", (req, res) => {
      const adminPassword = req.headers["x-admin-password"] as string;
      const store = getStore();
      const role = store.get("role") as string;

      // Only clients honour this endpoint; admin ignores it
      if (role === "client") {
        const storedPassword = store.get("adminPassword") as string;
        if (adminPassword !== storedPassword) {
          console.warn(`[LabSwift] /set-save-path rejected: admin password mismatch (from ${req.ip})`);
          res.status(403).json({ error: "Unauthorized" });
          return;
        }

        const { savePath: newPath } = req.body as { savePath: string };
        if (!newPath || typeof newPath !== "string") {
          res.status(400).json({ error: "savePath required" });
          return;
        }

        try {
          fs.mkdirSync(newPath, { recursive: true });
        } catch {
          // Directory may already exist — ignore
        }

        store.set("savePath", newPath);

        // Tell the renderer to refresh its displayed save path
        win.webContents.send("savePath:updated", newPath);
      }

      res.json({ success: true });
    });

    // ── Chat / broadcast message ──
    expressApp.post("/chat", (req, res) => {
      const adminPassword = req.headers["x-admin-password"] as string;
      const store = getStore();
      const role = store.get("role") as string;

      if (role === "client") {
        const storedPassword = store.get("adminPassword") as string;
        if (adminPassword !== storedPassword) {
          console.warn(`[LabSwift] /chat rejected: admin password mismatch (from ${req.ip})`);
          res.status(403).json({ error: "Unauthorized" });
          return;
        }
      }

      const { text, from, at } = req.body as { text: string; from: string; at: number };
      if (!text) { res.status(400).json({ error: "No message text" }); return; }

      win.webContents.send("chat:message", { text, from: from || "Admin", at: at || Date.now() });
      res.json({ success: true });
    });

    // ── Receive file ──
    expressApp.post(
      "/receive",
      upload.single("file"),
      async (req: express.Request, res: express.Response) => {
        const adminPassword = req.headers["x-admin-password"] as string;
        const transferId = req.headers["x-transfer-id"] as string;
        const isFolder = req.headers["x-is-folder"] === "true";
        const originalFolderName = req.headers["x-folder-name"] as string | undefined;

        const displayName = req.file?.originalname
          ? decodeURIComponent(req.file.originalname) : "unknown";
        const fileName = isFolder && originalFolderName ? originalFolderName : displayName;

        const store = getStore();
        const role = store.get("role") as string;

        if (role === "client") {
          const storedPassword = store.get("adminPassword") as string;
          if (adminPassword !== storedPassword) {
            console.warn(`[LabSwift] /receive rejected: admin password mismatch (from ${req.ip})`);
            res.status(403).json({ error: "Unauthorized" });
            return;
          }
        }

        if (!req.file) { res.status(400).json({ error: "No file received" }); return; }

        let savedPath = req.file.path;

        if (isFolder && originalFolderName) {
          const savePath = resolveSavePath();
          const extractTo = path.join(savePath, originalFolderName);
          try {
            const zip = new AdmZip(savedPath);
            zip.extractAllTo(savePath, true);
            fs.unlinkSync(savedPath);
            savedPath = extractTo;
          } catch (err) {
            console.error("[LabSwift] Folder extraction failed:", err);
          }
        }

        transferManager.recordIncoming(transferId, fileName, savedPath);
        win.webContents.send("transfer:received", { id: transferId, fileName, savedPath });
        win.webContents.send("notify:received", fileName);

        res.json({ success: true });
      }
    );

    // Resume support
    expressApp.get("/resume/:transferId", (req, res) => {
      const { transferId } = req.params;
      const store = getStore();
      const incoming = (store.get("incomingTransfers") as Record<string, number>) ?? {};
      res.json({ receivedBytes: incoming[transferId] ?? 0 });
    });

    const server = expressApp.listen(port, () => { httpServer = server; resolve(); });
    server.on("error", (err) => { httpServer = null; reject(err); });
  });
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!httpServer) { resolve(); return; }
    const server = httpServer;
    httpServer = null;
    if (typeof (server as http.Server & { closeAllConnections?: () => void }).closeAllConnections === "function") {
      (server as http.Server & { closeAllConnections?: () => void }).closeAllConnections!();
    }
    server.close(() => resolve());
    setTimeout(() => resolve(), 3000);
  });
}
