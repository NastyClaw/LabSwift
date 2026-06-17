import express from "express";
import multer from "multer";
import http from "http";
import path from "path";
import fs from "fs";
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
 * Custom multer storage engine. multer's built-in diskStorage only reports
 * a file once it's fully written, which meant incoming transfers showed no
 * real-time percentage. This implements the same StorageEngine contract
 * (`_handleFile`/`_removeFile`) but reports bytes as they arrive so the UI
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
    const finalPath = path.join(savePath, fileName);
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
        filename: fileName,
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
  const expressApp = express();
  expressApp.use(express.json());

  const upload = multer({ storage: new ProgressTrackingStorage(transferManager) });

  // Health check
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
      const fileName = req.file?.originalname
        ? decodeURIComponent(req.file.originalname)
        : "unknown";

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

      const savedPath = req.file.path;
      transferManager.recordIncoming(transferId, fileName, savedPath);

      // Notify UI
      win.webContents.send("transfer:received", {
        id: transferId,
        fileName,
        savedPath,
      });

      // System notification (works even on locked screen via Electron)
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

  httpServer = expressApp.listen(port);
}

export function stopServer() {
  httpServer?.close();
}
