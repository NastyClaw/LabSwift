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

export async function startServer(
  port: number,
  transferManager: TransferManager,
  win: BrowserWindow
): Promise<void> {
  const expressApp = express();
  expressApp.use(express.json());

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const store = getStore();
        const savePath =
          (store.get("savePath") as string) ||
          path.join(electronApp.getPath("downloads"), "LabSwift");
        fs.mkdirSync(savePath, { recursive: true });
        cb(null, savePath);
      },
      filename: (_req, file, cb) => {
        const decodedName = decodeURIComponent(file.originalname);
        cb(null, decodedName);
      },
    }),
  });

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
