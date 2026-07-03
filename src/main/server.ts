import express from "express";
import multer from "multer";
import http from "http";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import AdmZip from "adm-zip";
import { BrowserWindow } from "electron";
import { app as electronApp } from "electron";
import { getStore } from "./store";
import { getPeerId } from "./discovery";
import type { TransferManager } from "./transfers";
import {
  MAX_FILE_SIZE_BYTES,
  DEFAULT_BLOCKED_EXTENSIONS,
  getExtension,
} from "./constants";

let httpServer: http.Server | null = null;

// Per-IP failed-auth tracking for brute-force protection.
const failedAuthAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_AUTH_FAILURES = 10;
const AUTH_WINDOW_MS = 60_000;

function resolveSavePath(): string {
  const store = getStore();
  const savePath =
    (store.get("savePath") as string) ||
    path.join(electronApp.getPath("downloads"), "LabSwift");
  fs.mkdirSync(savePath, { recursive: true });
  return savePath;
}

/**
 * Sanitise an untrusted filename so it can never escape the save directory.
 * We strip all directory separators and path-traversal components, keeping
 * only the base name. The return value is a plain filename with no slashes.
 */
function sanitizeFileName(raw: string): string {
  // Decode any URL-encoding first so %2F / %5C tricks are caught.
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    name = raw;
  }
  // Take the basename only, normalise both sep styles.
  name = path.basename(name.replace(/\\/g, "/"));
  // Strip leading dots that could make hidden files on Unix hosts.
  name = name.replace(/^\.+/, "") || "file";
  return name;
}

/**
 * Sanitise an untrusted folder name used for zip extraction.
 * Same rules: no path traversal, only a single directory-name component.
 */
function sanitizeFolderName(raw: string): string {
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    name = raw;
  }
  name = path.basename(name.replace(/\\/g, "/"));
  name = name.replace(/^\.+/, "") || "folder";
  return name;
}

/**
 * Validate a password supplied in a request header against the stored value.
 * Returns null on success, an error string on failure.
 * Also enforces a per-IP rate limit to slow brute-force attempts.
 */
function validateAuth(ip: string, supplied: string, stored: string): string | null {
  const now = Date.now();
  const record = failedAuthAttempts.get(ip);

  if (record && now < record.resetAt && record.count >= MAX_AUTH_FAILURES) {
    return "Too many failed attempts — please wait a minute";
  }

  if (supplied !== stored) {
    if (!record || now >= record.resetAt) {
      failedAuthAttempts.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    } else {
      record.count++;
    }
    return "Incorrect admin password";
  }

  // Success — clear any failure record for this IP
  failedAuthAttempts.delete(ip);
  return null;
}

/**
 * Check file size and extension against current security policy.
 * Returns an error string if the file should be rejected, null if it's fine.
 */
function checkFilePolicy(
  fileName: string,
  fileSize: number,
  extensionFilter: boolean
): string | null {
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    const mb = (fileSize / (1024 * 1024)).toFixed(1);
    return `File too large (${mb} MB — limit is 200 MB)`;
  }

  if (extensionFilter) {
    const ext = getExtension(fileName);
    if (DEFAULT_BLOCKED_EXTENSIONS.includes(ext)) {
      return `File type not allowed: ${ext || "(no extension)"}`;
    }
  }

  return null;
}

/**
 * Run Windows Defender CLI scan on a single file.
 * Resolves with { clean: true } if safe, { clean: false, detail } if threat detected.
 * Resolves with { clean: true, skipped: true } if Defender is unavailable.
 */
function defenderScan(filePath: string): Promise<{ clean: boolean; detail?: string; skipped?: boolean }> {
  const mpcmdrun =
    "C:\\Program Files\\Windows Defender\\MpCmdRun.exe";

  if (!fs.existsSync(mpcmdrun)) {
    return Promise.resolve({ clean: true, skipped: true });
  }

  return new Promise((resolve) => {
    execFile(
      mpcmdrun,
      ["-Scan", "-ScanType", "3", "-File", filePath, "-DisableRemediation"],
      { timeout: 30_000 },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve({ clean: true });
        } else {
          // MpCmdRun exits with 2 when a threat is found
          const detail = stderr?.trim() || "Potential threat detected by Windows Defender";
          resolve({ clean: false, detail });
        }
      }
    );
  });
}

class ProgressTrackingStorage implements multer.StorageEngine {
  constructor(private transferManager: TransferManager) {}

