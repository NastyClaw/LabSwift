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

/**
 * Custom multer storage engine — reports bytes as they arrive so the UI
 * can show a live percentage on the receiving side too.
 */
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
    // For folder transfers we save the zip to a temp name and extract after
    const diskName = isFolder ? `__ls_folder_${Date.now()}_${fileName}` : fileName;
    const finalPath = path.join(savePath, diskName);
    const transferId = (req.headers["x-transfer-id"] as string) || "";
    const contentLength = Number(req.headers["content-length"] || 0);

    const writeStream = fs.createWriteStream(finalPath);
    let received = 0;

    file.stream.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (transferId) {
        this.transferManager.updateIncomingProgress(
          transferId,
          fileName,
          contentLength,
          received
        );
      }
    });

    file.stream.on("error", (err) => {
      writeStream.destroy();
      cb(err);
    });

    writeStream.on("error", (err) => cb(err));
    writeStream.on("finish", () => {
      cb(null, {
        path: finalPath,
        size: writeStream.bytesWritten,
        destination: savePath,
        filename: diskName,
      });
    });

    file.stream.pipe(writeStream);
  }

  _removeFile(
    _req: express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null) => void
  ) {
    fs.unlink(file.path, () => cb(null));
  }
}

export async function startServer(
  port: number,
  transferManager: TransferManager,
  win: BrowserWindow
): Promise<void> {
  // If a server is already running on this port (e.g. after a failed teardown),
  // close it first before binding a new one.
  if (httpServer) {
    await stopServer();
  }

  return new Promise((resolve, reject) => {
    const expressApp = express();
    expressApp.use(express.json());

    const upload = multer({ storage: new ProgressTrackingStorage(transferManager) });

    // Health check — used by peers' active polling to confirm reachability
    expressApp.get("/health", (_req, res) => {
      res.json({ status: "ok" });
    });

    // Receive file (client endpoint)
    expressApp.post(
      "/receive",
      upload.single("file"),
      async (req: express.Request, res: express.Response) => {
        const adminPassword = req.headers["x-admin-password"] as string;
        const transferId = req.headers["x-transfer-id"] as string;
        const isFolder = req.headers["x-is-folder"] === "true";
        const originalFolderName = req.headers["x-folder-name"] as string | undefined;

        const displayName = req.file?.originalname
          ? decodeURIComponent(req.file.originalname)
          : "unknown";
        const fileName = isFolder && originalFolderName
          ? originalFolderName
          : displayName;

        // Verify password
        const store = getStore();
        const role = store.get("role") as string;

        if (role === "client") {
          const storedPassword = store.get("adminPassword") as string;
          if (adminPassword !== storedPassword) {
            res.status(403).json({ error: "Unauthorized" });
            return;
          }
        }

        if (!req.file) {
          res.status(400).json({ error: "No file received" });
          return;
        }

        let savedPath = req.file.path;

        // ── Folder extraction ──
        if (isFolder && originalFolderName) {
          const savePath = resolveSavePath();
          const extractTo = path.join(savePath, originalFolderName);
          try {
            const zip = new AdmZip(savedPath);
            zip.extractAllTo(savePath, true); // overwrites existing files
            fs.unlinkSync(savedPath); // remove temp zip
            savedPath = extractTo;
          } catch (err) {
            console.error("[LabSwift] Folder extraction failed:", err);
            // Fall through — savedPath is still the zip, which is better than nothing
          }
        }

        transferManager.recordIncoming(transferId, fileName, savedPath);

        win.webContents.send("transfer:received", {
          id: transferId,
          fileName,
          savedPath,
        });

        win.webContents.send("notify:received", fileName);

        res.json({ success: true });
      }
    );

    // Resume support: check what chunks we have
    expressApp.get("/resume/:transferId", (req, res) => {
      const { transferId } = req.params;
      const store = getStore();
      const incoming = (store.get("incomingTransfers") as Record<string, number>) ?? {};
      res.json({ receivedBytes: incoming[transferId] ?? 0 });
    });

    const server = expressApp.listen(port, () => {
      httpServer = server;
      resolve();
    });

    server.on("error", (err) => {
      httpServer = null;
      reject(err);
    });
  });
}

/**
 * Gracefully stop the HTTP server and wait for it to fully release the port.
 * Returns a Promise so callers can await port release (critical for reset).
 */
export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!httpServer) {
      resolve();
      return;
    }

    const server = httpServer;
    httpServer = null;

    // Force-close any lingering keep-alive connections (Node 18.2+)
    if (typeof (server as http.Server & { closeAllConnections?: () => void }).closeAllConnections === "function") {
      (server as http.Server & { closeAllConnections?: () => void }).closeAllConnections!();
    }

    server.close(() => resolve());

    // Safety timeout: if close() never fires (active transfers), resolve anyway
    setTimeout(() => resolve(), 3000);
  });
}