  _handleFile(
    req: express.Request,
    file: Express.Multer.File,
    cb: (error?: Error | null, info?: Partial<Express.Multer.File>) => void
  ) {
    const savePath = resolveSavePath();
    const rawName = file.originalname;
    const isFolder = req.headers["x-is-folder"] === "true";
    const safeBase = sanitizeFileName(rawName);
    const diskName = isFolder ? `__ls_folder_${Date.now()}_${safeBase}` : safeBase;

    // Confirm the resolved path is still inside savePath (belt-and-suspenders)
    const finalPath = path.resolve(savePath, diskName);
    if (!finalPath.startsWith(path.resolve(savePath))) {
      cb(new Error("Path traversal detected — file rejected"));
      return;
    }

    const transferId = (req.headers["x-transfer-id"] as string) || "";
    const contentLength = Number(req.headers["content-length"] || 0);

    const writeStream = fs.createWriteStream(finalPath);
    let received = 0;

    file.stream.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (transferId) {
        this.transferManager.updateIncomingProgress(transferId, safeBase, contentLength, received);
      }
    });

    file.stream.on("error", (err) => { writeStream.destroy(); cb(err); });
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

    const upload = multer({
      storage: new ProgressTrackingStorage(transferManager),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    });

    // ── Health / identity check ─────────────────────────────────────────────
    // Now returns the peer's id so health pollers can detect identity changes
    // (e.g. after a client resets and regenerates their peerId while keeping
    // the same IP address).
    expressApp.get("/health", (_req, res) => {
      res.json({ status: "ok", id: getPeerId() });
    });

    // ── Auth middleware helper ──────────────────────────────────────────────
    // All mutating endpoints require the admin password, regardless of whether
    // this instance is admin or client. Previously admin-role machines had no
    // auth on incoming requests — that gap is now closed.
    const requireAuth = (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const store = getStore();
      const storedPassword = store.get("adminPassword") as string;
      const supplied = req.headers["x-admin-password"] as string;
      const ip = req.ip ?? "unknown";

      if (!storedPassword) {
        // Setup not completed yet — block all requests
        res.status(503).json({ error: "Server not configured" });
        return;
      }

      const err = validateAuth(ip, supplied, storedPassword);
      if (err) {
        console.warn(`[LabSwift] Auth rejected on ${req.path} from ${ip}: ${err}`);
        res.status(403).json({ error: err });
        return;
      }

      next();
    };

    // ── Remote save-path push (admin → client) ──────────────────────────────
    expressApp.post("/set-save-path", requireAuth, (req, res) => {
      const store = getStore();
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
      win.webContents.send("savePath:updated", newPath);
      res.json({ success: true });
    });

    // ── Chat / broadcast message ────────────────────────────────────────────
    expressApp.post("/chat", requireAuth, (req, res) => {
      const { text, from, at } = req.body as { text: string; from: string; at: number };
      if (!text) { res.status(400).json({ error: "No message text" }); return; }

      win.webContents.send("chat:message", { text, from: from || "Admin", at: at || Date.now() });
      res.json({ success: true });
    });

    // ── Remote lock screen ──────────────────────────────────────────────────
    expressApp.post("/lock", requireAuth, (_req, res) => {
      win.webContents.send("lock:engage");
      res.json({ success: true });
    });

    // ── Remote unlock screen ────────────────────────────────────────────────
    expressApp.post("/unlock", requireAuth, (_req, res) => {
      win.webContents.send("lock:release");
      res.json({ success: true });
    });

    // ── Receive file ────────────────────────────────────────────────────────
    expressApp.post(
      "/receive",
      requireAuth,
      upload.single("file"),
      async (req: express.Request, res: express.Response) => {
        if (!req.file) { res.status(400).json({ error: "No file received" }); return; }

        const store = getStore();
        const extensionFilter = store.get("extensionFilter") !== false; // default true
        const malwareScan   = store.get("malwareScan") !== false;       // default true

        const transferId        = (req.headers["x-transfer-id"] as string) || "";
        const isFolder          = req.headers["x-is-folder"] === "true";
        const rawFolderName     = req.headers["x-folder-name"] as string | undefined;

        const safeFileName   = sanitizeFileName(req.file.originalname);
        const safeFolderName = rawFolderName ? sanitizeFolderName(rawFolderName) : undefined;
        const displayName    = isFolder && safeFolderName ? safeFolderName : safeFileName;

        // ── Policy checks ─────────────────────────────────────────────────
        const policyErr = checkFilePolicy(safeFileName, req.file.size, extensionFilter);
        if (policyErr) {
          fs.unlink(req.file.path, () => {});
          console.warn(`[LabSwift] File rejected (policy): ${policyErr}`);
          res.status(422).json({ error: policyErr });
          return;
        }

        // ── Malware scan (Windows Defender CLI) ───────────────────────────
        if (malwareScan) {
          const scan = await defenderScan(req.file.path);
          if (!scan.clean) {
            fs.unlink(req.file.path, () => {});
            console.warn(`[LabSwift] File quarantined: ${scan.detail}`);
            win.webContents.send("notify:threat", { fileName: displayName, detail: scan.detail });
            res.status(422).json({ error: `Threat detected: ${scan.detail}` });
            return;
          }
        }

        // ── Zip extraction for folder transfers ───────────────────────────
        let savedPath = req.file.path;

        if (isFolder && safeFolderName) {
          const savePath = resolveSavePath();
          const extractTo = path.resolve(savePath, safeFolderName);

          // Path traversal check on the folder destination too
          if (!extractTo.startsWith(path.resolve(savePath))) {
            fs.unlink(req.file.path, () => {});
            res.status(422).json({ error: "Invalid folder name" });
            return;
          }

          try {
            const zip = new AdmZip(savedPath);
            const entries = zip.getEntries();

            // Validate every entry inside the zip before extracting
            for (const entry of entries) {
              const entryPath = path.resolve(savePath, entry.entryName);
              if (!entryPath.startsWith(path.resolve(savePath))) {
                fs.unlink(savedPath, () => {});
                res.status(422).json({ error: "Zip contains path-traversal entry" });
                return;
              }
              if (extensionFilter && !entry.isDirectory) {
                const entryExt = getExtension(entry.name);
                if (DEFAULT_BLOCKED_EXTENSIONS.includes(entryExt)) {
                  fs.unlink(savedPath, () => {});
                  res.status(422).json({ error: `Zip contains blocked file type: ${entryExt}` });
                  return;
                }
              }
            }

            zip.extractAllTo(savePath, true);
            fs.unlinkSync(savedPath);
            savedPath = extractTo;
          } catch (err) {
            console.error("[LabSwift] Folder extraction failed:", err);
          }
        }

        transferManager.recordIncoming(transferId, displayName, savedPath);
        win.webContents.send("transfer:received", { id: transferId, fileName: displayName, savedPath });
        win.webContents.send("notify:received", displayName);

        res.json({ success: true });
      }
    );

    // ── Resume support ──────────────────────────────────────────────────────
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
